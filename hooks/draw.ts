import type { Board, Lane, StationId } from '../types'
import { C, STATION_TONE, WIDE_HEIGHT, clashMark, clashOf, clashSummary, strongClashes, frame, isMadeUpName, line, agoOf, branchIn, esc, fit, fitMono, laneCard, laneColours, laneLine, stagingWords, text, widthOf } from './lanes'

export { fit }

export const NAMES: Record<StationId, string> = {
  you: 'You', skills: 'Skills', hooks: 'Hooks', memory: 'Memory', model: 'Model',
  agents: 'Agents', browser: 'Browser', network: 'Network', files: 'Files', shell: 'Shell',
}

// Line icons on a 24 px grid.
const ICONS: Record<StationId, string> = {
  you: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>',
  skills: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  hooks: '<path d="M14 5v8a4 4 0 1 1-8 0v-1"/><circle cx="14" cy="4" r="1.5"/>',
  memory: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
  model: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  agents: '<circle cx="12" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M12 8.5V13M12 13l-5 3M12 13l5 3"/>',
  browser: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/>',
  network: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  files: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  shell: '<path d="M5 7l5 5-5 5M12 18h7"/>',
}

type Spot = { x: number; y: number; w: number; wire: string; pin: [number, number] }
type Layout = {
  w: number
  h: number
  core: { x: number; y: number }
  spots: Record<StationId, Spot>
  merge: string
  tag: { x: number; y: number; w: number }
  route: string
}

const TALL: Layout = {
  w: 440, h: 420, core: { x: 150, y: 44 },
  spots: {
    you: { x: 16, y: 52, w: 110, wire: 'M126 66H150', pin: [150, 66] },
    skills: { x: 16, y: 88, w: 110, wire: 'M126 102H150', pin: [150, 102] },
    hooks: { x: 16, y: 124, w: 110, wire: 'M126 138H150', pin: [150, 138] },
    memory: { x: 16, y: 160, w: 110, wire: 'M126 174H150', pin: [150, 174] },
    model: { x: 314, y: 52, w: 110, wire: 'M290 66H314', pin: [290, 66] },
    agents: { x: 314, y: 88, w: 110, wire: 'M290 102H314', pin: [290, 102] },
    browser: { x: 314, y: 124, w: 110, wire: 'M290 138H314', pin: [290, 138] },
    network: { x: 314, y: 160, w: 110, wire: 'M290 174H314', pin: [290, 174] },
    files: { x: 140, y: 222, w: 76, wire: 'M178 194V222', pin: [178, 194] },
    shell: { x: 224, y: 222, w: 76, wire: 'M262 194V222', pin: [262, 194] },
  },
  merge: 'M178 250V260Q178 270 188 270H252Q262 270 262 260V250M220 270V284',
  tag: { x: 110, y: 284, w: 220 },
  route: 'M220 310V320Q220 330 210 330H40Q30 330 30 340V354',
}

const WIDE: Layout = {
  w: 900, h: 284, core: { x: 150, y: 70 },
  spots: {
    you: { x: 16, y: 78, w: 110, wire: 'M126 92H150', pin: [150, 92] },
    skills: { x: 16, y: 114, w: 110, wire: 'M126 128H150', pin: [150, 128] },
    hooks: { x: 16, y: 150, w: 110, wire: 'M126 164H150', pin: [150, 164] },
    memory: { x: 16, y: 186, w: 110, wire: 'M126 200H150', pin: [150, 200] },
    model: { x: 124, y: 22, w: 92, wire: 'M180 50V70', pin: [180, 70] },
    agents: { x: 224, y: 22, w: 92, wire: 'M260 50V70', pin: [260, 70] },
    browser: { x: 124, y: 240, w: 92, wire: 'M180 220V240', pin: [180, 220] },
    network: { x: 224, y: 240, w: 92, wire: 'M260 220V240', pin: [260, 220] },
    files: { x: 314, y: 96, w: 84, wire: 'M290 110H314', pin: [290, 110] },
    shell: { x: 314, y: 166, w: 84, wire: 'M290 180H314', pin: [290, 180] },
  },
  merge: 'M398 110H410Q420 110 420 120V170Q420 180 410 180H398M420 145H440',
  tag: { x: 440, y: 132, w: 190 },
  route: 'M630 145H660',
}

