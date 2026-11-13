import type { Board, Lane, OpenBranch, StationId } from '../types'
import { NAMES } from './draw'
import {
  C, FAR_BEHIND, STATION_TONE, TONE, WIDE_HEIGHT, agoOf, branchIn, clashInk, clashMark, clashOf, clashSummary, esc, fit, fitMono, frame, isMadeUpName,
  laneColours, laneTile, line as textLine, liveWords, monoWidth, text, widthOf,
} from './lanes'
import type { Piece } from './lanes'

/** Words with their first letter raised, to start a line. */
const capital = (words: string): string => words.charAt(0).toUpperCase() + words.slice(1)

// The spine view, round 2: the lane tree. Main is the trunk; each lane joins it
// with its tile, name, live release and UAT state, and its open branches hang
// under it, newest first, each said by what it is for (its newest commit's
// subject) before its name. Tall, main runs down the left; wide, along the top
// with the lanes hanging from it as columns. Claude has a full ring at the top
// (tall) or the left (wide). There is no legend and no explaining text.
//
// Lane order (Jake's pick, rule c): closest to main first, by the fewest commits
// behind among a lane's branches; a tie goes to the lane that moved last. Parked
// lanes, then the branches in no lane, always close the list. Within a lane,
// branches are newest first.

type Here = Extract<NonNullable<Board['repo']>, { kind: 'repo' }>
type Item = { b: OpenBranch; lane?: Lane; colour: string; isYours: boolean }
type Group = { lane: Lane; colour: string; rows: Item[]; isLoose: boolean; moved: number; nearest: number }

const STATIONS: StationId[] = ['you', 'model', 'memory', 'files', 'shell', 'network', 'browser', 'agents', 'skills', 'hooks']
const LOOSE: Lane = { name: 'No lane', branches: 0, isHere: false }
const MERGED_ICON = '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`
const hair = (x1: number, x2: number, y: number): string => `<path d="M${x1} ${y + 0.5}H${x2}" fill="none" stroke="${C.line}" stroke-width="1"/>`
const mergedWords = (here: Here): string => (here.merged === undefined || here.merged === 0 ? 'No merged branches' : `${plural(here.merged, 'merged branch', 'merged branches')}`)
const merged = (here: Here, x: number, y: number, size: number): string =>
  `<g transform="translate(${x} ${y - 12}) scale(${(size / 18).toFixed(4)})" fill="none" stroke="${C.muted}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${MERGED_ICON}</g>` +
  text(x + 22, y, esc(mergedWords(here)), { size })

/**
 * What a branch is for, from its newest commit: a merge's own words after the
 * colon, without a lane's name in front, starting with a capital. Its name where
 * there is no subject.
 */
