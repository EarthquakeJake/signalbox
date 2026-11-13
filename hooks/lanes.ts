import type { Lane } from '../types'

// A dark circuit-board look in the Ink tokens. Silk marks what is running now;
// copper marks connection points and where you are.
export const C = {
  canvas: '#081013', node: '#0F191D', nodeLine: '#22323A', line: '#1A272D', dot: '#16232A',
  wire: '#3E525A', text: '#EAF0EE', muted: '#8A9B98', faint: '#55656A',
  accent: '#F1EDE3', ring: 'rgba(241,237,227,0.12)', port: '#C98B5E', hl: '#D4976A',
}
// Inter and JetBrains Mono where the host has them, the system's own faces where it does not.
export const SANS = `font-family="Inter, 'Segoe UI', system-ui, sans-serif"`
export const MONO = `font-family="'JetBrains Mono', Consolas, ui-monospace, monospace"`

export const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Measured widths of the printable ASCII letters at 11 px, in tenths of a pixel,
// from space to `~`: the wider of Inter and Segoe UI for each letter, so a fitted
// text stays inside its room in either face. One row at 400, one at 600.
const SANS_400 = [31, 32, 52, 70, 71, 108, 80, 33, 41, 41, 56, 76, 32, 51, 32, 43, 70, 60, 68, 68, 72, 66, 69, 63, 69, 69, 32, 34, 76, 76, 76, 57, 107, 76, 72, 81, 80, 67, 65, 83, 82, 30, 63, 74, 63, 100, 83, 85, 71, 85, 71, 71, 71, 82, 76, 109, 75, 75, 70, 41, 42, 41, 76, 51, 36, 62, 68, 63, 68, 65, 41, 68, 65, 27, 27, 61, 27, 97, 65, 66, 68, 68, 42, 59, 38, 65, 62, 90, 60, 62, 61, 47, 37, 47, 76]
const SANS_600 = [31, 36, 58, 71, 72, 111, 82, 36, 41, 41, 60, 77, 36, 52, 36, 46, 73, 47, 69, 70, 74, 68, 71, 64, 71, 71, 36, 37, 77, 77, 77, 60, 110, 80, 73, 81, 80, 67, 65, 83, 82, 33, 64, 78, 63, 102, 85, 85, 71, 85, 72, 72, 73, 81, 80, 113, 80, 79, 72, 41, 45, 41, 77, 52, 39, 64, 69, 65, 69, 65, 43, 69, 68, 29, 29, 63, 29, 99, 68, 67, 69, 69, 44, 61, 40, 68, 65, 93, 63, 65, 63, 50, 40, 50, 77]

/** How wide a sans text draws, in pixels, at a size and weight. Letters outside the table count as wide ones. */
export const widthOf = (text: string, size = 11, weight = 400): number => {
  const table = weight >= 600 ? SANS_600 : SANS_400
  let tenths = 0
  for (const letter of text) {
    const code = letter.codePointAt(0) ?? 0
    tenths += code >= 32 && code < 127 ? (table[code - 32] as number) : letter === '·' ? 36 : letter === '…' ? 106 : 100
  }

  return (tenths / 10) * (size / 11)
}

/** JetBrains Mono is 0.6 em a letter; Consolas, its stand-in, is narrower, so this is the safe side. */
export const monoWidth = (text: string, size = 11): number => [...text].length * size * 0.6

const cutTo = (text: string, most: number, measure: (t: string) => number): string => {
  if (measure(text) <= most) return text
  let out = [...text]
  while (out.length > 1 && measure(`${out.join('')}…`) > most) out = out.slice(0, -1)

  return `${out.join('').trimEnd()}…`
}

/** Sans text cut to a width in pixels rather than a count of letters, so wide letters cannot run long. */
export const fit = (text: string, most: number, size = 11, weight = 400): string => cutTo(text, most, t => widthOf(t, size, weight))

/** Mono text cut to a width in pixels. */
export const fitMono = (text: string, most: number, size = 11): string => cutTo(text, most, t => monoWidth(t, size))

