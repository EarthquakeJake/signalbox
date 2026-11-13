import type { Board, Lane, OpenBranch, StationId } from '../types'
import { NAMES } from './draw'
import { C, FAR_BEHIND, STALE_DAYS, TONE, agoOf, branchIn, esc, fit, fitMono, laneColours, laneTile, line, monoWidth, stagingWords, text, widthOf } from './lanes'
import type { Piece } from './lanes'

// The spine view: the trunk as one line, every open branch joined to it where
// it forked, and your own work, staging and releases beside it.
//
// The scale. A branch's fork is placed by how many commits the trunk has taken
// since it, its `behind`, on a log scale: each doubling of `behind` moves the
// fork SPINE_STEP pixels further from the trunk's tip. So 1 behind sits one
// step out, 3 behind two, 7 three, 100 about 6.7 and 1000 about 10. A
// branch a few commits old and one three hundred commits old both read, and
// the gap between 90 and 110 behind stays small, as it should.
// Releases carry a date but no commit distance, so they are listed beside the
// spine in order rather than pinned to it.

/** Pixels per doubling of commits behind. */
export const SPINE_STEP = 40
/** Past this many commits behind, every fork sits at the end of the spine. */
const SPINE_MOST = 2047
const along = (behind: number): number => Math.round(SPINE_STEP * Math.log2(1 + Math.min(Math.max(behind, 0), SPINE_MOST)))

type Here = Extract<NonNullable<Board['repo']>, { kind: 'repo' }>
/** An open branch to draw, with the lane it is in, if any. */
type Item = { b: OpenBranch; lane?: Lane; colour: string }

const STATIONS: StationId[] = ['you', 'model', 'memory', 'files', 'shell', 'network', 'browser', 'agents', 'skills', 'hooks']
const LOOSE: Lane = { name: 'No lane', branches: 0, isHere: false }

const dashed = (d: string, ink: string, width = 1.5): string => `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${width}" stroke-dasharray="4 3"/>`
const solid = (d: string, ink: string, width = 1.5): string => `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${width}"/>`
const isFar = (b: OpenBranch): boolean => b.behind >= FAR_BEHIND
const isStale = (b: OpenBranch, now: number): boolean => now - b.updatedAt > STALE_DAYS * 86400000

/** Every open branch but yours: the lanes' own, then those in no lane, nearest the trunk's tip first. */
function openItems(here: Here, colours: Map<Lane, string>): Item[] {
  const seen = new Set<string>([here.branch])
  const out: Item[] = []
  for (const lane of here.lanes ?? []) {
    for (const b of lane.open ?? []) {
      if (seen.has(b.name)) continue
      seen.add(b.name)
      out.push({ b, lane, colour: colours.get(lane) ?? C.muted })
    }
  }
  for (const b of here.loose ?? []) {
    if (seen.has(b.name)) continue
    seen.add(b.name)
    out.push({ b, colour: C.muted })
  }

  return out.sort((a, z) => a.b.behind - z.b.behind || z.b.updatedAt - a.b.updatedAt)
}

/**
 * The open branches there is room for: those far behind first, the furthest of
 * them, since they are what the spine is for; then the nearest to the tip.
 * Returned in the drawing's order, nearest the tip first.
 */
function pick(items: Item[], most: number): Item[] {
  const far = items.filter(i => isFar(i.b)).sort((a, z) => z.b.behind - a.b.behind).slice(0, Math.min(3, most))
  const near = items.filter(i => !far.includes(i)).slice(0, most - far.length)
  return [...near, ...far].sort((a, z) => a.b.behind - z.b.behind || z.b.updatedAt - a.b.updatedAt)
}

/** `app-v3.14.0` reads as `3.14.0`: the lane's word and a leading `v` come off, the title already names the lane. */
const tagWords = (tag: string): string => tag.replace(/^[A-Za-z][A-Za-z_]*[-/]/, '').replace(/^v(?=\d)/, '')

