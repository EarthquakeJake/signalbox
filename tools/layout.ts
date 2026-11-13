// A cheap layout check over a drawn board. It reads the SVG text back, guesses
// each text's box from rough letter widths, and reports text that overlaps
// other text, crosses a wire, straddles the edge of a box or circle, or runs
// off the board. It knows nothing about how the board is laid out, only what
// the SVG says, so it keeps working when the drawing changes.
//
// The widths are estimates, not measurements: they match the table draw.ts
// uses to cut branch names (11px Inter), with mono at 0.6em. Real Segoe UI or
// Inter can differ by a few pixels over a long line, so a near miss here is a
// thing to look at, and a clean pass is not a picture.

export type Box = { left: number; right: number; top: number; bottom: number }
export type Text = Box & { text: string; isHalo: boolean; hasHalo: boolean }
type Segment = { x1: number; y1: number; x2: number; y2: number; half: number; d: string }
type Shape = Box & { what: string }

/** Rough width of one 11px sans letter, the same table draw.ts uses for `fit`. */
const sansWidth = (letter: string): number =>
  /[MW@%]/.test(letter) ? 10 : /[mw]/.test(letter) ? 8.6 : /[A-Z0-9#&]/.test(letter) ? 7.6 : /[iljtfr.,:;'|!\/ ()\[\]-]/.test(letter) ? 3.8 : 5.8

const attr = (attrs: string, name: string): string | undefined => {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)
  return m === null ? undefined : m[1]
}
const num = (attrs: string, name: string, fallback = 0): number => {
  const v = attr(attrs, name)
  return v === undefined ? fallback : Number(v)
}

const unescape = (text: string): string =>
  text.replace(/<[^>]*>/g, '').replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code))).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

/** How wide a text is drawn, in the board's pixels. */
export function widthOf(text: string, size: number, isMono: boolean, isBold: boolean, spacing: number): number {
  const letters = [...text]
  const base = isMono ? letters.length * 0.6 * size : letters.reduce((sum, l) => sum + sansWidth(l), 0) * (size / 11) * (isBold ? 1.05 : 1)
  return base + spacing * letters.length
}

/** Every text on the board with its guessed box. */
export function textsOf(svg: string): Text[] {
  const out: Text[] = []
  for (const m of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const attrs = m[1] ?? ''
    const text = unescape(m[2] ?? '')
    if (text.trim() === '') continue
    const size = num(attrs, 'font-size', 11)
    const family = attr(attrs, 'font-family') ?? ''
    const weight = num(attrs, 'font-weight', 400)
    const width = widthOf(text, size, /mono|consolas/i.test(family), weight >= 600, num(attrs, 'letter-spacing'))
    const x = num(attrs, 'x')
    const y = num(attrs, 'y')
    const anchor = attr(attrs, 'text-anchor') ?? 'start'
    const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x
    // Cap height to just under the baseline: what the eye reads as the text.
    out.push({ text, left, right: left + width, top: y - 0.72 * size, bottom: y + 0.2 * size, isHalo: attr(attrs, 'fill') === 'none', hasHalo: false })
  }
  // A halo is a copy of a text drawn in the canvas colour to break the lines behind it.
  for (const halo of out.filter(t => t.isHalo)) {
    for (const t of out) if (!t.isHalo && t.text === halo.text && t.left === halo.left && t.bottom === halo.bottom) t.hasHalo = true
  }
  return out.filter(t => !t.isHalo)
}

/** The straight pieces of a path, with curves cut into short lines. */
function segmentsOf(d: string, half: number): Segment[] {
  const out: Segment[] = []
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? []
  let at = 0
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  let cmd = 'M'
  const next = (): number => Number(tokens[at++])
  const line = (nx: number, ny: number): void => {
    out.push({ x1: x, y1: y, x2: nx, y2: ny, half, d })
    x = nx
    y = ny
  }
  while (at < tokens.length) {
    const t = tokens[at] as string
    if (/[a-zA-Z]/.test(t)) {
      cmd = t
      at += 1
      if (cmd === 'Z' || cmd === 'z') line(startX, startY)
      continue
    }
    const rel = cmd === cmd.toLowerCase()
    const ox = rel ? x : 0
    const oy = rel ? y : 0
    switch (cmd.toUpperCase()) {
      case 'M': {
        x = ox + next()
        y = oy + next()
        startX = x
        startY = y
        cmd = rel ? 'l' : 'L'
        break
      }
      case 'L': {
        const nx = ox + next()
        line(nx, oy + next())
        break
      }
      case 'H':
        line(ox + next(), y)
        break
      case 'V':
        line(x, oy + next())
        break
      case 'Q': {
        const cx = ox + next()
        const cy = oy + next()
        const ex = ox + next()
        const ey = oy + next()
        const sx = x
        const sy = y
        for (let s = 1; s <= 4; s += 1) {
          const k = s / 4
          line((1 - k) ** 2 * sx + 2 * (1 - k) * k * cx + k * k * ex, (1 - k) ** 2 * sy + 2 * (1 - k) * k * cy + k * k * ey)
        }
        break
      }
      case 'C': {
        const c1x = ox + next()
        const c1y = oy + next()
        const c2x = ox + next()
        const c2y = oy + next()
        const ex = ox + next()
        const ey = oy + next()
        const sx = x
        const sy = y
        for (let s = 1; s <= 6; s += 1) {
          const k = s / 6
          const a = (1 - k) ** 3
          const b = 3 * (1 - k) ** 2 * k
          const c = 3 * (1 - k) * k * k
          const e = k ** 3
          line(a * sx + b * c1x + c * c2x + e * ex, a * sy + b * c1y + c * c2y + e * ey)
        }
        break
      }
      default:
        // An arc or anything else this check does not read: skip its numbers.
        at += 1
    }
  }
  return out
}