export const short = (words: string, most: number): string => (words.length <= most ? words : `${words.slice(0, most - 1)}…`)

/** `claude-fable-5-2` reads as `fable 5.2`. */
export const shortModel = (model: string): string => {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(model)
  if (m === null) return short(model, 18)
  const minor = m[3]
  return `${m[1]} ${m[2]}${minor !== undefined && minor.length < 3 ? `.${minor}` : ''}`
}

type Wear = 'idle' | 'used' | 'live'

/** A wire: grey at rest, solid silk once it carries work, and light travelling along silk while a call runs. */
function wire(d: string, wear: Wear): string {
  if (wear === 'idle') return `<path d="${d}" fill="none" stroke="${C.wire}" stroke-width="1.5"/>`
  if (wear === 'used') return `<path d="${d}" fill="none" stroke="${C.accent}" stroke-width="1.75"/>`
  return (
    `<path d="${d}" fill="none" stroke="${C.accent}" stroke-width="5" opacity="0.12"/>` +
    `<path d="${d}" fill="none" stroke="${C.accent}" stroke-width="1.75" opacity="0.7"/>` +
    `<path d="${d}" fill="none" stroke="${C.accent}" stroke-width="1.75" stroke-dasharray="8 16"><animate attributeName="stroke-dashoffset" from="24" to="0" dur="0.8s" repeatCount="indefinite"/></path>`
  )
}

export type TrackNames = { staging: string; live: string }

type Here = Extract<NonNullable<Board['repo']>, { kind: 'repo' }>

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

/**
 * Your branch in copper at (x, y) in `room` px: its name in mono, or, where a tool
 * made the name up and its newest commit has a subject, that subject instead.
 */
function yourBranch(here: Here | undefined, x: number, y: number, room: number): string {
  if (here === undefined) return ''
  const entry = [...(here.lanes ?? []).flatMap(lane => lane.open ?? []), ...(here.loose ?? [])].find(b => b.name === here.branch)
  const subject = entry?.subject?.trim() ?? ''
  if (subject !== '' && isMadeUpName(here.branch)) return text(x, y, esc(fit(subject, room)), { fill: C.hl })

  return text(x, y, esc(branchIn(here.branch, room)), { font: 'mono', fill: C.hl })
}

/** The words that say how your branch's lane was found, where it was not by name. */
const markerOf = (here: Here | undefined, lanes: readonly Lane[]): string =>
  lanes.some(lane => lane.isGuessed === true)
    ? 'lane from files'
    : here?.guess === 'tied'
      ? 'lanes tied in files'
      : here?.guess === 'none'
        ? 'no lane in files'
        : ''

/**
 * The tall board's release section: your lane, or your branch alone, as three
 * large stops (branch, staging, live) with a caption above and labels under
 * them; then every other lane as a quiet row under a hairline. Returns the
 * drawing and the board's height, which grows with the rows.
 */