/** The few words under an open branch's name: how far ahead, its lane, and a warning where one applies. */
function branchPieces(item: Item, now: number): Piece[] {
  const b = item.b
  return [
    { words: `+${b.ahead}`, fill: C.muted },
    { words: ` · ${item.lane?.name ?? 'no lane'}`, fill: C.muted },
    ...(isFar(b) ? [{ words: ` · ${b.behind} behind`, fill: TONE.danger.ink }] : isStale(b, now) ? [{ words: ' · stale', fill: TONE.warn.ink }] : []),
  ]
}

/** An open branch's card: its lane's tile, its name, and how it stands. */
function branchCard(item: Item, x: number, y: number, w: number, now: number): string {
  return (
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="43" rx="9.5" fill="${C.node}" stroke="${C.nodeLine}"/>` +
    laneTile(item.lane ?? LOOSE, x + 8, y + 11, 22, item.colour) +
    text(x + 38, y + 19, esc(branchIn(item.b.name, w - 46)), { font: 'mono', fill: C.text }) +
    line(x + 38, y + 35, branchPieces(item, now), w - 46)
  )
}

/** Your lane: the lit one, else none. */
const yourLane = (here: Here): Lane | undefined => (here.lanes ?? []).find(lane => lane.isHere)

/** Your branch's own open-branch entry, for when its newest commit was made. */
const yourEntry = (here: Here): OpenBranch | undefined =>
  (here.lanes ?? []).flatMap(lane => lane.open ?? []).find(b => b.name === here.branch) ?? (here.loose ?? []).find(b => b.name === here.branch)

/** What your working copy holds, in the tag's words. */
function workWords(b: Board, here: Here, isShort: boolean): string {
  const files = (n: number): string => `${n} file${n === 1 ? '' : 's'}`
  if (here.dirty > 0) return isShort ? `${files(here.dirty)} · not committed` : `${files(here.dirty)} changed · not committed`
  return b.edited.length > 0 ? `${b.edited.length} edited · all committed` : 'nothing to commit'
}

/** The releases to list: your lane's, else the first lane with any, else the trunk's newest tag. */
function releasesOf(here: Here): { title: string; rows: Array<{ name: string; at?: number }> } {
  const lanes = here.lanes ?? []
  const lane = [yourLane(here), ...lanes].find(l => l !== undefined && ((l.releases ?? []).length > 0 || l.live !== undefined))
  if (lane !== undefined) {
    const rows = (lane.releases ?? []).length > 0 ? (lane.releases ?? []).slice(0, 4) : [{ name: lane.live as string }]
    return { title: `${lane.name} releases`, rows }
  }

  return here.tag === undefined ? { title: '', rows: [] } : { title: 'Releases', rows: [{ name: here.tag }] }
}

/** A pill starting at `x`, centred on `cy`; returns the drawing and where it ends. */
function pillAt(x: number, cy: number, words: string, isLive: boolean): { svg: string; right: number } {
  const w = Math.ceil(monoWidth(words) + 20)
  return {
    right: x + w,
    svg:
      `<rect x="${x + 0.5}" y="${cy - 10.5}" width="${w - 1}" height="21" rx="10.5" fill="${C.canvas}" stroke="${isLive ? C.accent : C.nodeLine}"/>` +
      text(x + w / 2, cy + 4, esc(words), { font: 'mono', anchor: 'middle', fill: isLive ? C.accent : C.muted }),
  }
}

/** A path from (x1, y1) to (x2, y2): along the first axis to a lane, along the other to the target, with rounded turns. */
function elbow(from: [number, number], lane: number, to: [number, number], isVertical: boolean): string {
  const [x1, y1] = from
  const [x2, y2] = to
  if (!isVertical) {
    // Horizontal first to the lane at x = lane, vertical to y2, horizontal to x2.
    if (Math.abs(y1 - y2) < 1) return `M${x1} ${y1}H${x2}`
    const r = Math.min(6, Math.abs(y1 - y2) / 2, Math.abs(lane - x1), Math.abs(x2 - lane))
    const sx = Math.sign(lane - x1)
    const sy = Math.sign(y2 - y1)
    const tx = Math.sign(x2 - lane)
    return `M${x1} ${y1}H${lane - sx * r}Q${lane} ${y1} ${lane} ${y1 + sy * r}V${y2 - sy * r}Q${lane} ${y2} ${lane + tx * r} ${y2}H${x2}`
  }
  // Vertical first to the lane at y = lane, horizontal to x2, vertical to y2.
  if (Math.abs(x1 - x2) < 1) return `M${x1} ${y1}V${y2}`
  const r = Math.min(6, Math.abs(x1 - x2) / 2, Math.abs(lane - y1), Math.abs(y2 - lane))
  const sy = Math.sign(lane - y1)
  const sx = Math.sign(x2 - x1)
  const ty = Math.sign(y2 - lane)
  return `M${x1} ${y1}V${lane - sy * r}Q${x1} ${lane} ${x1 + sx * r} ${lane}H${x2 - sx * r}Q${x2} ${lane} ${x2} ${lane + ty * r}V${y2}`
}

/** The small Claude ring: Claude in the middle, its stations round it, the busy ones lit and named beside it. */
function claudeRing(b: Board, cx: number, cy: number, labelX: number): string {
  let out = `<circle cx="${cx}" cy="${cy}" r="36" fill="none" stroke="${C.nodeLine}" stroke-dasharray="3 3"/>`
  if (b.isWorking) out += `<circle cx="${cx}" cy="${cy}" r="25" fill="none" stroke="${C.ring}" stroke-width="4"/>`
  out += `<circle cx="${cx}" cy="${cy}" r="22.5" fill="${C.node}" stroke="${b.isWorking ? C.accent : C.nodeLine}" stroke-width="1.5"/>`
  out += text(cx, cy + 3, 'CLAUDE', { font: 'mono', size: 8, weight: 500, spacing: 0.5, anchor: 'middle', fill: C.text })
  STATIONS.forEach((id, at) => {
    const angle = -Math.PI / 2 + (at * 2 * Math.PI) / STATIONS.length
    const x = cx + 36 * Math.cos(angle)
    const y = cy + 36 * Math.sin(angle)
    const isLive = (b.live[id] ?? 0) > 0
    const isUsed = (b.counts[id] ?? 0) > 0
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isLive ? 5 : 4}" fill="${isLive ? C.accent : C.node}" stroke="${isLive ? C.accent : isUsed ? C.muted : C.nodeLine}" stroke-width="1.5"/>`
  })
  // The stations named beside the ring: those running first, then the busiest.
  const named = STATIONS.filter(id => (b.counts[id] ?? 0) > 0 || (b.live[id] ?? 0) > 0)
    .sort((a, z) => Number((b.live[z] ?? 0) > 0) - Number((b.live[a] ?? 0) > 0) || (b.counts[z] ?? 0) - (b.counts[a] ?? 0))
    .slice(0, 4)
  if (named.length === 0) return out + text(labelX, cy + 4, b.isWorking ? 'Thinking' : 'Waiting for you')
  named.forEach((id, at) => {
    const isLive = (b.live[id] ?? 0) > 0
    out += text(labelX, cy - 20 + at * 16, esc(`${NAMES[id]} ×${b.counts[id] ?? 0}`), { font: 'mono', fill: isLive ? C.text : C.muted })
  })

  return out
}

