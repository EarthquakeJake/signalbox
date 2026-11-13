import type { Clash, Lane, OpenBranch } from '../types'

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

// The canvas margin. Every view is laid out with 16 px at the sides and about 20
// at the top; the frame moves the drawing by this much so it keeps 8 at the
// sides and 10 at the top, and ends 10 below the lowest thing drawn.
const MARGIN_SHIFT = { x: 8, y: 10 }
const MARGIN_FOOT = 10
/** The wide views' one height, board and spine alike, whatever they hold: 284 less the trimmed margin. */
export const WIDE_HEIGHT = 268

const round = (n: number): string => String(Math.round(n * 100) / 100)

/** A path's `d` moved by (dx, dy): absolute commands move, relative ones already follow. Also returns its lowest y. */
function movePath(d: string, dx: number, dy: number): { d: string; bottom: number } {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? []
  let out = ''
  let bottom = -Infinity
  let cmd = ''
  let at = 0 // place within the current command's arguments
  let y = 0
  for (const t of tokens) {
    if (/[a-zA-Z]/.test(t)) {
      cmd = t
      at = 0
      out += t
      continue
    }
    const n = Number(t)
    let v = n
    const isAbs = cmd === cmd.toUpperCase()
    switch (cmd.toUpperCase()) {
      case 'H':
        v = isAbs ? n - dx : n
        break
      case 'V':
        v = isAbs ? n - dy : n
        if (isAbs) y = n
        else y += n
        break
      case 'A': {
        const k = at % 7
        if (isAbs && k === 5) v = n - dx
        if (isAbs && k === 6) {
          v = n - dy
          y = n
        }
        break
      }
      default: {
        // M L T Q S C: coordinate pairs.
        const isX = at % 2 === 0
        if (isAbs) v = isX ? n - dx : n - dy
        if (!isX) y = isAbs ? n : y + n
      }
    }
    bottom = Math.max(bottom, y)
    out += `${out.endsWith(cmd) ? '' : ' '}${round(v)}`
    at += 1
  }

  return { d: out, bottom }
}

/**
 * A view's drawing in its frame: moved up and left by the trimmed margin, with
 * the canvas `width - 16` wide and as tall as the drawing needs plus the foot
 * margin. Icon groups move by their `translate`; what is inside them stays as
 * drawn. Every other element's x, y, cx, cy and path is moved.
 */
