import type { Lane, OpenBranch } from '../types'

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

// Each lane's own colour, from the Silkscreen category set. Red and amber are
// left out, being the danger and warning tones of the pills, and slate, which reads as no colour.
const CATS = ['#A5B4FC', '#F0ABFC', '#7DD3FC', '#86EFAC', '#5EEAD4']
export const TONE = {
  warn: { ink: '#E9B44C', soft: 'rgba(233,180,76,0.12)' },
  danger: { ink: '#F87171', soft: 'rgba(248,113,113,0.12)' },
  plain: { ink: C.muted, soft: '#111C20' },
}

/**
 * A branch this far behind the trunk gets a danger pill. Silkscreen's working
 * branches sit around 90 to 110 behind, so a lower mark would paint most rows red.
 */
export const FAR_BEHIND = 100
/** A branch whose newest commit is older than this many days gets a `Stale` pill. */
export const STALE_DAYS = 14

const hash = (words: string): number => [...words].reduce((sum, letter) => (sum * 31 + (letter.codePointAt(0) ?? 0)) % 9973, 7)

/**
 * A colour for every lane: keyed on its id so it stays put when lanes are added
 * or moved, falling back to its place in the file. Two lanes do not share one
 * while there are colours left; a clash moves the later lane to the next free one.
 */
export function laneColours(lanes: readonly Lane[]): Map<Lane, string> {
  const out = new Map<Lane, string>()
  const used = new Set<number>()
  lanes.forEach((lane, at) => {
    let pick = lane.id === undefined || lane.id === '' ? at % CATS.length : hash(lane.id) % CATS.length
    for (let step = 0; step < CATS.length && used.has(pick); step += 1) pick = (pick + 1) % CATS.length
    used.add(pick)
    if (used.size === CATS.length) used.clear()
    out.set(lane, CATS[pick] as string)
  })

  return out
}

// Line icons on a 24 px grid, chosen by the words in a lane's id and name.
const LANE_ICONS: Array<[RegExp, string]> = [
  [/app|mobile|ios|android|desktop/, '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'],
  [/site|web|landing|www|page/, '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/>'],
  [/cloud|hosting|deploy/, '<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.4 4.3 4.3 0 0 0 7 18z"/>'],
  [/platform|infra|api|server|backend|core|service/, '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'],
  [/doc|guide|blog|content/, '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'],
]
const LANE_ICON = '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/>'
const iconOf = (lane: Lane): string => {
  const words = `${lane.id ?? ''} ${lane.name}`.toLowerCase()
  return LANE_ICONS.find(([pattern]) => pattern.test(words))?.[1] ?? LANE_ICON
}

/** A lane's tile: a small square tinted in its colour, with its icon. Lit, it takes the silk ring of where you are. */
export function laneTile(lane: Lane, x: number, y: number, size: number, colour: string, isLit = false): string {
  const scale = ((size - 8) / 24).toFixed(4)
  return (
    (isLit ? `<rect x="${x - 3}" y="${y - 3}" width="${size + 6}" height="${size + 6}" rx="8" fill="none" stroke="${C.ring}" stroke-width="4"/>` : '') +
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="${size - 1}" height="${size - 1}" rx="5.5" fill="${colour}" fill-opacity="0.14" stroke="${isLit ? C.accent : colour}" stroke-opacity="${isLit ? 1 : 0.4}" stroke-width="${isLit ? 1.5 : 1}"/>` +
    `<g transform="translate(${x + 4} ${y + 4}) scale(${scale})" fill="none" stroke="${colour}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconOf(lane)}</g>`
  )
}