function tallRelease(b: Board, names: TrackNames, now: number, flow: Wear): { svg: string; h: number } {
  const repo = b.repo
  const here = repo !== undefined && repo.kind === 'repo' ? repo : undefined
  const unknown = here === undefined
  const lanes = here?.lanes ?? []
  // Your lane, even a parked one: the board must not say you are in no lane when you are.
  const lit = lanes.find(lane => lane.isHere)
  const marker = markerOf(here, lanes)
  const ahead = here?.ahead ?? 0
  const dirty = here?.dirty ?? 0
  const isBranchLit = here !== undefined && (ahead > 0 || dirty > 0)
  // On the trunk, in a project with lanes, and in none of them: no lane's stops are drawn.
  const isOnTrunk = here !== undefined && here.trunk === undefined && lanes.length > 0 && lit === undefined

  type StageState = 'none' | 'plain' | 'yours' | 'behind' | 'passed'
  let caption = ''
  let stageLabel = ''
  let stageState: StageState = 'none'
  let stageCount = 0
  let liveLabel = ''
  let hasLive = false
  let branchLabel = ''

  if (here === undefined) {
    const said =
      repo === undefined
        ? 'Reading the repository…'
        : repo.kind === 'blocked'
          ? `Git did not run: ${repo.why}`
          : repo.why === undefined
            ? 'No git repository in this folder'
            : `Git said: ${repo.why}`
    caption = esc(fit(said, 368))
    branchLabel = repo !== undefined && repo.kind === 'blocked' && repo.branch !== undefined ? repo.branch : ''
  } else if (lanes.length > 0) {
    branchLabel = here.branch
    if (lit !== undefined) {
      // The lane's name in its own type, then where you are, giving way to the marker on the right.
      const room = 368 - (marker === '' ? 0 : widthOf(marker) + 16)
      const name = fit(lit.name, Math.min(160, room / 2), 13, 600)
      // Where your branch clashes, that says more than the lane's branch count, so it takes its place, in its tone.
      const yours = clashOf(here, here.branch, here.clash)
      const tail = yours === undefined ? ` · you are here · ${plural(lit.branches, 'branch', 'branches')}` : ` · ${yours.words}`
      const cut = esc(fit(tail, room - widthOf(name, 13, 600)))
      caption = `<tspan font-size="13" font-weight="600" fill="${C.hl}">${esc(name)}</tspan>${yours === undefined ? cut : `<tspan fill="${yours.ink}">${cut}</tspan>`}`
      const words = stagingWords(lit, now)
      // Staging the same as live says so rather than its age, so a count behind the trunk is not read as live being stale.
      const isSameAsLive = lit.isStagingLive === true && lit.hasYours !== true
      stageLabel =
        lit.isParked === true
          ? 'parked'
          : lit.staging === undefined
            ? 'no staging'
            : isSameAsLive
              ? `${names.staging} · same as live`
              : words.news === '' ? `${names.staging} · ${words.when}` : `${words.when} · ${words.news}`
      stageState =
        lit.staging === undefined || lit.isParked === true
          ? 'none'
          : words.news.endsWith('behind') ? 'behind' : words.news === 'passed' ? 'passed' : words.news === 'yours' ? 'yours' : 'plain'
      stageCount = lit.staging?.behind ?? 0
      hasLive = lit.live !== undefined
      liveLabel = lit.live ?? names.live
    } else if (isOnTrunk) {
      // On the trunk you are in no lane by design: say where you are, and draw no lane's stops.
      caption = `You are on ${(here.trunkRef ?? 'main').replace(/^origin\//, '')}`
    } else {
      caption = 'Your branch is in no lane'
      stageLabel = 'no lane'
    }
  } else {
    // No lanes declared: staging where a folder stands for it, else the trunk, measured from git.
    branchLabel = here.branch
    caption = here.staging === undefined ? 'Release track' : esc(fit(here.staging.subject, 368 - (marker === '' ? 0 : widthOf(marker) + 16)))
    if (here.staging !== undefined) {
      stageState = here.staging.behind > 0 ? 'behind' : 'plain'
      stageCount = here.staging.behind
      stageLabel = here.staging.behind > 0 ? `${agoOf(here.staging.updatedAt, now)} · ${here.staging.behind} behind` : `${names.staging} · ${agoOf(here.staging.updatedAt, now)}`
    } else if (here.trunk !== undefined) {
      const trunk = here.trunk.replace(/^origin\//, '')
      stageState = here.behind > 0 ? 'behind' : 'plain'
      stageCount = here.behind
      stageLabel = here.behind > 0 ? `${trunk} · ${here.behind} behind` : `${trunk} · level`
    } else {
      stageLabel = 'on the trunk'
    }
    hasLive = here.tag !== undefined
    liveLabel = here.tag ?? names.live
  }

  // Your branch's clash: in the lit lane's caption it replaced the branch count; otherwise it follows the caption.
  const yourClash = here === undefined ? undefined : clashOf(here, here.branch, here.clash)
  if (yourClash !== undefined && lit === undefined && here !== undefined) {
    const room = 368 - (marker === '' ? 0 : widthOf(marker) + 16)
    const head = caption === 'Your branch is in no lane' || caption === 'Release track' || isOnTrunk ? caption : ''
    if (head !== '') caption = `${esc(head)}<tspan fill="${yourClash.ink}">${esc(fit(` · ${yourClash.words}`, room - widthOf(head)))}</tspan>`
  }
  const cy = 368
  const dash = ' stroke-dasharray="3 3"'
  let out = wire(TALL.route, flow) + text(56, 352, caption)
  if (marker !== '' && !unknown) out += text(424, 352, esc(marker), { anchor: 'end' })

  // The joins, then the three stops over them. On the trunk with lanes, only your own stop.
  if (!isOnTrunk) {
    out += `<path d="M44 ${cy}H206" fill="none" stroke="${isBranchLit ? C.accent : C.wire}" stroke-width="${isBranchLit ? 1.75 : 1.5}"/>`
    out += `<path d="M234 ${cy}H396" fill="none" stroke="${C.wire}" stroke-width="1.5"/>`
  }
  if (isBranchLit) out += `<circle cx="30" cy="${cy}" r="16" fill="none" stroke="${C.ring}" stroke-width="4"/>`
  out += `<circle cx="30" cy="${cy}" r="13" fill="${C.canvas}" stroke="${unknown ? C.faint : isBranchLit ? C.accent : C.wire}" stroke-width="${isBranchLit ? 2 : 1.5}"${unknown ? dash : ''}/>`
  if (ahead > 0) out += text(30, cy + 4, `+${ahead > 99 ? 99 : ahead}`, { font: 'mono', anchor: 'middle', fill: C.text })
  if (here?.unpushed !== undefined && here.unpushed > 0) out += `<circle cx="40" cy="${cy - 10}" r="3.5" fill="${C.port}"/>`
  // A clash marks your branch's stop at its lower right, opposite the unpushed dot.
  if (yourClash !== undefined) out += clashMark(44, cy + 12, yourClash.level)

  const stageStroke = stageState === 'none' ? C.faint : stageState === 'behind' ? C.hl : stageState === 'plain' ? C.wire : C.accent
  if (!isOnTrunk) {
    out += `<circle cx="220" cy="${cy}" r="13" fill="${C.canvas}" stroke="${stageStroke}" stroke-width="1.5"${stageState === 'none' ? dash : ''}/>`
    if (stageState === 'yours') out += `<circle cx="220" cy="${cy}" r="3.5" fill="${C.accent}"/>`
    if (stageState === 'behind') out += text(220, cy + 4, String(stageCount > 99 ? 99 : stageCount), { font: 'mono', anchor: 'middle', fill: C.hl })
    if (stageState === 'passed') out += `<path d="M215 ${cy}l3.5 3.5 6.5 -7" fill="none" stroke="${C.accent}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`
    out += `<circle cx="410" cy="${cy}" r="13" fill="${C.canvas}" stroke="${hasLive ? C.wire : C.faint}" stroke-width="1.5"${hasLive ? '' : dash}/>`
  }

  // Labels under the stops: the middle one is placed first, and the outer two take the room left either side of it.
  const ly = 400
  if (isOnTrunk) {
    out += yourBranch(here, 16, ly, 408)
  } else if (unknown) {
    out += text(16, ly, esc(branchLabel === '' ? 'Working' : branchIn(branchLabel, 150)), { font: branchLabel === '' ? 'sans' : 'mono' })
    out += text(220, ly, 'Branch', { anchor: 'middle' }) + text(424, ly, 'Trunk', { anchor: 'end' })
  } else {
    const middle = fit(stageLabel, 120)
    const half = widthOf(middle) / 2
    out += yourBranch(here, 16, ly, 220 - half - 12 - 16)
    out += text(220, ly, esc(middle), { anchor: 'middle', fill: stageState === 'behind' ? C.hl : C.muted })
    if (liveLabel !== '') out += text(424, ly, esc(fitMono(liveLabel, 424 - (220 + half + 12))), { font: 'mono', anchor: 'end' })
  }

  // Every other lane as a card, in the order the track file gives them, then the merged branches at the foot.
  const rest = lanes.filter(lane => lane !== lit)
  const merged = here?.merged
  if (rest.length === 0 && merged === undefined) return { svg: out, h: TALL.h }
  const colours = laneColours(lanes)
  let y = 424
  for (const lane of rest) {
    const card = laneCard(lane, y + 6, now, colours.get(lane) ?? C.muted, names.staging, here)
    out += card.svg
    y += 6 + card.h
  }
  if (merged === undefined) return { svg: out, h: y + 10 }
  out += `<g transform="translate(18 ${y + 13}) scale(0.5833)" fill="none" stroke="${C.muted}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></g>`
  out += text(38, y + 24, merged === 0 ? 'No merged branches' : `${merged} merged ${merged === 1 ? 'branch' : 'branches'}`)

  return { svg: out, h: y + 38 }
}

/**
 * The wide board's lanes, in the right column: a header with the count and the
 * marker, your branch's name, then one row per lane in file order. The feed wire
 * runs from the tag to your lane's pad, which is lit; with no lane of yours it
 * ends loose beside the tag.
 */
function wideLanes(here: Here, lanes: readonly Lane[], now: number, flow: Wear, names: TrackNames): string {
  const lit = lanes.find(lane => lane.isHere)
  const marker = markerOf(here, lanes)

  // Five rows fit under the header. Past that, four rows and a count of the rest,
  // with your lane kept in sight in the last row if it would fall off the end.
  let shown = [...lanes]
  if (lanes.length > 5) {
    shown = lanes.slice(0, 4)
    if (lit !== undefined && !shown.includes(lit)) shown[3] = lit
  }
  const rowAt = (at: number): number => 80 + at * 44

  const count = `${lanes.length} ${lanes.length === 1 ? 'lane' : 'lanes'}${here.merged === undefined || here.merged === 0 ? '' : ` · ${here.merged} merged`}`.toUpperCase()
  let out = text(660, 28, count, { weight: 600, spacing: 0.6 })
  // Capitals with letter spacing run wider than the table's measure, so the count's width allows for both.
  // Where the marker does not fit whole, its short form ("by files", "tied", "no lane") does, rather than a cut.
  const markerRoom = 224 - (widthOf(count, 11, 600) * 1.08 + 0.6 * count.length) - 16
  const short: Record<string, string> = { 'lane from files': 'by files', 'lanes tied in files': 'tied', 'no lane in files': 'no lane' }
  const markerWords = widthOf(marker) <= markerRoom ? marker : short[marker] ?? marker
  if (marker !== '') out += text(884, 28, esc(fit(markerWords, markerRoom)), { anchor: 'end' })
  // Your branch, with a clash mark before it where it clashes.
  const yourClash = clashOf(here, here.branch, here.clash)
  out += yourClash === undefined ? yourBranch(here, 660, 46, 224) : clashMark(665, 42, yourClash.level) + yourBranch(here, 676, 46, 208)

  const litAt = lit === undefined ? -1 : shown.indexOf(lit)
  if (litAt >= 0) {
    const cy = rowAt(litAt)
    const bend = cy < 145 ? -1 : 1
    out += wire(`M630 145H636Q644 145 644 ${145 + bend * 8}V${cy - bend * 8}Q644 ${cy} 652 ${cy}H657`, flow)
  } else {
    out += wire('M630 145H648', flow) + `<circle cx="651.5" cy="145" r="3.5" fill="${C.canvas}" stroke="${C.port}" stroke-width="1.5"/>`
  }
  const colours = laneColours(lanes)
  shown.forEach((lane, at) => {
    out += laneLine(lane, rowAt(at), now, colours.get(lane) ?? C.muted, lane === lit, here, names.staging)
  })
  if (shown.length < lanes.length) out += text(688, 266, `+${lanes.length - shown.length} more`)

  return out
}

/**
 * The newest three calls, model turns left out, drawn under the wide board's tag:
 * a glyph, the station padded so the labels line up, and the label.
 */
function wideFeed(b: Board): string {
  const rows = b.rows.filter(r => r.station !== 'model').slice(-3).reverse()
  let out = ''
  rows.forEach((r, at) => {
    const glyph = r.status === 'run' ? '●' : r.status === 'ok' ? '·' : '✕'
    const line = fitMono(`${glyph} ${NAMES[r.station].padEnd(6)} ${r.label}`, 190)
    out += text(440, 216 + at * 20, esc(line).replace(/ /g, ' '), { font: 'mono', fill: r.status === 'run' ? C.text : r.status === 'err' ? C.hl : C.muted })
  })

  return out
}

/** The wide board's release section. With lanes, rows in the right column; without, three stops as before. */
function wideRelease(b: Board, names: TrackNames, now: number, flow: Wear): string {
  const repo = b.repo
  const here = repo !== undefined && repo.kind === 'repo' ? repo : undefined
  const dirty = here?.dirty ?? 0
  const ahead = here?.ahead ?? 0
  const behind = here?.behind ?? 0
  const unpushed = here?.unpushed

  type Stop = { name: string; under: string; count: string; isLit: boolean; isMarked?: boolean }
  const blank: Stop = { name: '', under: '', count: '', isLit: false }
  const working: Stop = { name: 'Working', under: dirty === 0 ? 'clean' : plural(dirty, 'file'), count: dirty === 0 ? '' : String(dirty), isLit: dirty > 0 }
  const hasWorkingStop = here !== undefined && here.staging === undefined
  const onBranch: Stop = {
    name: here === undefined ? 'Branch' : short(here.branch, 15),
    under: dirty > 0 && !hasWorkingStop ? `${dirty} uncommitted` : unpushed === undefined ? 'no remote' : unpushed > 0 ? `${unpushed} to push` : 'pushed',
    count: ahead === 0 ? '' : `+${ahead}`,
    isLit: ahead > 0 || dirty > 0,
    isMarked: unpushed !== undefined && unpushed > 0,
  }
  const stops: [Stop, Stop, Stop] =
    here === undefined
      ? [
          { ...blank, name: 'Working' },
          { ...blank, name: repo !== undefined && repo.kind === 'blocked' && repo.branch !== undefined ? short(repo.branch, 15) : 'Branch' },
          { ...blank, name: 'Trunk' },
        ]
      : here.staging !== undefined
        ? [
            onBranch,
            { name: short(names.staging, 15), under: `updated ${agoOf(here.staging.updatedAt, now)}`, count: here.staging.behind === 0 ? '' : String(here.staging.behind), isLit: false },
            { name: short(names.live, 15), under: here.tag === undefined ? 'the trunk' : short(here.tag, 15), count: '', isLit: false },
          ]
        : [
            working,
            onBranch,
            {
              name: here.trunk === undefined ? 'trunk' : short(here.trunk.replace(/^origin\//, ''), 15),
              under: here.trunk === undefined ? 'you are on it' : behind === 0 ? 'level' : `${behind} behind`,
              count: behind === 0 ? '' : String(behind),
              isLit: false,
            },
          ]

  const lanes = here?.lanes ?? []
  const nodes = [674, 770, 866]
  const cy = 145
  if (here !== undefined && lanes.length > 0) return wideLanes(here, lanes, now, flow, names)

  let out = wire(WIDE.route, flow) + `<path d="M${nodes[0]! + 14} ${cy}H${nodes[1]! - 14}M${nodes[1]! + 14} ${cy}H${nodes[2]! - 14}" fill="none" stroke="${C.wire}" stroke-width="1.5"/>`
  const labelX = [652, 770, 884]
  const labelAnchor = ['start', 'middle', 'end'] as const
  for (let at = 0; at < 3; at += 1) {
    const stop = stops[at]!
    const x = nodes[at]!
    const ring = here === undefined ? C.nodeLine : stop.isLit ? C.accent : C.wire
    const dash = here === undefined ? ' stroke-dasharray="3 3"' : ''
    out +=
      `<circle cx="${x}" cy="${cy}" r="13" fill="${C.canvas}" stroke="${ring}" stroke-width="${stop.isLit ? 2 : 1.5}"${dash}/>` +
      (stop.count === '' ? '' : text(x, cy + 4, stop.count, { font: 'mono', anchor: 'middle', fill: stop.isLit ? C.accent : C.muted })) +
      (stop.isMarked === true ? `<circle cx="${x + 11}" cy="${cy - 11}" r="3.5" fill="${C.port}"/>` : '') +
      // The column holds three labels of 72 px: the first starts at its edge, the last ends at the margin.
      text(labelX[at]!, 180, esc(fit(stop.name, 72)), { anchor: labelAnchor[at], fill: stop.isLit ? C.hl : C.muted }) +
      (stop.under === '' ? '' : text(labelX[at]!, 195, esc(fit(stop.under, 72)), { anchor: labelAnchor[at] }))
  }
  const said =
    here === undefined
      ? repo === undefined
        ? 'Reading the repository…'
        : repo.kind === 'blocked'
          ? `Git did not run: ${repo.why}`
          : repo.why === undefined
            ? 'No git repository in this folder'
            : `Git said: ${repo.why}`
      : here.staging === undefined
        ? 'Release track'
        : here.staging.subject

  return out + text(660, 110, esc(fit(said, 224)))
}

export function drawBoard(b: Board, isWide: boolean, names: TrackNames, now: number): string {
  const L = isWide ? WIDE : TALL
  const wearOf = (id: StationId): Wear => ((b.live[id] ?? 0) > 0 ? 'live' : 'idle')
  let wires = ''
  let chips = ''
  let pins = ''

  for (const id of Object.keys(L.spots) as StationId[]) {
    const s = L.spots[id]
    const wear = wearOf(id)
    const isLive = wear === 'live'
    const ink = isLive ? C.accent : C.muted
    const count = b.counts[id] ?? 0
    wires += wire(s.wire, wear)
    chips +=
      `<rect x="${s.x + 0.5}" y="${s.y + 0.5}" width="${s.w - 1}" height="27" rx="7.5" fill="${C.node}" stroke="${isLive ? C.accent : C.nodeLine}"/>` +
      // Each station's icon in its own colour; a running one turns silk.
      `<g transform="translate(${s.x + 7} ${s.y + 7}) scale(0.5833)" fill="none" stroke="${isLive ? C.accent : STATION_TONE[id] ?? C.muted}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</g>` +
      text(s.x + 28, s.y + 18, NAMES[id], { fill: isLive ? C.accent : id === 'you' ? C.text : C.muted }) +
      // On the narrow chips (Files, Shell) a count of two or three figures takes smaller type and the edge, so it stays clear of the name.
      (count > 0
        ? count > 9 && s.w < 100
          ? text(s.x + s.w - 6, s.y + 17.5, count > 99 ? '99+' : String(count), { font: 'mono', size: count > 99 ? 9 : 10, anchor: 'end', fill: ink })
          : text(s.x + s.w - 8, s.y + 18, count > 99 ? '99+' : String(count), { font: 'mono', anchor: 'end', fill: ink })
        : '')
    pins += `<circle cx="${s.pin[0]}" cy="${s.pin[1]}" r="3.5" fill="${C.canvas}" stroke="${isLive ? C.accent : C.port}" stroke-width="1.5"/>`
  }

  // The newest call still running names what Claude is doing; the lit station already says which tool.
  const running = [...b.rows].reverse().find(r => r.status === 'run')
  const doing = running !== undefined ? running.label : b.isWorking ? 'Thinking' : 'Waiting for you'
  const cx = L.core.x + 70
  const lift = b.context === undefined ? 10 : 0
  const core =
    (b.isWorking ? `<rect x="${L.core.x - 2}" y="${L.core.y - 2}" width="144" height="154" rx="12" fill="none" stroke="${C.ring}" stroke-width="4"/>` : '') +
    `<rect x="${L.core.x + 0.5}" y="${L.core.y + 0.5}" width="139" height="149" rx="9.5" fill="${C.node}" stroke="${b.isWorking ? C.accent : C.nodeLine}"/>` +
    text(cx, L.core.y + 47 + lift, 'CLAUDE', { font: 'mono', size: 15, weight: 500, spacing: 2, anchor: 'middle', fill: C.text }) +
    text(cx, L.core.y + 68 + lift, esc(b.model === undefined ? '' : shortModel(b.model)), { font: 'mono', anchor: 'middle' }) +
    text(cx, L.core.y + 90 + lift, esc(fit(doing, 124)), { anchor: 'middle', fill: C.text }) +
    (b.context === undefined ? '' : text(cx, L.core.y + 110, `context ${Math.round(b.context)}%`, { font: 'mono', anchor: 'middle' }))

  // Files and Shell are the two stations that change the repository: their wires merge and run on to the branch.
  const repo = b.repo
  const here = repo !== undefined && repo.kind === 'repo' ? repo : undefined
  const dirty = here?.dirty ?? 0
  const isWriting = wearOf('files') === 'live' || wearOf('shell') === 'live'
  const edits = b.edited.length
  const flow: Wear = isWriting ? 'live' : edits > 0 || dirty > 0 ? 'used' : 'idle'
  const tagText =
    here === undefined
      ? edits > 0 ? `${plural(edits, 'file')} edited this turn` : 'no file edits yet'
      : dirty > 0
        ? isWide || dirty > 9 ? `${plural(dirty, 'file')} · not committed` : `${plural(dirty, 'file')} changed · not committed`
        : edits > 0 ? `${edits} edited · all committed` : 'nothing to commit'
  const tag =
    `<rect x="${L.tag.x + 0.5}" y="${L.tag.y + 0.5}" width="${L.tag.w - 1}" height="25" rx="12.5" fill="${C.canvas}" stroke="${flow === 'idle' ? C.nodeLine : C.accent}"/>` +
    text(L.tag.x + L.tag.w / 2, L.tag.y + 17, esc(fitMono(tagText, L.tag.w - 12)), { font: 'mono', anchor: 'middle', fill: flow === 'idle' ? C.muted : C.accent })

  const release = isWide ? { svg: wideRelease(b, names, now, flow) + wideFeed(b), h: WIDE.h } : tallRelease(b, names, now, flow)

  // The clash summary where the eye lands first, beside NOW; nothing at all when the repository is clean.
  // Wide, the Model chip sits 100 px to the right of NOW, so the two counts stack under it instead.
  const summary = here === undefined ? [] : clashSummary(strongClashes(here))
  const summarySvg =
    summary.length === 0
      ? ''
      : isWide
        ? summary.map((p, at) => text(16, 46 + at * 16, esc(fit(p.words.replace(/^ · /, ''), 100)), { fill: p.fill })).join('')
        : line(60, 28, summary, 190)
  // In the wide layout the count stops short of the lanes column.
  const head =
    summarySvg +
    text(16, 28, 'NOW', { weight: 600, spacing: 0.6 }) +
    text(isWide ? 630 : L.w - 16, 28, `${b.calls} tool call${b.calls === 1 ? '' : 's'} this turn`, { font: 'mono', anchor: 'end' })

  // The frame trims the margin and sizes the canvas to what is drawn; the wide board keeps one height.
  return frame(L.w, head + wires + wire(L.merge, flow) + core + chips + pins + tag + release.svg, isWide ? WIDE_HEIGHT : 0)
}