export function frame(width: number, body: string, least = 0): string {
  const { x: dx, y: dy } = MARGIN_SHIFT
  let bottom = 0
  const stack: boolean[] = []
  const moved = body.replace(/<(\/?)(\w+)([^>]*?)(\/?)>/g, (tag, close: string, name: string, attrs: string, self: string) => {
    if (name === 'g') {
      if (close === '/') {
        stack.pop()
        return tag
      }
      const t = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)(?: scale\(([\d.]+)\))?/.exec(attrs)
      const isInside = stack.some(Boolean)
      if (self !== '/') stack.push(t !== null)
      if (t === null || isInside) return tag
      const scale = t[3] === undefined ? 1 : Number(t[3])
      bottom = Math.max(bottom, Number(t[2]) + 24 * scale)
      return tag.replace(t[0], `translate(${round(Number(t[1]) - dx)} ${round(Number(t[2]) - dy)})${t[3] === undefined ? '' : ` scale(${t[3]})`}`)
    }
    if (close === '/' || stack.some(Boolean)) return tag
    let out = tag
    const num = (key: string): number | undefined => {
      const m = new RegExp(`\\s${key}="([-\\d.]+)"`).exec(attrs)
      return m === null ? undefined : Number(m[1])
    }
    const set = (key: string, by: number): void => {
      out = out.replace(new RegExp(`(\\s${key}=")([-\\d.]+)(")`), (_m, a: string, v: string, b: string) => `${a}${round(Number(v) - by)}${b}`)
    }
    if (name === 'path') {
      const d = /\sd="([^"]*)"/.exec(attrs)
      if (d !== null) {
        const m = movePath(d[1] as string, dx, dy)
        out = out.replace(d[0], ` d="${m.d}"`)
        bottom = Math.max(bottom, m.bottom + 1)
      }
      return out
    }
    const x = num('x')
    const y = num('y')
    const cy = num('cy')
    const r = num('r')
    const h = num('height')
    const size = num('font-size') ?? 11
    if (name === 'text' && y !== undefined) bottom = Math.max(bottom, y + 0.28 * size)
    if (name === 'rect' && y !== undefined && h !== undefined) bottom = Math.max(bottom, y + h + (/stroke-width="4"/.test(attrs) ? 2 : 0))
    if (name === 'circle' && cy !== undefined && r !== undefined) bottom = Math.max(bottom, cy + r + 1)
    if (x !== undefined) set('x', dx)
    if (y !== undefined) set('y', dy)
    if (num('cx') !== undefined) set('cx', dx)
    if (cy !== undefined) set('cy', dy)
    return out
  })
  const w = width - 2 * dx
  // `least` keeps a view's height steady where its content varies, as the wide views do.
  const h = Math.max(least, Math.ceil(bottom - dy + MARGIN_FOOT))

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<defs><pattern id="sb-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1" fill="${C.dot}"/></pattern></defs>` +
    `<rect width="${w}" height="${h}" rx="12" fill="${C.canvas}"/><rect width="${w}" height="${h}" rx="12" fill="url(#sb-dots)"/>` +
    moved +
    `</svg>`
  )
}

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
  // Staging that holds exactly what is live is not out of date, however far its branch sits from the trunk.
  if (lane.isStagingLive === true) return { when, news: 'same as live', tone: C.muted }
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
  [/release|ship|version|\btags?\b/, '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>'],
  [/data|db|store|model/, '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>'],
  [/quality|test|qa|check/, '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>'],
  [/board|\bui\b|front|design|view/, '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M9 11h12"/>'],
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

/**
 * A line of pieces, each with its colour: whole pieces while they fit. The piece
 * that overflows is cut to the room left, when it is the first or the room is
 * enough for a few words (40 px); otherwise it and the rest are left off.
 */
export function line(x: number, y: number, pieces: Piece[], most: number, size = 11): string {
  let used = 0
  let out = ''
  for (const [at, p] of pieces.entries()) {
    const w = widthOf(p.words, size)
    if (used + w > most) {
      if (at === 0 || most - used >= 40) out += `<tspan fill="${p.fill}">${esc(fit(p.words, most - used, size))}</tspan>`
      break
    }
    out += `<tspan fill="${p.fill}">${esc(p.words)}</tspan>`
    used += w
  }

  return text(x, y, out, { size })
}

/** The words under a lane's name about its staging. */
function stagingPieces(lane: Lane, now: number, stagingName: string): Piece[] {
  if (lane.isParked === true) return [{ words: lane.staging === undefined ? 'Set aside' : `Set aside · ${stagingName} ${agoOf(lane.staging.updatedAt, now)}`, fill: C.muted }]
  // A staging name in capitals (UAT) keeps them; a word (Staging) goes lower case in the middle of the line.
  if (lane.staging === undefined) return [{ words: `No ${/^[A-Z0-9]+$/.test(stagingName) ? stagingName : stagingName.toLowerCase()} yet`, fill: TONE.warn.ink }]
  // Staging the same as live says so in place of its age: "UAT · same as live", with your branch's news after.
  if (lane.isStagingLive === true) {
    const yours = lane.hasYours === true ? ' · yours' : lane.hasYours === false && lane.isHere ? ' · not yet' : ''
    return [{ words: `${stagingName} · same as live`, fill: C.muted }, ...(yours === '' ? [] : [{ words: yours, fill: lane.hasYours === true ? C.text : C.muted }])]
  }
  const words = stagingWords(lane, now)
  return [{ words: `${stagingName} ${words.when}`, fill: C.muted }, ...(words.news === '' ? [] : [{ words: ` · ${words.news}`, fill: words.tone }])]
}

/**
 * True for a branch name a tool made up, such as `claude/upbeat-volhard-48eb37`:
 * its last part ends in a hex tag with a figure in it. Such names say nothing
 * about the work, so its newest commit's subject stands in for it where there is one.
 */
export const isMadeUpName = (name: string): boolean => {
  const tail = /[-_]([0-9a-f]{4,10})$/i.exec(name)?.[1]
  return tail !== undefined && /\d/.test(tail)
}

/**
 * An open branch on one line from `x`, in `room` pixels at baseline `y`: a made-up
 * name gives way to its commit subject; a chosen name stays, with the subject after
 * it in muted type where there is room. The ahead count follows the lead words.
 */
export function branchWords(b: OpenBranch, x: number, y: number, room: number, note?: ClashNote): string {
  const ahead = `+${b.ahead}`
  const aheadW = monoWidth(ahead) + 8
  const subject = b.subject?.trim() ?? ''
  if (subject !== '' && isMadeUpName(b.name)) {
    // A clash takes the second half of the row; the subject keeps the first.
    const lead = fit(subject, note === undefined ? room - aheadW : Math.max(room * 0.45, room - aheadW - widthOf(note.words) - 8))
    let out = text(x, y, esc(lead), { fill: C.text }) + text(x + widthOf(lead) + 8, y, ahead, { font: 'mono' })
    const after = x + widthOf(lead) + 8 + aheadW + 4
    if (note !== undefined && x + room - after >= 48) out += text(after, y, esc(fit(note.words, x + room - after)), { fill: note.ink })
    return out
  }
  const nameRoom = subject === '' && note === undefined ? room - aheadW : Math.max(room * 0.55, Math.min(room - aheadW, 120))
  const shown = branchIn(b.name, nameRoom - aheadW)
  let out = text(x, y, esc(shown), { font: 'mono', fill: C.text }) + text(x + monoWidth(shown) + 8, y, ahead, { font: 'mono' })
  const after = x + monoWidth(shown) + aheadW + 4
  const left = x + room - after
  // A clash says itself in place of the subject: it is the more urgent of the two.
  if (note !== undefined && left >= 48) out += text(after, y, esc(fit(note.words, left)), { fill: note.ink })
  else if (subject !== '' && left >= 48) out += text(after, y, esc(fit(subject, left)))

  return out
}

/** A branch's worst clash, ready to draw: its level and tone, the other branch in words, and what is involved. */
export type ClashNote = { level: 'conflict' | 'overlap'; ink: string; other: string; words: string; files: string[]; isUncommitted: boolean }

/** The repository fields clash notes are read from. */
type ClashSource = { clashes?: Clash[]; lanes?: Lane[]; loose?: OpenBranch[] }

/** Red for a conflict (git says the two will not merge cleanly), amber for an overlap (same files, merging cleanly for now). */
export const clashInk = (level: 'conflict' | 'overlap'): string => (level === 'conflict' ? TONE.danger.ink : TONE.warn.ink)

/** A branch said by its newest commit's subject where it has one, else by its name. */
export function branchSaid(repo: ClashSource, name: string): string {
  const entry = [...(repo.lanes ?? []).flatMap(lane => lane.open ?? []), ...(repo.loose ?? [])].find(b => b.name === name)
  const subject = entry?.subject?.trim() ?? ''
  return subject === '' ? name : subject
}

/**
 * The worst clash a branch is part of, from the repository's list, with the other
 * branch said by its description. Where the list does not name it but the branch
 * is marked (`fallback`), the other side is "another branch".
 */
export function clashOf(repo: ClashSource, name: string, fallback?: 'conflict' | 'overlap'): ClashNote | undefined {
  const all = (repo.clashes ?? []).filter(c => c.a === name || c.b === name)
  // A branch whose only clashes are routine is not marked: the lane's shared file is said once, quietly, elsewhere.
  const strong = all.filter(c => !isRoutine(repo, c))
  if (all.length > 0 && strong.length === 0) return undefined
  const found = strong.sort((p, q) => Number(q.level === 'conflict') - Number(p.level === 'conflict'))[0]
  const level = found?.level ?? fallback
  if (level === undefined) return undefined
  const other = found === undefined ? 'another branch' : branchSaid(repo, found.a === name ? found.b : found.a)
  const isUncommitted = found?.isUncommitted === true
  const verb = level === 'conflict' ? 'conflicts with' : 'same files as'
  return { level, ink: clashInk(level), other, words: `${verb} ${other}${isUncommitted ? ', uncommitted' : ''}`, files: found?.files ?? [], isUncommitted }
}

/** The lane a branch belongs to, by its place in a lane's open branches; none for a branch in no lane. */
const laneOfBranch = (repo: ClashSource, name: string): Lane | undefined => (repo.lanes ?? []).find(lane => (lane.open ?? []).some(b => b.name === name))

/**
 * A routine overlap: clean, committed, between two branches of one lane, on one
 * file. A project whose app is one big file has these as a matter of course, so
 * they are grouped into one quiet line rather than marked branch by branch.
 */
export function isRoutine(repo: ClashSource, c: Clash): boolean {
  if (c.level !== 'overlap' || c.isUncommitted === true || c.files.length !== 1) return false
  const lane = laneOfBranch(repo, c.a)
  return lane !== undefined && lane === laneOfBranch(repo, c.b)
}

/** The clashes worth a mark: every conflict, and the overlaps that cross lanes or files or hold uncommitted work. */
export const strongClashes = (repo: ClashSource): Clash[] => (repo.clashes ?? []).filter(c => !isRoutine(repo, c))

/** The routine overlaps, grouped by lane and file: "4 App branches share public/app/index.html". */
export function sharedFiles(repo: ClashSource): Array<{ lane: Lane; file: string; branches: number; words: string }> {
  const groups = new Map<string, { lane: Lane; file: string; names: Set<string> }>()
  for (const c of repo.clashes ?? []) {
    if (!isRoutine(repo, c)) continue
    const lane = laneOfBranch(repo, c.a) as Lane
    const file = c.files[0] as string
    const key = `${lane.name}\u0000${file}`
    const group = groups.get(key) ?? { lane, file, names: new Set<string>() }
    group.names.add(c.a)
    group.names.add(c.b)
    groups.set(key, group)
  }

  return [...groups.values()].map(g => ({ lane: g.lane, file: g.file, branches: g.names.size, words: `${g.names.size} ${g.lane.name} branches share ${g.file}` }))
}

/** "1 conflict · 2 overlaps" as coloured pieces, or none at all when the repository is clean. */
export function clashSummary(clashes: readonly Clash[] | undefined): Piece[] {
  const conflicts = (clashes ?? []).filter(c => c.level === 'conflict').length
  const overlaps = (clashes ?? []).filter(c => c.level === 'overlap').length
  const out: Piece[] = []
  if (conflicts > 0) out.push({ words: `${conflicts} ${conflicts === 1 ? 'conflict' : 'conflicts'}`, fill: TONE.danger.ink })
  if (overlaps > 0) out.push({ words: `${out.length > 0 ? ' · ' : ''}${overlaps} ${overlaps === 1 ? 'overlap' : 'overlaps'}`, fill: TONE.warn.ink })
  return out
}

/** A clash mark: a small dot in the clash's tone with a faint halo, so it reads at a glance beside a branch. */
export const clashMark = (cx: number, cy: number, level: 'conflict' | 'overlap'): string =>
  `<circle cx="${cx}" cy="${cy}" r="5.5" fill="${clashInk(level)}" fill-opacity="0.18"/><circle cx="${cx}" cy="${cy}" r="3" fill="${clashInk(level)}"/>`

/**
 * One lane as a card on the tall board: its tile and name with what is in
 * flight, its live tag as a pill, its staging underneath, then up to four of
 * its open branches with how far ahead they are, and a pill where one is far
 * behind or stale. Returns the drawing and its height.
 */
export function laneCard(lane: Lane, top: number, now: number, colour: string, stagingName: string, source?: ClashSource): { svg: string; h: number } {
  // Option A, "Board, slimmer": a 46 px head (tile, name, live pill; staging under it), then the branches at 18 px.
  const inner = 412
  const open = lane.open ?? []
  const more = Math.max(0, lane.branches - open.length)
  const rows = open.length + (more > 0 && open.length > 0 ? 1 : 0)
  const h = 46 + (rows > 0 ? rows * 18 + 6 : 0)

  let out = `<g${lane.isParked === true ? ' opacity="0.45"' : ''}>`
  out += `<rect x="16.5" y="${top + 0.5}" width="407" height="${h - 1}" rx="8" fill="${C.node}" stroke="${C.nodeLine}"/>`
  out += `<rect x="26.5" y="${top + 10.5}" width="17" height="17" rx="4.5" fill="${colour}" fill-opacity="0.18" stroke="${colour}" stroke-opacity="0.5"/>`
  out += laneIcon(lane, 28, top + 12, 14, colour)

  // The live tag on the right, then the name and what is in flight in the room it leaves.
  const live = lane.live === undefined ? undefined : pill(inner, top + 17, fitMono(liveWords(lane.live), 120), 'plain', true, 18)
  if (live !== undefined) out += live.svg
  const room = (live === undefined ? inner : live.left - 10) - 54
  const name = fit(lane.name, Math.min(150, room - 40), 13, 600)
  const nameW = widthOf(name, 13, 600)
  out += text(54, top + 22, esc(name), { size: 13, weight: 600, fill: C.text })
  const flight = fit(lane.isParked === true ? `Parked · ${inFlight(lane).toLowerCase()}` : inFlight(lane), room - nameW - 8)
  if (flight !== '…') out += text(54 + nameW + 8, top + 22, esc(flight))
  out += line(54, top + 38, stagingPieces(lane, now, stagingName), inner - 54)

  // Every open branch the data holds, at 18 px: pills from the right edge inward, the name taking what is left.
  open.forEach((b, at) => {
    const mid = top + 56 + at * 18
    let edge = inner
    for (const flag of flagsOf(b, now)) {
      const p = pill(edge, mid, flag.words, flag.tone, false, 16)
      out += p.svg
      edge = p.left - 6
    }
    // A clashing branch's dot takes the clash's tone, and the clash is said in place of its subject.
    const note = source === undefined ? undefined : clashOf(source, b.name, b.clash)
    out += note === undefined ? `<circle cx="56" cy="${mid}" r="2.5" fill="${colour}"/>` : clashMark(56, mid, note.level)
    out += branchWords(b, 64, mid + 4, edge - 4 - 64, note)
  })
  if (more > 0 && open.length > 0) out += text(64, top + 60 + open.length * 18, `+${more} more`)

  return { svg: `${out}</g>`, h }
}

/** A lane's icon alone, in its colour, `size` px square. */
const laneIcon = (lane: Lane, x: number, y: number, size: number, colour: string): string =>
  `<g transform="translate(${x} ${y}) scale(${(size / 24).toFixed(4)})" fill="none" stroke="${colour}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${iconOf(lane)}</g>`