/** The wires: stroked, unfilled paths outside any transformed group (icons are drawn in those). */
function wiresOf(svg: string): Segment[] {
  const plain = svg.replace(/<g\b[^>]*\btransform="[^"]*"[^>]*>[\s\S]*?<\/g>/g, '')
  const out: Segment[] = []
  for (const m of plain.matchAll(/<path\b([^>]*?)\/?>/g)) {
    const attrs = m[1] ?? ''
    const d = attr(attrs, 'd')
    if (d === undefined || attr(attrs, 'fill') !== 'none' || attr(attrs, 'stroke') === undefined) continue
    // A faint glow drawn under a live wire is wider than the wire; the wire itself decides.
    if (Number(attr(attrs, 'opacity') ?? 1) < 0.3) continue
    out.push(...segmentsOf(d, Math.min(num(attrs, 'stroke-width', 1), 2) / 2))
  }
  return out
}

/** Boxes and circles a text should sit wholly inside or wholly outside. */
function shapesOf(svg: string, width: number, height: number): Shape[] {
  // Shapes inside a transformed group (the icons) are not drawn where they are written, as with the wires.
  const plain = svg.replace(/<g\b[^>]*\btransform="[^"]*"[^>]*>[\s\S]*?<\/g>/g, '')
  const out: Shape[] = []
  for (const m of plain.matchAll(/<rect\b([^>]*?)\/?>/g)) {
    const a = m[1] ?? ''
    const x = num(a, 'x')
    const y = num(a, 'y')
    const w = num(a, 'width')
    const h = num(a, 'height')
    if (w >= width && h >= height) continue
    out.push({ left: x, right: x + w, top: y, bottom: y + h, what: `box at ${Math.round(x)},${Math.round(y)}` })
  }
  for (const m of plain.matchAll(/<circle\b([^>]*?)\/?>/g)) {
    const a = m[1] ?? ''
    const cx = num(a, 'cx')
    const cy = num(a, 'cy')
    const r = num(a, 'r')
    out.push({ left: cx - r, right: cx + r, top: cy - r, bottom: cy + r, what: `circle at ${Math.round(cx)},${Math.round(cy)}` })
  }
  return out
}

const overlap = (a: Box, b: Box, give: number): boolean =>
  a.left + give < b.right && b.left + give < a.right && a.top + give < b.bottom && b.top + give < a.bottom
const inside = (t: Box, s: Box, give: number): boolean =>
  t.left >= s.left - give && t.right <= s.right + give && t.top >= s.top - give && t.bottom <= s.bottom + give

/** Whether a segment, thickened by its stroke, passes through a box. */
function crosses(s: Segment, b: Box): boolean {
  const box = { left: b.left - s.half, right: b.right + s.half, top: b.top - s.half, bottom: b.bottom + s.half }
  // Clip the segment to the box (Liang–Barsky).
  const dx = s.x2 - s.x1
  const dy = s.y2 - s.y1
  let t0 = 0
  let t1 = 1
  const sides: Array<[number, number]> = [
    [-dx, s.x1 - box.left],
    [dx, box.right - s.x1],
    [-dy, s.y1 - box.top],
    [dy, box.bottom - s.y1],
  ]
  for (const [p, q] of sides) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const r = q / p
    if (p < 0) t0 = Math.max(t0, r)
    else t1 = Math.min(t1, r)
    if (t0 > t1) return false
  }
  return true
}

const show = (t: Text): string => `"${t.text}"`

/**
 * What looks wrong on a drawn board, one line per fault; empty when nothing does.
 * `give` is how many pixels of overlap are let pass, to absorb the width guess.
 */
export function layoutProblems(svg: string, give = 1): string[] {
  const view = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
  const width = view === null ? Infinity : Number(view[1])
  const height = view === null ? Infinity : Number(view[2])
  // Patterns and the like are not drawn where they are written.
  const body = svg.replace(/<defs>[\s\S]*?<\/defs>/g, '')
  const texts = textsOf(body)
  const wires = wiresOf(body)
  const shapes = shapesOf(body, width, height)
  const out: string[] = []

  for (const t of texts) {
    if (t.left < 2 - give || t.right > width - 2 + give || t.top < 0 || t.bottom > height) out.push(`${show(t)} runs off the board`)
  }
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      const a = texts[i] as Text
      const b = texts[j] as Text
      if (overlap(a, b, give)) out.push(`${show(a)} overlaps ${show(b)}`)
      // Two texts on one baseline need a gap the eye reads as one: under 2 px they run together ("Shell20").
      else if (Math.abs(a.bottom - b.bottom) < 0.5) {
        const gap = a.left < b.left ? b.left - a.right : a.left - b.right
        if (gap >= -give && gap < 2) out.push(`${show(a)} touches ${show(b)}`)
      }
    }
  }
  for (const t of texts) {
    if (t.hasHalo) continue
    const shrunk = { left: t.left + give, right: t.right - give, top: t.top + give, bottom: t.bottom - give }
    const hit = wires.find(s => crosses(s, shrunk))
    if (hit !== undefined) out.push(`${show(t)} crosses the wire ${hit.d}`)
  }
  for (const t of texts) {
    for (const s of shapes) {
      if (overlap(t, s, give) && !inside(t, s, give)) out.push(`${show(t)} straddles the ${s.what}`)
    }
  }
  return [...new Set(out)]
}