/** A branch name in the room given: whole if it fits, else without a leading `claude/` style word, else cut. */
export const branchIn = (branch: string, most: number): string => {
  if (monoWidth(branch) <= most) return branch

  return fitMono(branch.replace(/^[^/]+\//, ''), most)
}

type TextOptions = { font?: 'sans' | 'mono'; size?: number; weight?: number; fill?: string; anchor?: 'start' | 'middle' | 'end'; spacing?: number }

/** One `<text>`; the words must already be escaped. */
export const text = (x: number, y: number, words: string, o: TextOptions = {}): string =>
  `<text x="${x}" y="${y}"${o.anchor === undefined || o.anchor === 'start' ? '' : ` text-anchor="${o.anchor}"`} ${o.font === 'mono' ? MONO : SANS} font-size="${o.size ?? 11}"${o.weight === undefined ? '' : ` font-weight="${o.weight}"`}${o.spacing === undefined ? '' : ` letter-spacing="${o.spacing}"`} fill="${o.fill ?? C.muted}">${words}</text>`

/** How long ago, in the fewest characters that still say it. */
export const agoOf = (then: number, now: number): string => {
  const mins = Math.max(0, Math.round((now - then) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`

  return `${Math.round(hours / 24)}d ago`
}

/** The few words a lane's staging gets, and the part of them that carries news, with its colour. */
export function stagingWords(lane: Lane, now: number): { when: string; news: string; tone: string } {
  if (lane.isParked === true) return { when: 'parked', news: '', tone: C.muted }
  if (lane.staging === undefined) return { when: 'no staging', news: '', tone: C.muted }
  const when = agoOf(lane.staging.updatedAt, now)
  if (lane.hasYours === true) return { when, news: 'yours', tone: C.text }
  if (lane.hasYours === false && lane.isHere) return { when, news: 'not yet', tone: C.muted }
  if (lane.staging.behind > 0) return { when, news: `${lane.staging.behind} behind`, tone: C.hl }
  if (lane.isPassed === true) return { when, news: 'passed', tone: C.accent }

  return { when, news: '', tone: C.muted }
}

/**
 * One quiet lane row: a pad with the lane's open branch count, its name, how its
 * staging stands and its live tag. Tall rows are one line; wide rows put the
 * staging under the name. The lit row is the lane you are working in.
 */
export function laneRow(lane: Lane, cy: number, now: number, shape: 'tall' | 'wide', isLit: boolean): string {
  const isTall = shape === 'tall'
  const padX = isTall ? 26 : 670
  const nameX = isTall ? 44 : 688
  const right = isTall ? 424 : 884
  const name = fit(lane.name, isTall ? 96 : 92, 13, 600)
  const nameEnd = nameX + widthOf(name, 13, 600)
  const live = lane.live === undefined ? '' : fitMono(lane.live, isTall ? 120 : right - (nameEnd + 12))
  const words = stagingWords(lane, now)

  // The staging words take what the live tag leaves on a tall row, or the whole width under a wide one.
  const stageX = isTall ? 150 : nameX
  const stageY = isTall ? cy + 4 : cy + 20
  const stageRoom = isTall ? right - (live === '' ? 0 : monoWidth(live) + 12) - stageX : right - stageX
  const head = lane.staging === undefined || lane.isParked === true ? words.when : `staging ${words.when}`
  const tail = words.news === '' ? '' : ` · ${words.news}`
  const whole = fit(`${head}${tail}`, stageRoom)
  const stage =
    whole === `${head}${tail}` && tail !== ''
      ? `${esc(head)}<tspan fill="${words.tone}">${esc(tail)}</tspan>`
      : esc(whole)

  let out = `<g${lane.isParked === true ? ' opacity="0.45"' : ''}>`
  if (isLit) out += `<circle cx="${padX}" cy="${cy}" r="11" fill="none" stroke="${C.ring}" stroke-width="4"/>`
  out +=
    `<circle cx="${padX}" cy="${cy}" r="9" fill="${C.canvas}" stroke="${isLit ? C.accent : C.wire}" stroke-width="${isLit ? 2 : 1.5}"/>` +
    // Three figures would overrun the pad, so a hundred or more reads as `99+` in smaller type.
    (lane.branches > 99
      ? text(padX, cy + 3, '99+', { font: 'mono', size: 8, anchor: 'middle', fill: isLit ? C.text : C.muted })
      : text(padX, cy + 4, String(lane.branches), { font: 'mono', anchor: 'middle', fill: isLit ? C.text : lane.branches === 0 ? C.faint : C.muted })) +
    text(nameX, cy + 4.5, esc(name), { size: 13, weight: 600, fill: isLit ? C.hl : C.text }) +
    (live === '' ? '' : text(right, cy + 4, esc(live), { font: 'mono', anchor: 'end' })) +
    text(stageX, stageY, stage)

  return `${out}</g>`
}

/** Where the old wide lanes sit: a bus down the right column, one pad per lane. */
type Shape = { left: number; right: number; bus: number; stage: number; row: number; top: number; liveChars: number; stageChars: number }

export const WIDE_LANES: Shape = { left: 656, right: 884, bus: 672, stage: 746, row: 44, top: 48, liveChars: 15, stageChars: 20 }

const cut = (words: string, most: number): string => (words.length <= most ? words : `${words.slice(0, most - 1)}…`)

/**
 * The wide board's lanes, each a row: its name and what is live on it above, its
 * branches and its staging below, hung off one bus. The lane you are working in is the lit one.
 */
export function drawLanes(lanes: readonly Lane[], shape: Shape, now: number): string {
  if (lanes.length === 0) return ''
  const middleOf = (at: number): number => shape.top + shape.row / 2 + at * shape.row
  const lastY = middleOf(lanes.length - 1) + 9

  let out = `<path d="M${shape.bus} ${shape.top}V${lastY}" fill="none" stroke="${C.wire}" stroke-width="1.5"/>`

  for (let at = 0; at < lanes.length; at += 1) {
    const lane = lanes[at]
    if (lane === undefined) continue
    const mid = middleOf(at)
    const topLine = mid - 6
    const padLine = mid + 9
    const isLit = lane.isHere && lane.isParked !== true
    const stale = lane.staging !== undefined && lane.staging.behind > 0
    const stageInk = lane.staging === undefined ? C.nodeLine : stale ? C.hl : lane.isPassed === true ? C.accent : C.wire
    const faded = lane.isParked === true ? ' opacity="0.45"' : ''
    const name = esc(cut(lane.name, 16))
    const words = stagingWords(lane, now)

    // The halo that breaks the bus behind a name is drawn at full strength,
    // outside the faded group, so a parked lane hides the bus as well as any.
    out += `<text x="${shape.left}" y="${topLine}" ${SANS} font-size="11" font-weight="600" fill="none" stroke="${C.canvas}" stroke-width="4" stroke-linejoin="round">${name}</text>`
    out += `<g${faded}>`
    out +=
      `<text x="${shape.left}" y="${topLine}" ${SANS} font-size="11" font-weight="600" fill="${isLit ? C.hl : C.text}">${name}</text>` +
      (lane.live === undefined ? '' : `<text x="${shape.right}" y="${topLine}" text-anchor="end" ${MONO} font-size="11" fill="${C.muted}">${esc(cut(lane.live, shape.liveChars))}</text>`) +
      `<path d="M${shape.bus + 32} ${padLine}H${shape.stage - 7}" fill="none" stroke="${C.wire}" stroke-width="1.5"/>` +
      `<circle cx="${shape.bus}" cy="${padLine}" r="7" fill="${C.canvas}" stroke="${isLit ? C.accent : C.wire}" stroke-width="${isLit ? 2 : 1.5}"/>` +
      `<text x="${shape.bus + 13}" y="${padLine + 4}" ${MONO} font-size="11" fill="${isLit ? C.accent : C.muted}">${lane.branches}</text>` +
      `<circle cx="${shape.stage}" cy="${padLine}" r="7" fill="${C.canvas}" stroke="${stageInk}" stroke-width="1.5"${lane.staging === undefined ? ' stroke-dasharray="3 3"' : ''}/>` +
      `<text x="${shape.stage + 14}" y="${padLine + 4}" ${SANS} font-size="11" fill="${C.muted}">${esc(cut(lane.staging === undefined ? words.when : `${words.when}${words.news === '' ? '' : ` · ${words.news}`}`, shape.stageChars))}</text>` +
      (lane.isPassed === true && stale === false
        ? `<path d="M${shape.stage - 3.5} ${padLine}l1.5 2 3.5 -4.5" fill="none" stroke="${C.accent}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`
        : '')
    out += `</g>`
  }

  return out
}