// Each station's own colour, from the Silkscreen category set. Files and Shell take copper: they feed your branch.
export const STATION_TONE: Record<string, string> = {
  you: '#CBD5E1', skills: '#FCD34D', hooks: '#FCA5A5', memory: '#A5B4FC', model: '#F0ABFC',
  agents: '#5EEAD4', browser: '#7DD3FC', network: '#86EFAC', files: '#D4976A', shell: '#D4976A',
}

/**
 * One lane in the wide board's right column: its tile, name and live pill on
 * the first line; what is in flight, the worst of its branches and its staging
 * on the second. The lit lane is the one you are working in.
 */
export function laneLine(lane: Lane, cy: number, now: number, colour: string, isLit: boolean, source?: ClashSource): string {
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
  // A clash among its branches outranks both: the wide board shows marks and counts, not who clashes with whom.
  const levels = (lane.open ?? []).map(b => (source === undefined ? undefined : clashOf(source, b.name, b.clash)?.level) ?? b.clash)
  const conflicts = levels.filter(l => l === 'conflict').length
  const overlaps = levels.filter(l => l === 'overlap').length
  const worst =
    conflicts > 0
      ? { words: `${conflicts} ${conflicts === 1 ? 'conflict' : 'conflicts'}`, tone: 'danger' as const }
      : overlaps > 0
        ? { words: `${overlaps} ${overlaps === 1 ? 'overlap' : 'overlaps'}`, tone: 'warn' as const }
        : far > 0 ? { words: `${far} far behind`, tone: 'danger' as const } : stale > 0 ? { words: `${stale} stale`, tone: 'warn' as const } : undefined
  const pieces: Piece[] = [
    { words: lane.isParked === true ? 'Parked' : inFlight(lane), fill: C.muted },
    ...(worst === undefined ? [] : [{ words: ` · ${worst.words}`, fill: TONE[worst.tone].ink }]),
    ...(lane.isParked === true ? [] : stagingPieces(lane, now, 'staging').map((p, at) => (at === 0 ? { ...p, words: ` · ${p.words}` } : p))),
  ]
  out += line(688, cy + 20, pieces, right - 688)

  return `${out}</g>`
}