/** A pill ending at `right`, centred on `cy`; returns the drawing and where it starts. */
export function pill(right: number, cy: number, words: string, tone: 'warn' | 'danger' | 'plain', mono = false, height = 20): { svg: string; left: number } {
  const t = TONE[tone]
  const width = Math.ceil((mono ? monoWidth(words) : widthOf(words)) + 16)
  const left = right - width
  return {
    left,
    svg:
      `<rect x="${left + 0.5}" y="${cy - height / 2 + 0.5}" width="${width - 1}" height="${height - 1}" rx="${(height - 1) / 2}" fill="${t.soft}"${tone === 'plain' ? ` stroke="${C.nodeLine}"` : ''}/>` +
      text(left + width / 2, cy + 4, esc(words), { font: mono ? 'mono' : 'sans', anchor: 'middle', fill: t.ink }),
  }
}

/** `app-v3.14.0` reads as `3.14.0 live`: the lane's word and a leading `v` come off. */
export const liveWords = (tag: string): string => `${tag.replace(/^[A-Za-z][A-Za-z_]*[-/]/, '').replace(/^v(?=\d)/, '')} live`

/** What is open in a lane, in a few words. */
const inFlight = (lane: Lane): string => (lane.branches === 0 ? 'Nothing in flight' : `${lane.branches} ${lane.branches === 1 ? 'branch' : 'branches'}`)

/** The pills an open branch earns, the stronger first. */
const flagsOf = (b: OpenBranch, now: number): Array<{ words: string; tone: 'warn' | 'danger' }> => [
  ...(b.behind >= FAR_BEHIND ? [{ words: `${b.behind} behind`, tone: 'danger' as const }] : []),
  ...(now - b.updatedAt > STALE_DAYS * 86400000 ? [{ words: 'Stale', tone: 'warn' as const }] : []),
]

export type Piece = { words: string; fill: string }

/** A line of pieces, each with its colour: whole pieces while they fit, the first one cut if it must be. */
export function line(x: number, y: number, pieces: Piece[], most: number): string {
  let used = 0
  let out = ''
  for (const [at, p] of pieces.entries()) {
    const w = widthOf(p.words)
    if (used + w > most) {
      if (at === 0) out += `<tspan fill="${p.fill}">${esc(fit(p.words, most))}</tspan>`
      break
    }
    out += `<tspan fill="${p.fill}">${esc(p.words)}</tspan>`
    used += w
  }

  return text(x, y, out)
}

/** The words under a lane's name about its staging. */
function stagingPieces(lane: Lane, now: number, stagingName: string): Piece[] {
  if (lane.isParked === true) return [{ words: lane.staging === undefined ? 'Set aside' : `Set aside · ${stagingName} ${agoOf(lane.staging.updatedAt, now)}`, fill: C.muted }]
  if (lane.staging === undefined) return [{ words: `No ${stagingName.toLowerCase()} yet`, fill: TONE.warn.ink }]
  const words = stagingWords(lane, now)
  return [{ words: `${stagingName} ${words.when}`, fill: C.muted }, ...(words.news === '' ? [] : [{ words: ` · ${words.news}`, fill: words.tone }])]
}

/**
 * One lane as a card on the tall board: its tile and name with what is in
 * flight, its live tag as a pill, its staging underneath, then up to four of
 * its open branches with how far ahead they are, and a pill where one is far
 * behind or stale. Returns the drawing and its height.
 */
