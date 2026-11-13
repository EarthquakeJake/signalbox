import type { Lane } from '../types'

/** One lane's row, and where its pads sit inside it. */
type Shape = {
  /** The left edge of the lane block. */
  left: number
  /** The right edge, where the live tag ends. */
  right: number
  /** The bus every lane's first pad sits on. */
  bus: number
  /** The staging pad. */
  stage: number
  /** The row's height, and where the first row's middle falls. */
  row: number
  top: number
  /** How many characters the two texts hold. */
  liveChars: number
  stageChars: number
}

export const TALL_LANES: Shape = { left: 16, right: 424, bus: 96, stage: 208, row: 40, top: 334, liveChars: 20, stageChars: 26 }
export const WIDE_LANES: Shape = { left: 656, right: 884, bus: 672, stage: 764, row: 44, top: 48, liveChars: 14, stageChars: 13 }

/** How long ago, in the fewest characters that still say it. */
export const agoOf = (then: number, now: number): string => {
  const mins = Math.max(0, Math.round((now - then) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`

  return `${Math.round(hours / 24)}d ago`
}

const cut = (text: string, most: number): string => (text.length <= most ? text : `${text.slice(0, most - 1)}…`)

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const laneHeight = (count: number, shape: Shape): number => shape.top + count * shape.row + 12

/**
 * The lanes, each a row: its name and what is live on it above, its branches
 * and its staging below, hung off one bus the way the branches are drawn on a
 * board. The lane you are working in is the lit one.
 */
export function drawLanes(lanes: readonly Lane[], shape: Shape, now: number, colors: { canvas: string; wire: string; nodeLine: string; text: string; muted: string; accent: string; hl: string }, sans: string, mono: string): string {
  if (lanes.length === 0) return ''
  const C = colors
  const middleOf = (at: number): number => shape.top + shape.row / 2 + at * shape.row
  const lastY = middleOf(lanes.length - 1) + 9

  // The bus: one line down the lanes, with every lane's first pad sitting on it.
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

    out += `<g${faded}>`
    out +=
      `<text x="${shape.left}" y="${topLine}" ${sans} font-size="11" font-weight="600" fill="${isLit ? C.hl : C.text}">${esc(cut(lane.name, 16))}</text>` +
      (lane.live === undefined
        ? ''
        : `<text x="${shape.right}" y="${topLine}" text-anchor="end" ${mono} font-size="11" fill="${C.muted}">${esc(cut(lane.live, shape.liveChars))}</text>`) +
      `<path d="M${shape.bus + 7} ${padLine}H${shape.stage - 7}" fill="none" stroke="${C.wire}" stroke-width="1.5"/>` +
      `<circle cx="${shape.bus}" cy="${padLine}" r="7" fill="${C.canvas}" stroke="${isLit ? C.accent : C.wire}" stroke-width="${isLit ? 2 : 1.5}"/>` +
      `<text x="${shape.bus + 14}" y="${padLine + 4}" ${mono} font-size="11" fill="${isLit ? C.accent : C.muted}">${lane.branches}</text>` +
      `<circle cx="${shape.stage}" cy="${padLine}" r="7" fill="${C.canvas}" stroke="${stageInk}" stroke-width="1.5"${lane.staging === undefined ? ' stroke-dasharray="3 3"' : ''}/>` +
      `<text x="${shape.stage + 14}" y="${padLine + 4}" ${sans} font-size="11" fill="${C.muted}">${esc(
        cut(
          lane.staging === undefined
            ? lane.isParked === true
              ? 'parked'
              : 'no staging'
            : `${agoOf(lane.staging.updatedAt, now)}${lane.staging.behind > 0 ? ` · ${lane.staging.behind} behind` : lane.isPassed === true ? ' · passed' : ''}`,
          shape.stageChars,
        ),
      )}</text>` +
      (lane.isPassed === true && stale === false
        ? `<path d="M${shape.stage - 3.5} ${padLine}l1.5 2 3.5 -4.5" fill="none" stroke="${C.accent}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`
        : '')
    out += `</g>`
  }

  return out
}