/** A legend item: a short stroke and its words. Returns the drawing and its width. */
function legendItem(x: number, y: number, words: string, ink: string, kind: 'solid' | 'dashed' | 'dot'): { svg: string; w: number } {
  const mark =
    kind === 'dot'
      ? `<circle cx="${x + 6}" cy="${y - 4}" r="4" fill="${ink}"/>`
      : kind === 'dashed'
        ? dashed(`M${x} ${y - 4}H${x + 14}`, ink)
        : solid(`M${x} ${y - 4}H${x + 14}`, ink, 1.75)
  return { svg: mark + text(x + 20, y, esc(words)), w: 20 + widthOf(words) + 16 }
}

/** Your branch's card: the lit lane's tile, its name in copper, where it stands and what is uncommitted. */
function yourCard(b: Board, here: Here, x: number, y: number, w: number, colour: string, now: number, isShort: boolean): string {
  const entry = yourEntry(here)
  const lane = yourLane(here)
  const onTrunk = here.trunk === undefined
  const pieces: Piece[] = onTrunk
    ? [{ words: 'on the trunk', fill: C.muted }]
    : [
        { words: `+${here.ahead}`, fill: C.muted },
        { words: ` · ${here.behind} behind`, fill: here.behind >= FAR_BEHIND ? TONE.danger.ink : C.muted },
        ...(entry === undefined ? [] : [{ words: ` · ${agoOf(entry.updatedAt, now)}`, fill: C.muted }]),
      ]
  return (
    `<rect x="${x - 2}" y="${y - 2}" width="${w + 4}" height="62" rx="12" fill="none" stroke="${C.ring}" stroke-width="4"/>` +
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="57" rx="9.5" fill="${C.node}" stroke="${C.accent}"/>` +
    laneTile(lane ?? LOOSE, x + 8, y + 8, 20, colour) +
    text(x + 36, y + 22, esc(branchIn(here.branch, w - 44)), { font: 'mono', fill: C.hl }) +
    line(x + 10, y + 38, pieces, w - 20) +
    text(x + 10, y + 52, esc(fitMono(workWords(b, here, isShort), w - 20)), { font: 'mono', fill: here.dirty > 0 ? C.text : C.muted })
  )
}

/** The staging card: which lane's staging, how long since it moved, and whether your work is on it. */
function stagingCard(lane: Lane | undefined, staging: NonNullable<Lane['staging']>, x: number, y: number, w: number, now: number): string {
  const words = lane === undefined ? { when: agoOf(staging.updatedAt, now), news: staging.behind > 0 ? `${staging.behind} behind` : '' } : stagingWords(lane, now)
  return (
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="39" rx="9.5" fill="rgba(201,139,94,0.14)" stroke="rgba(201,139,94,0.55)"/>` +
    text(x + 10, y + 17, esc(fit(lane === undefined ? 'On staging' : `On staging · ${lane.name}`, w - 20)), { fill: C.hl }) +
    text(x + 10, y + 32, esc(fitMono(words.news === '' ? `since ${words.when}` : `since ${words.when} · ${words.news}`, w - 20)), { font: 'mono' })
  )
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

const frame = (w: number, h: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
  `<defs><pattern id="sb-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1" fill="${C.dot}"/></pattern></defs>` +
  `<rect width="${w}" height="${h}" rx="12" fill="${C.canvas}"/><rect width="${w}" height="${h}" rx="12" fill="url(#sb-dots)"/>` +
  body +
  `</svg>`

const label = (x: number, y: number, words: string, anchor: 'start' | 'end' = 'start'): string =>
  text(x, y, esc(words.toUpperCase()), { weight: 600, spacing: 0.6, anchor })

/** Tall: the trunk runs down the middle, newest at the top; open branches on the left, your work on the right. */
function tallSpine(b: Board, here: Here, now: number): string {
  const W = 440
  const left = 16
  const cardW = 152
  const spineL = 209
  const spineR = 231
  const top = 64
  const forkY = (behind: number): number => top + along(behind)
  const colours = laneColours(here.lanes ?? [])
  const lane = yourLane(here)
  let wires = ''
  let body = ''
  let dots = ''

  // Open branches, nearest the tip first. Each card sits level with its fork
  // or as near below it as the cards above allow, so every connector runs
  // flat or climbs, and each takes a lane nearer the spine than the one above.
  const items = openItems(here, colours)
  const shown = pick(items, 8)
  let y = 44
  shown.forEach((item, at) => {
    const f = forkY(item.b.behind)
    const cardTop = Math.max(f - 22, y)
    const mid = cardTop + 22
    const laneX = 176 + at * 4
    const ink = isFar(item.b) ? TONE.danger.ink : C.wire
    const d = elbow([left + cardW + 4, mid], laneX, [spineL, f], false)
    wires += isFar(item.b) ? dashed(d, ink) : solid(d, ink)
    body += branchCard(item, left, cardTop, cardW, now)
    dots += `<circle cx="${left + cardW}" cy="${mid}" r="3.5" fill="${C.canvas}" stroke="${isFar(item.b) ? ink : C.port}" stroke-width="1.5"/>`
    dots += `<circle cx="${spineL}" cy="${f}" r="3" fill="${C.canvas}" stroke="${isFar(item.b) ? ink : C.port}" stroke-width="1.5"/>`
    y = cardTop + 44 + 8
  })
  if (items.length > shown.length) {
    body += text(left, y + 8, `+${items.length - shown.length} more open`)
    y += 20
  }
  if (items.length === 0) {
    body += text(left, 56, 'No other open branches')
    y = 64
  }
  const leftBottom = y

  // Claude, then your branch and staging on the right, placed the same way.
  const rightX = 252
  const rightW = W - 16 - rightX
  body += claudeRing(b, 288, 84, 336)
  type Side = { f: number; h: number; draw: (top: number) => string; ink: string; width: number }
  const sides: Side[] = []
  sides.push({ f: forkY(here.trunk === undefined ? 0 : here.behind), h: 58, ink: C.accent, width: 1.75, draw: t => yourCard(b, here, rightX, t, rightW, lane === undefined ? C.muted : colours.get(lane) ?? C.muted, now, true) })
  const staging = lane?.staging ?? (here.lanes === undefined || here.lanes.length === 0 ? here.staging : undefined)
  if (staging !== undefined) sides.push({ f: forkY(staging.behind), h: 40, ink: C.hl, width: 1.5, draw: t => stagingCard(lane, staging, rightX, t, rightW, now) })
  sides.sort((a, z) => a.f - z.f)
  let ry = 138
  sides.forEach((s, at) => {
    const cardTop = Math.max(s.f - s.h / 2, ry)
    const mid = cardTop + s.h / 2
    const laneX = 246 - at * 5
    wires += solid(elbow([rightX - 4, mid], laneX, [spineR, s.f], false), s.ink, s.width)
    body += s.draw(cardTop)
    dots += `<circle cx="${spineR}" cy="${s.f}" r="3.5" fill="${C.canvas}" stroke="${s.ink}" stroke-width="1.5"/>`
    ry = cardTop + s.h + 12
  })

  // Releases, newest first, listed under your work: not to the spine's scale.
  const rel = releasesOf(here)
  if (rel.rows.length > 0) {
    ry += 8
    body += label(rightX, ry + 4, fit(rel.title, rightW, 11, 600))
    ry += 22
    rel.rows.forEach((r, at) => {
      const p = pillAt(rightX, ry, fitMono(at === 0 ? `${tagWords(r.name)} · live` : tagWords(r.name), rightW - 70), at === 0)
      body += p.svg
      if (r.at !== undefined) body += text(p.right + 8, ry + 4, esc(fit(agoOf(r.at, now), W - 16 - p.right - 8)))
      ry += 28
    })
    ry -= 14
  }
  const rightBottom = ry

  // The spine, long enough to reach the furthest fork and run past both columns.
  const furthest = Math.max(top, ...shown.map(i => forkY(i.b.behind)), ...sides.map(s => s.f))
  const end = Math.max(furthest + 24, leftBottom, rightBottom) + 8
  let spine = `<rect x="${spineL}" y="52" width="${spineR - spineL}" height="${end - 52}" rx="11" fill="${C.node}" stroke="${C.nodeLine}"/>`
  // The scale marked inside the spine, where no fork sits beside the mark.
  const forks = [...shown.map(i => forkY(i.b.behind)), ...sides.map(s => s.f)]
  for (const mark of [10, 100]) {
    const my = forkY(mark)
    if (my + 8 < end && forks.every(f => Math.abs(f - my) > 8)) spine += text(220, my + 3, String(mark), { font: 'mono', size: 8, anchor: 'middle', fill: C.faint })
  }

  // Under the spine: its name, the legend, the merged branches.
  let foot = text(220, end + 18, 'main · older below', { font: 'mono', anchor: 'middle' })
  let fy = end + 44
  let fx = left
  const legend: Array<[string, string, 'solid' | 'dashed' | 'dot']> = [
    ['Claude working now', C.accent, 'dot'],
    ['Your branch', C.accent, 'solid'],
    ['Open branch', C.wire, 'solid'],
    [`${FAR_BEHIND}+ behind main`, TONE.danger.ink, 'dashed'],
    ['Staging', C.hl, 'solid'],
  ]
  for (const [words, ink, kind] of legend) {
    const w = 20 + widthOf(words) + 16
    if (fx + w - 16 > W - 16) {
      fx = left
      fy += 20
    }
    foot += legendItem(fx, fy, words, ink, kind).svg
    fx += w
  }
  fy += 20
  foot += text(left, fy, `Forks are placed by commits behind main: each doubling is ${SPINE_STEP} px.`)
  if (here.merged !== undefined) {
    fy += 26
    foot += `<g transform="translate(${left} ${fy - 12}) scale(0.6667)" fill="none" stroke="${C.muted}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></g>`
    foot += text(left + 22, fy, here.merged === 0 ? 'No merged branches' : `${here.merged} merged ${here.merged === 1 ? 'branch' : 'branches'}`)
  }

  const head = label(left, 28, `${items.length} open ${items.length === 1 ? 'branch' : 'branches'}`) + label(W - 16, 28, lane === undefined ? 'Your branch' : lane.name, 'end')
  return frame(W, fy + 16, head + spine + wires + body + dots + foot)
}

/** Wide: the trunk runs left to right, newest at the right; open branches above it, your work below. */
function wideSpine(b: Board, here: Here, now: number): string {
  const W = 900
  const H = 284
  const tip = 868
  const spineT = 134
  const spineB = 154
  const forkX = (behind: number): number => tip - Math.round(along(behind) * 1.4)
  const colours = laneColours(here.lanes ?? [])
  const lane = yourLane(here)
  let wires = ''
  let body = ''
  let dots = ''

  // Open branches above the spine, nearest the tip first from the right. Each
  // card sits over its fork or as near left of it as the cards beside allow.
  const items = openItems(here, colours)
  const cardW = 150
  const shown: Item[] = []
  let edge = W - 16
  for (const item of pick(items, 5)) {
    const f = forkX(item.b.behind)
    const right = Math.min(f + cardW / 2, edge)
    if (right - cardW < 16) continue
    const at = shown.length
    const cx = right - cardW / 2
    const laneY = 96 + at * 5
    const ink = isFar(item.b) ? TONE.danger.ink : C.wire
    const d = elbow([cx, 92], laneY, [f, spineT], true)
    wires += isFar(item.b) ? dashed(d, ink) : solid(d, ink)
    body += branchCard(item, right - cardW, 44, cardW, now)
    dots += `<circle cx="${cx}" cy="88" r="3.5" fill="${C.canvas}" stroke="${isFar(item.b) ? ink : C.port}" stroke-width="1.5"/>`
    dots += `<circle cx="${f}" cy="${spineT}" r="3" fill="${C.canvas}" stroke="${isFar(item.b) ? ink : C.port}" stroke-width="1.5"/>`
    shown.push(item)
    edge = right - cardW - 8
  }

  // Your branch and staging below, placed the same way from the right.
  type Side = { f: number; w: number; h: number; draw: (x: number) => string; ink: string; width: number }
  const sides: Side[] = []
  const yourW = 210
  sides.push({ f: forkX(here.trunk === undefined ? 0 : here.behind), w: yourW, h: 58, ink: C.accent, width: 1.75, draw: x => yourCard(b, here, x, 172, yourW, lane === undefined ? C.muted : colours.get(lane) ?? C.muted, now, true) })
  const staging = lane?.staging ?? (here.lanes === undefined || here.lanes.length === 0 ? here.staging : undefined)
  if (staging !== undefined) sides.push({ f: forkX(staging.behind), w: 190, h: 40, ink: C.hl, width: 1.5, draw: x => stagingCard(lane, staging, x, 172, 190, now) })
  sides.sort((a, z) => z.f - a.f)
  let sideEdge = W - 16
  sides.forEach((s, at) => {
    const right = Math.min(s.f + s.w / 2, sideEdge)
    const cx = right - s.w / 2
    const laneY = 166 - at * 5
    wires += solid(elbow([cx, 168], laneY, [s.f, spineB], true), s.ink, s.width)
    body += s.draw(right - s.w)
    dots += `<circle cx="${s.f}" cy="${spineB}" r="3.5" fill="${C.canvas}" stroke="${s.ink}" stroke-width="1.5"/>`
    sideEdge = right - s.w - 12
  })

  // Releases along the foot, newest first, on their own row under the cards.
  const rel = releasesOf(here)
  let rx = 16
  if (rel.rows.length > 0) {
    const title = fit(rel.title, 150, 11, 600)
    body += label(rx, 260, title)
    // Capitals with letter spacing run wider than the table's lower case; the gap allows for it.
    rx += widthOf(title.toUpperCase(), 11, 600) * 1.08 + 0.6 * title.length + 16
    for (const [at, r] of rel.rows.entries()) {
      const words = at === 0 ? `${tagWords(r.name)} · live` : tagWords(r.name)
      const when = r.at === undefined ? '' : agoOf(r.at, now)
      const need = monoWidth(words) + 20 + (when === '' ? 0 : widthOf(when) + 8)
      if (rx + need > W - 16) break
      const p = pillAt(rx, 256, words, at === 0)
      body += p.svg
      if (when !== '') body += text(p.right + 8, 260, esc(when))
      rx = p.right + (when === '' ? 0 : widthOf(when) + 8) + 12
    }
  }

  // The spine across the board, with the scale marked inside it.
  let spine = `<rect x="16" y="${spineT}" width="${tip + 16 - 16}" height="${spineB - spineT}" rx="10" fill="${C.node}" stroke="${C.nodeLine}"/>`
  const forks = [...shown.map(i => forkX(i.b.behind)), ...sides.map(s => s.f)]
  for (const mark of [10, 100, 1000]) {
    const mx = forkX(mark)
    if (mx > 40 && forks.every(f => Math.abs(f - mx) > 14)) spine += text(mx, spineT + 13, String(mark), { font: 'mono', size: 8, anchor: 'middle', fill: C.faint })
  }
  spine += text(28, spineT + 14, 'older', { font: 'mono', size: 9, fill: C.faint })

  const more = items.length - shown.length
  const merged = here.merged === undefined || here.merged === 0 ? '' : ` · ${here.merged} merged`
  const head =
    label(16, 28, `${items.length} open ${items.length === 1 ? 'branch' : 'branches'}${more > 0 ? ` · ${more} not shown` : ''}`) +
    text(W - 16, 28, esc(`main, newest at the right · ${SPINE_STEP * 1.4} px per doubling${merged}`), { anchor: 'end' })
  return frame(W, H, head + spine + wires + body + dots)
}

/**
 * The spine view of the work: the trunk as one line, newest at the top (tall)
 * or the right (wide), every open branch joined to it where it forked, your
 * branch and staging beside it, and the releases listed by them.
 */
export function drawSpine(b: Board, isWide: boolean, now: number): string {
  const repo = b.repo
  if (repo === undefined || repo.kind !== 'repo') {
    const W = isWide ? 900 : 440
    const H = isWide ? 284 : 200
    const words = esc(fit(unreadWords(repo), W - 32))
    const spine = isWide
      ? `<rect x="16" y="134" width="868" height="20" rx="10" fill="${C.node}" stroke="${C.nodeLine}" stroke-dasharray="3 3"/>`
      : `<rect x="209" y="52" width="22" height="100" rx="11" fill="${C.node}" stroke="${C.nodeLine}" stroke-dasharray="3 3"/>`
    return frame(W, H, label(16, 28, 'Spine') + spine + text(16, isWide ? 110 : 176, words))
  }

  return isWide ? wideSpine(b, repo, now) : tallSpine(b, repo, now)
}