export function laneCard(lane: Lane, top: number, now: number, colour: string, stagingName: string): { svg: string; h: number } {
  const left = 16
  const right = 424
  const inner = right - 12
  const open = lane.open ?? []
  const more = Math.max(0, lane.branches - open.length)
  const rows = open.length + (more > 0 && open.length > 0 ? 1 : 0)
  const h = 58 + (rows > 0 ? 8 + rows * 20 + 4 : 0)

  let out = `<g${lane.isParked === true ? ' opacity="0.45"' : ''}>`
  out += `<rect x="${left + 0.5}" y="${top + 0.5}" width="${right - left - 1}" height="${h - 1}" rx="10" fill="${C.node}" stroke="${C.nodeLine}"/>`
  out += laneTile(lane, 28, top + 12, 22, colour)

  // The live tag on the right, then the name and what is in flight in the room it leaves.
  const live = lane.live === undefined ? undefined : pill(inner, top + 23, fitMono(liveWords(lane.live), 120), 'plain', true)
  if (live !== undefined) out += live.svg
  const room = (live === undefined ? inner : live.left - 10) - 58
  const name = fit(lane.name, Math.min(150, room - 40), 13, 600)
  const nameW = widthOf(name, 13, 600)
  out += text(58, top + 28, esc(name), { size: 13, weight: 600, fill: C.text })
  const flight = fit(lane.isParked === true ? `Parked · ${inFlight(lane).toLowerCase()}` : inFlight(lane), room - nameW - 8)
  if (flight !== '…') out += text(58 + nameW + 8, top + 28, esc(flight))
  out += line(58, top + 46, stagingPieces(lane, now, stagingName), inner - 58)

  if (rows > 0) {
    out += `<path d="M28 ${top + 58.5}H${inner}" fill="none" stroke="${C.line}" stroke-width="1"/>`
    open.forEach((b, at) => {
      const mid = top + 76 + at * 20
      // Pills from the right edge inward, then the ahead count after the name, which takes what is left.
      let edge = inner
      for (const flag of flagsOf(b, now)) {
        const p = pill(edge, mid, flag.words, flag.tone, false, 18)
        out += p.svg
        edge = p.left - 6
      }
      const ahead = `+${b.ahead}`
      const shown = branchIn(b.name, edge - 4 - 44 - monoWidth(ahead) - 8)
      out += `<circle cx="34" cy="${mid}" r="2.5" fill="${colour}"/>`
      out += text(44, mid + 4, esc(shown), { font: 'mono', fill: C.text })
      out += text(44 + monoWidth(shown) + 8, mid + 4, ahead, { font: 'mono' })
    })
    if (more > 0) out += text(44, top + 80 + open.length * 20, `+${more} more`)
  }

  return { svg: `${out}</g>`, h }
}

/**
 * One lane in the wide board's right column: its tile, name and live pill on
 * the first line; what is in flight, the worst of its branches and its staging
 * on the second. The lit lane is the one you are working in.
 */
export function laneLine(lane: Lane, cy: number, now: number, colour: string, isLit: boolean): string {
  const right = 884
  let out = `<g${lane.isParked === true ? ' opacity="0.45"' : ''}>`
  out += laneTile(lane, 660, cy - 10, 20, colour, isLit)
  const name = fit(lane.name, 110, 13, 600)
  const nameEnd = 688 + widthOf(name, 13, 600)
  out += text(688, cy + 4.5, esc(name), { size: 13, weight: 600, fill: isLit ? C.hl : C.text })
  if (lane.live !== undefined) {
    const words = fitMono(liveWords(lane.live), right - nameEnd - 12 - 16)
    if (words !== '…') out += pill(right, cy, words, 'plain', true, 18).svg
  }

  // The open branches are counted by their worst flag here, far behind before stale.
  const flags = (lane.open ?? []).map(b => flagsOf(b, now))
  const far = flags.filter(f => f.some(flag => flag.tone === 'danger')).length
  const stale = flags.filter(f => f.some(flag => flag.tone === 'warn')).length
  const worst = far > 0 ? { words: `${far} far behind`, tone: 'danger' as const } : stale > 0 ? { words: `${stale} stale`, tone: 'warn' as const } : undefined
  const pieces: Piece[] = [
    { words: lane.isParked === true ? 'Parked' : inFlight(lane), fill: C.muted },
    ...(worst === undefined ? [] : [{ words: ` · ${worst.words}`, fill: TONE[worst.tone].ink }]),
    ...(lane.isParked === true ? [] : stagingPieces(lane, now, 'staging').map((p, at) => (at === 0 ? { ...p, words: ` · ${p.words}` } : p))),
  ]
  out += line(688, cy + 20, pieces, right - 688)

  return `${out}</g>`
}