function describe(b: OpenBranch, laneNames: readonly string[]): string {
  const subject = b.subject?.trim() ?? ''
  if (subject === '') return b.name
  let words = subject.replace(/^Merge [^:]+: /, '')
  for (const name of laneNames) if (words.toLowerCase().startsWith(`${name.toLowerCase()}: `)) words = words.slice(name.length + 2)
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** How far behind main, in words and a tone, only where it matters: 20 or more, red from FAR_BEHIND. */
const behindWords = (b: OpenBranch): { words: string; ink: string } | undefined =>
  b.behind >= FAR_BEHIND ? { words: `${b.behind} behind`, ink: TONE.danger.ink } : b.behind >= 20 ? { words: `${b.behind} behind`, ink: TONE.warn.ink } : undefined

/** A lane's release state in a few words: what UAT holds against live. */
function uatWords(lane: Lane): string {
  if (lane.isParked === true) return 'parked'
  if (lane.isStagingLive === true) return 'UAT same as live'
  if (lane.staging === undefined) return 'no UAT yet'
  return lane.staging.behind > 0 ? `UAT ${lane.staging.behind} behind` : 'UAT ahead of live'
}

/** A small pill holding a live tag, tinted in its lane's colour, starting at `x`. Returns the drawing and its right edge. */
function livePill(x: number, cy: number, tag: string, colour: string, most = 140): { svg: string; right: number } {
  const words = fitMono(liveWords(tag), most)
  const w = Math.ceil(monoWidth(words) + 16)
  return {
    right: x + w,
    svg:
      `<rect x="${x + 0.5}" y="${cy - 9.5}" width="${w - 1}" height="19" rx="9.5" fill="${colour}" fill-opacity="0.12" stroke="${colour}" stroke-opacity="0.45"/>` +
      text(x + w / 2, cy + 4, esc(words), { font: 'mono', anchor: 'middle', fill: C.text }),
  }
}

/** Text wrapped to a width over at most `most` lines, the last one cut. */
function wrap(words: string, width: number, size: number, most: number): string[] {
  const lines: string[] = []
  let rest = words.split(' ')
  while (rest.length > 0 && lines.length < most) {
    let take = 1
    while (take < rest.length && widthOf(rest.slice(0, take + 1).join(' '), size) <= width) take += 1
    let line = rest.slice(0, take).join(' ')
    rest = rest.slice(take)
    if (lines.length === most - 1 && rest.length > 0) line = `${line} ${rest.join(' ')}`
    lines.push(fit(line, width, size))
  }

  return lines
}

/** Every open branch, with its lane and colour; yours is marked, to be drawn in copper in its own lane. */
function itemsOf(here: Here): Item[] {
  const colours = laneColours(here.lanes ?? [])
  const seen = new Set<string>()
  const out: Item[] = []
  for (const lane of here.lanes ?? []) {
    for (const b of lane.open ?? []) {
      if (seen.has(b.name)) continue
      seen.add(b.name)
      out.push({ b, lane, colour: colours.get(lane) ?? C.muted, isYours: b.name === here.branch })
    }
  }
  for (const b of here.loose ?? []) {
    if (seen.has(b.name)) continue
    seen.add(b.name)
    out.push({ b, colour: C.muted, isYours: b.name === here.branch })
  }

  return out
}

/** Whether a branch carries a subject to lead with; without one its name is said once. */
const hasSubject = (b: OpenBranch): boolean => (b.subject?.trim() ?? '') !== ''

/** Each lane with its open branches, newest first, then the branches in no lane as a group of their own. */
function groupsOf(here: Here): Group[] {
  const colours = laneColours(here.lanes ?? [])
  const all = itemsOf(here)
  const make = (lane: Lane, colour: string, rows: Item[], isLoose: boolean): Group => ({
    lane,
    colour,
    rows: [...rows].sort((a, z) => z.b.updatedAt - a.b.updatedAt),
    isLoose,
    moved: Math.max(0, ...rows.map(i => i.b.updatedAt), ...(isLoose ? [] : (lane.releases ?? []).map(r => r.at)), isLoose ? 0 : lane.staging?.updatedAt ?? 0),
    nearest: rows.length === 0 ? Infinity : Math.min(...rows.map(i => i.b.behind)),
  })
  const out = (here.lanes ?? []).map(lane => make(lane, colours.get(lane) ?? C.muted, all.filter(i => i.lane === lane), false))
  const loose = all.filter(i => i.lane === undefined)
  if (loose.length > 0) out.push(make(LOOSE, C.muted, loose, true))

  return out
}

/** Rule (c): closest to main first, a tie to the lane that moved last; parked lanes, then branches in no lane, last. */
function ordered(groups: Group[]): Group[] {
  const tail = (g: Group): number => (g.isLoose ? 2 : g.lane.isParked === true ? 1 : 0)
  return [...groups].sort((a, z) => tail(a) - tail(z) || a.nearest - z.nearest || z.moved - a.moved)
}

/** Your own branch's entry, for its subject. */
const yourEntry = (here: Here): OpenBranch | undefined =>
  (here.lanes ?? []).flatMap(lane => lane.open ?? []).find(b => b.name === here.branch) ?? (here.loose ?? []).find(b => b.name === here.branch)

/** What you are on, in the words that say most: main, a chosen branch name, or for a made-up name its subject. */
function youAreOn(here: Here, laneNames: readonly string[]): { words: string; isMono: boolean } {
  if (here.trunk === undefined) return { words: (here.trunkRef ?? 'main').replace(/^origin\//, ''), isMono: true }
  const entry = yourEntry(here)
  if (entry?.subject !== undefined && entry.subject.trim() !== '' && isMadeUpName(here.branch)) return { words: describe(entry, laneNames), isMono: false }
  return { words: here.branch, isMono: true }
}

/** What is waiting to be committed, in plain words. */
const workWords = (here: Here): string => (here.dirty > 0 ? `${plural(here.dirty, 'file')} not committed` : 'nothing to commit')

/** "You are on main · 3 files changed since the last commit", on one line in `w`, or two where `twoLines`. */
function youLine(here: Here, laneNames: readonly string[], x: number, y: number, w: number, twoLines = false): string {
  const on = youAreOn(here, laneNames)
  const room = twoLines ? w - widthOf('You are on ', 12) : Math.min(220, w - widthOf('You are on ', 12) - 80)
  // branchIn measures mono at 11 px; this line is 12, so its room is scaled to match.
  const name = on.isMono ? branchIn(on.words, (room * 11) / 12) : fit(on.words, room, 12)
  const work = workWords(here)
  if (twoLines) {
    return youHead(on, name, x, y) + text(x, y + 17, esc(fit(work.charAt(0).toUpperCase() + work.slice(1), w, 12)), { size: 12, fill: here.dirty > 0 ? C.text : C.muted })
  }
  const used = widthOf('You are on ', 12) + (on.isMono ? monoWidth(name, 12) : widthOf(name, 12))
  // A text's leading space is dropped when drawn, so the gap before the dot is placed, not typed.
  const tail = fit(`· ${work}`, w - used - 4, 12)
  return youHead(on, name, x, y) + (tail === '…' ? '' : text(x + used + 4, y, esc(tail), { size: 12, fill: here.dirty > 0 ? C.text : C.muted }))
}

/** "You are on" and the name, as two texts so each is measured and drawn in its own face. */
function youHead(on: { isMono: boolean }, name: string, x: number, y: number): string {
  const lead = widthOf('You are on ', 12)
  return text(x, y, 'You are on', { size: 12 }) + text(x + lead, y, esc(name), { font: on.isMono ? 'mono' : 'sans', size: 12, fill: C.hl })
}

/**
 * Claude's ring: Claude in the middle, its ten stations round it (coloured once
 * used this turn, silk while running), with clear room round the whole ring.
 */
function ring(b: Board, cx: number, cy: number): string {
  let out = `<circle cx="${cx}" cy="${cy}" r="42" fill="none" stroke="${C.nodeLine}" stroke-dasharray="2 4"/>`
  if (b.isWorking) out += `<circle cx="${cx}" cy="${cy}" r="28" fill="none" stroke="${C.ring}" stroke-width="4"/>`
  out += `<circle cx="${cx}" cy="${cy}" r="25.5" fill="${C.node}" stroke="${b.isWorking ? C.accent : C.nodeLine}" stroke-width="1.5"/>`
  out += text(cx, cy + 3.5, 'CLAUDE', { font: 'mono', size: 9.5, weight: 500, spacing: 1, anchor: 'middle', fill: C.text })
  STATIONS.forEach((id, at) => {
    const a = -Math.PI / 2 + (at * 2 * Math.PI) / STATIONS.length
    const px = (cx + 42 * Math.cos(a)).toFixed(1)
    const py = (cy + 42 * Math.sin(a)).toFixed(1)
    const isLive = (b.live[id] ?? 0) > 0
    const tone = STATION_TONE[id] ?? C.muted
    const isUsed = (b.counts[id] ?? 0) > 0
    out += isLive
      ? `<circle cx="${px}" cy="${py}" r="9" fill="none" stroke="${C.ring}" stroke-width="4"/><circle cx="${px}" cy="${py}" r="6" fill="${C.accent}"/>`
      : `<circle cx="${px}" cy="${py}" r="5" fill="${isUsed ? tone : C.node}" stroke="${isUsed ? tone : C.nodeLine}" stroke-width="1.5"/>`
  })

  return out
}

/** What Claude is doing, in a few words. */
function doingWords(b: Board): string {
  const running = [...b.rows].reverse().find(r => r.status === 'run')
  return running !== undefined ? running.label : b.isWorking ? 'Thinking' : 'Waiting for you'
}

/** The model, context and call count, in mono. */
function metaWords(b: Board, withCalls: boolean): string {
  const model = b.model === undefined ? '' : b.model.replace(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?.*$/, (_m, n: string, major: string, minor?: string) => `${n} ${major}${minor === undefined ? '' : `.${minor}`}`)
  return [model, b.context === undefined ? '' : `context ${Math.round(b.context)}%`, withCalls ? plural(b.calls, 'call') : ''].filter(s => s !== '').join(' · ')
}

/** Claude's band across the top of the tall spine: the ring, and beside it what it is doing and the busy stations. */
function claudeBand(b: Board, x: number, y: number, w: number): string {
  // The ring with its station halos takes 102 px; it sits 10 px inside the band on every side.
  const cx = x + 61
  const cy = y + 61
  let out = ring(b, cx, cy)
  const tx = x + 132
  out += text(tx, y + 36, esc(fit(doingWords(b), w - 132, 14, 600)), { size: 14, weight: 600, fill: C.text })
  out += text(tx, y + 55, esc(fitMono(metaWords(b, true), w - 132)), { font: 'mono' })
  // The busy stations as coloured words, running first then by count, in the room beside the ring.
  const busy = STATIONS.filter(id => (b.counts[id] ?? 0) > 0 || (b.live[id] ?? 0) > 0)
    .sort((a, z) => Number((b.live[z] ?? 0) > 0) - Number((b.live[a] ?? 0) > 0) || (b.counts[z] ?? 0) - (b.counts[a] ?? 0))
  let sx = tx
  let sy = y + 82
  for (const id of busy) {
    const isLive = (b.live[id] ?? 0) > 0
    const words = `${NAMES[id]} ${b.counts[id] ?? 0}`
    const wd = 12 + widthOf(words) + 14
    if (sx + wd > x + w) {
      sx = tx
      sy += 20
    }
    if (sy > y + 102) break
    out += `<circle cx="${sx + 4}" cy="${sy - 4}" r="4" fill="${isLive ? C.accent : STATION_TONE[id] ?? C.muted}"/>`
    out += text(sx + 12, sy, esc(words), { fill: isLive ? C.text : C.muted })
    sx += wd
  }

  return out
}

/** Tall: Claude across the top, where you are, then main down the left with each lane joining it and its branches under it. */
function treeTall(b: Board, here: Here, now: number): string {
  const W = 440
  const laneNames = (here.lanes ?? []).map(l => l.name)
  // Claude's band: 122 px, the ring clear of the band's edges and of the hairline under it.
  let out = claudeBand(b, 16, 18, W - 32) + hair(16, 424, 144)
  out += youLine(here, laneNames, 16, 170, W - 32)
  // Your branch's clash, on its own line under where you are, in its tone; main moves down to make room.
  const yours = clashOf(here, here.branch, here.clash)
  if (yours !== undefined) out += clashMark(21, 183, yours.level) + text(32, 187, esc(fit(capital(yours.words), W - 32 - 16, 12)), { size: 12, fill: yours.ink })
  const trunkX = 26
  let y = yours === undefined ? 194 : 210
  out += `<circle cx="${trunkX}" cy="${y + 8}" r="9" fill="${C.canvas}" stroke="${C.accent}" stroke-width="2"/>`
  out += text(46, y + 13, 'main', { font: 'mono', size: 14, weight: 500, fill: C.text })
  // The clash summary on main's row, at the right: nothing when clean.
  const summary = clashSummary(here.clashes)
  const summaryW = summary.reduce((n, p) => n + widthOf(p.words, 12), 0)
  if (summary.length > 0) out += textLine(424 - summaryW, y + 13, summary, summaryW + 1, 12)
  y += 38
  const trunkTop = y - 21
  let lastJoin = trunkTop
  const groups = ordered(groupsOf(here))
  if (groups.length === 0) {
    out += text(46, y + 6, 'No lanes and no open branches', { size: 12 })
    y += 22
  }
  for (const g of groups) {
    const cy = y + 16
    lastJoin = cy - 12
    out += `<g${g.lane.isParked === true ? ' opacity="0.5"' : ''}>`
    out += `<path d="M${trunkX} ${cy - 14}Q${trunkX} ${cy} ${trunkX + 14} ${cy}H42" fill="none" stroke="${g.colour}" stroke-width="2.25"/>`
    out += laneTile(g.lane, 44, cy - 13, 26, g.colour)
    // The live release on the right; the name, and when the lane last moved, in the room it leaves.
    const pill = g.lane.live === undefined ? undefined : livePill(0, cy - 4, g.lane.live, g.colour, 150)
    const pillW = pill === undefined ? 0 : pill.right
    if (g.lane.live !== undefined) out += livePill(424 - pillW, cy - 4, g.lane.live, g.colour, 150).svg
    out += text(80, cy + 1, esc(fit(g.lane.name, 424 - 80 - pillW - 12, 15, 600)), { size: 15, weight: 600, fill: C.text })
    const join = g.moved === 0 ? '' : `moved ${agoOf(g.moved, now)}`
    const joinW = join === '' ? 0 : monoWidth(join) + 12
    const sub = g.isLoose ? 'not in any lane yet' : `${uatWords(g.lane)}${g.rows.length === 0 ? ' · nothing open' : ''}`
    const warn = !g.isLoose && g.lane.staging === undefined && g.lane.isParked !== true
    out += text(80, cy + 19, esc(fit(sub, 424 - 80 - joinW, 12)), { size: 12, fill: warn ? TONE.warn.ink : C.muted })
    if (join !== '') out += text(424, cy + 19, esc(join), { font: 'mono', anchor: 'end' })
    y += 48
    if (g.rows.length > 0) {
      const stemX = 57
      out += `<path d="M${stemX} ${y - 4}V${y + (g.rows.length - 1) * 42 + 12}" fill="none" stroke="${g.colour}" stroke-opacity="0.5" stroke-width="1.75"/>`
      for (const item of g.rows) {
        // Two lines a branch: what it is for, in full width, then its name, lead and distance.
        const ry = y + 12
        // Yours is in copper. Without a subject, the name leads in its place and is not said twice.
        const note = clashOf(here, item.b.name, item.b.clash)
        out += `<path d="M${stemX} ${ry}H68" fill="none" stroke="${note === undefined ? g.colour : note.ink}" stroke-opacity="${note === undefined ? 0.5 : 0.9}" stroke-width="1.75"/>`
        if (note !== undefined) out += clashMark(stemX, ry, note.level)
        const ink = item.isYours ? C.hl : C.text
        out += hasSubject(item.b)
          ? text(74, ry + 4.5, esc(fit(describe(item.b, laneNames), 424 - 74, 13)), { size: 13, fill: ink })
          : text(74, ry + 4.5, esc(branchIn(item.b.name, ((424 - 74) * 11) / 13)), { font: 'mono', size: 13, fill: ink })
        const bw = behindWords(item.b)
        const lead = item.b.ahead > 0 ? `+${item.b.ahead}` : ''
        // A clash shares the second line with the name: the name keeps at most half of it.
        const extra = (bw === undefined ? 0 : widthOf(` · ${bw.words}`)) + (note === undefined ? 0 : (424 - 74) / 2)
        const name = hasSubject(item.b) ? `${branchIn(item.b.name, 424 - 74 - monoWidth(` ${lead}`) - extra - 4)} ` : ''
        // The name and lead in mono, then the distance and any clash in their tones, as texts measured in their own faces.
        const second = `${name}${lead}`.trim()
        if (second !== '') out += text(74, ry + 21, esc(second), { font: 'mono', fill: item.isYours ? C.hl : C.muted })
        const after: Piece[] = [
          ...(bw === undefined ? [] : [{ words: bw.words, fill: bw.ink }]),
          ...(note === undefined ? [] : [{ words: note.words, fill: note.ink }]),
        ].map((p, at) => (at === 0 && second === '' ? p : { ...p, words: `· ${p.words}` })).map((p, at) => (at > 0 ? { ...p, words: ` ${p.words}` } : p))
        const afterX = 74 + (second === '' ? 0 : monoWidth(second) + 4)
        if (after.length > 0) out += textLine(afterX, ry + 21, after, 424 - afterX)
        y += 42
      }
      y += 4
    }
    out += `</g>`
    y += 12
  }
  const trunk = lastJoin > trunkTop ? `<path d="M${trunkX} ${trunkTop}V${lastJoin}" fill="none" stroke="${C.accent}" stroke-opacity="0.35" stroke-width="3" stroke-linecap="round"/>` : ''
  // Every clash at the foot, one a line, worst first: the two branches, the level and the first file.
  const clashes = here.clashes ?? []
  if (clashes.length > 0) {
    out += hair(16, 424, y)
    y += 8
    for (const c of clashes) {
      y += 20
      const pair = `${branchIn(c.a, 108)} × ${branchIn(c.b, 108)}`
      const pairW = monoWidth(pair)
      out += clashMark(21, y - 4, c.level) + text(32, y, esc(pair), { font: 'mono', fill: C.text })
      const tail: Piece[] = [
        // The file says more than whether it is uncommitted, so it comes first and is the last to be cut.
        { words: c.level === 'conflict' ? 'conflict' : 'overlap', fill: clashInk(c.level) },
        ...(c.files[0] === undefined ? [] : [{ words: ` · ${c.files[0]}`, fill: C.muted }]),
        ...(c.isUncommitted === true ? [{ words: ' · uncommitted', fill: clashInk(c.level) }] : []),
      ]
      out += textLine(32 + pairW + 8, y, [{ words: '· ', fill: C.muted }, ...tail], 424 - (32 + pairW + 8))
    }
    y += 12
  }
  // The merged branches at the foot.
  out += hair(16, 424, y) + merged(here, 16, y + 27, 13)

  return frame(W, trunk + out)
}

/** The wide spine's left column: Claude's ring with clear room, what it is doing, where you are, the merged count. */
function wideLeft(b: Board, here: Here, laneNames: readonly string[], w: number): string {
  const cx = 16 + w / 2
  // The ring with its halos spans cy ± 51: from 20 to 122, clear of the frame and of the words under it.
  const cy = 71
  let out = ring(b, cx, cy)
  out += text(cx, 144, esc(fit(doingWords(b), w, 13, 600)), { size: 13, weight: 600, anchor: 'middle', fill: C.text })
  out += text(cx, 160, esc(fitMono(metaWords(b, false), w)), { font: 'mono', anchor: 'middle' })
  out += hair(16, 16 + w, 172)
  // Where you are, in two short lines, then the merged count at the foot.
  const on = youAreOn(here, laneNames)
  const name = on.isMono ? branchIn(on.words, ((w - widthOf('You are on ', 12)) * 11) / 12) : fit(on.words, w - widthOf('You are on ', 12), 12)
  out += youHead(on, name, 16, 192)
  const work = here.dirty > 0 ? `${plural(here.dirty, 'file')} not committed` : 'Nothing to commit'
  out += text(16, 209, esc(fit(work, w, 12)), { size: 12, fill: here.dirty > 0 ? C.text : C.muted })
  // Your branch's clash, by its level alone, between where you are and the merged count.
  const yours = clashOf(here, here.branch, here.clash)
  if (yours !== undefined) {
    const words = yours.level === 'conflict' ? 'Conflicts with a branch' : 'Same files as a branch'
    // The narrow column has room for the level only; the tall spine and the board say who with, and whether uncommitted.
    out += clashMark(21, 222, yours.level) + text(32, 226, esc(fit(words, w - 16, 12)), { size: 12, fill: yours.ink })
  }
  out += merged(here, 16, 250, 12)

  return out
}

/**
 * Wide: main runs left to right along the top, its tip at the right, and each
 * lane hangs from it as a column (tile and name, live release, UAT, up to three
 * branches), closest to main beside the tip. Parked lanes and branches in no lane
 * share one quiet column at the far left.
 */
function treeWide(b: Board, here: Here, now: number): string {
  const W = 900
  const laneNames = (here.lanes ?? []).map(l => l.name)
  const leftW = 196
  let out = wideLeft(b, here, laneNames, leftW)
  const groups = ordered(groupsOf(here))
  const cols = groups.filter(g => !g.isLoose && g.lane.isParked !== true).reverse()
  const aside = groups.filter(g => g.isLoose || g.lane.isParked === true)
  const left = 16 + leftW + 22
  const right = 884
  const gap = 14
  const weight = (g: Group): number => 1.2 + Math.min(g.rows.length, 3) * 0.2
  const asideWeight = aside.length === 0 ? 0 : 1.5
  const total = cols.reduce((n, g) => n + weight(g), 0) + asideWeight
  const room = right - left - gap * (cols.length + (aside.length === 0 ? 0 : 1) - 1)
  const mainY = 38
  out += `<path d="M${left} ${mainY}H${right - 26}" fill="none" stroke="${C.accent}" stroke-opacity="0.35" stroke-width="3" stroke-linecap="round"/>`
  out += `<circle cx="${right - 17}" cy="${mainY}" r="9" fill="${C.canvas}" stroke="${C.accent}" stroke-width="2"/>`
  out += text(right - 34, mainY - 11, 'main', { font: 'mono', size: 13, weight: 500, anchor: 'end', fill: C.text })
  // The clash summary at main's far end, above the line: nothing when clean.
  const summary = clashSummary(here.clashes)
  if (summary.length > 0) out += textLine(left, mainY - 11, summary, right - 80 - left, 12)
  if (total === 0) out += text(left, mainY + 34, 'No lanes and no open branches', { size: 12 })
  let x = left
  if (aside.length > 0) {
    // The quiet column: each group's tile and name on one small line, then up to two branches.
    const w = Math.floor((room * asideWeight) / total)
    out += `<path d="M${x + 14} ${mainY + 4.5}V${mainY + 22}" fill="none" stroke="${C.wire}" stroke-width="2"/><circle cx="${x + 14}" cy="${mainY}" r="4.5" fill="${C.canvas}" stroke="${C.wire}" stroke-width="2"/>`
    let y = mainY + 24
    for (const g of aside) {
      if (y > 220) break
      out += `<g${g.lane.isParked === true ? ' opacity="0.55"' : ''}>`
      out += laneTile(g.lane, x + 2, y, 20, g.colour)
      out += text(x + 28, y + 14, esc(fit(`${g.lane.name}${g.lane.isParked === true ? ' · parked' : ''}`, w - 30, 12.5, 600)), { size: 12.5, weight: 600, fill: C.text })
      y += 30
      for (const item of g.rows.slice(0, 2)) {
        if (y > 230) break
        const bw = behindWords(item.b)
        const mark = clashOf(here, item.b.name, item.b.clash)
        out += mark === undefined ? `<circle cx="${x + 5}" cy="${y + 4}" r="2.5" fill="${g.colour}"/>` : clashMark(x + 5, y + 4, mark.level)
        out += text(x + 13, y + 8, esc(fit(describe(item.b, laneNames), w - 16, 11.5)), { size: 11.5, fill: item.isYours ? C.hl : C.text })
        if (bw !== undefined) out += text(x + 13, y + 22, esc(bw.words), { fill: bw.ink })
        y += 32
      }
      out += `</g>`
      y += 4
    }
    x += w + gap
  }
  for (const g of cols) {
    const w = Math.floor((room * weight(g)) / total)
    out += `<path d="M${x + 14} ${mainY + 4.5}V${mainY + 22}" fill="none" stroke="${g.colour}" stroke-width="2.25"/>`
    out += `<circle cx="${x + 14}" cy="${mainY}" r="4.5" fill="${C.canvas}" stroke="${g.colour}" stroke-width="2"/>`
    out += laneTile(g.lane, x + 2, mainY + 24, 22, g.colour)
    out += text(x + 30, mainY + 40, esc(fit(g.lane.name, w - 32, 13.5, 600)), { size: 13.5, weight: 600, fill: C.text })
    let y = mainY + 62
    if (g.lane.live !== undefined) {
      out += livePill(x + 2, y, g.lane.live, g.colour, w - 20).svg
      y += 20
    }
    const sub = uatWords(g.lane).replace(' same as live', ' = live')
    const warn = g.lane.staging === undefined
    out += text(x + 2, y + 4, esc(fit(g.moved === 0 ? sub : `${sub} · ${agoOf(g.moved, now)}`, w - 4)), { fill: warn ? TONE.warn.ink : C.muted })
    y += 14
    if (g.rows.length === 0) out += text(x + 2, y + 18, 'nothing open', { fill: C.faint })
    // Up to three branches; with more, two and a count, so the column ends inside the board.
    const shown = g.rows.length > 3 ? g.rows.slice(0, 2) : g.rows
    shown.forEach((item, at) => {
      const ty = y + 10 + at * 40
      // Wide shows a clash by its mark alone; the tall spine and the board say who with.
      const mark = clashOf(here, item.b.name, item.b.clash)
      out += mark === undefined ? `<circle cx="${x + 5}" cy="${ty + 10}" r="2.5" fill="${g.colour}"/>` : clashMark(x + 5, ty + 10, mark.level)
      const bw = behindWords(item.b)
      const lines = wrap(describe(item.b, laneNames), w - 16, 11.5, bw === undefined ? 2 : 1)
      lines.forEach((l, i) => {
        out += text(x + 13, ty + 14 + i * 14, esc(l), { size: 11.5, fill: item.isYours ? C.hl : C.text })
      })
      if (bw !== undefined) out += text(x + 13, ty + 28, esc(bw.words), { fill: bw.ink })
    })
    if (g.rows.length > 3) out += text(x + 13, y + 10 + 2 * 40 + 14, `+${g.rows.length - 2} more`)
    x += w + gap
  }

  return frame(W, out, WIDE_HEIGHT)
}

/** The words for a repository git could not read. */
const unreadWords = (repo: Board['repo']): string =>
  repo === undefined
    ? 'Reading the repository…'
    : repo.kind === 'blocked'
      ? `Git did not run: ${repo.why}`
      : repo.kind === 'none'
        ? repo.why === undefined ? 'No git repository in this folder' : `Git said: ${repo.why}`
        : ''

/**
 * The spine view: main as the trunk, each lane joining it with its live release
 * and UAT state and its open branches hanging under it, said by what each is for.
 * Tall, main runs down the left under Claude's band; wide, along the top beside Claude's ring.
 */
export function drawSpine(b: Board, isWide: boolean, now: number): string {
  const repo = b.repo
  if (repo === undefined || repo.kind !== 'repo') {
    // Claude still has its ring; the trunk waits, dashed, for git.
    const words = unreadWords(repo)
    if (isWide) {
      let out = ring(b, 104, 71) + text(104, 144, esc(fit(doingWords(b), 176, 13, 600)), { size: 13, weight: 600, anchor: 'middle', fill: C.text })
      out += `<path d="M214 38H858" fill="none" stroke="${C.nodeLine}" stroke-width="3" stroke-dasharray="4 6" stroke-linecap="round"/>`
      out += text(214, 74, esc(fit(words, 884 - 214, 12)), { size: 12 })
      return frame(900, out, WIDE_HEIGHT)
    }
    let out = claudeBand(b, 16, 18, 408) + hair(16, 424, 144)
    out += `<path d="M26 170V230" fill="none" stroke="${C.nodeLine}" stroke-width="3" stroke-dasharray="4 6" stroke-linecap="round"/>`
    out += text(46, 196, esc(fit(words, 424 - 46, 12)), { size: 12 })
    return frame(440, out)
  }

  return isWide ? treeWide(b, repo, now) : treeTall(b, repo, now)
}
