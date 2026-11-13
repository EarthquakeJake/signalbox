import type { Board, StationId } from '../types'
import { TALL_LANES, WIDE_LANES, agoOf, drawLanes, laneHeight } from './lanes'

// A dark circuit-board look. Off-white marks what Claude is doing now; copper marks connection points.
const C = {
  canvas: '#081013', node: '#0F191D', nodeLine: '#22323A', wire: '#3E525A',
  text: '#EAF0EE', muted: '#8A9B98', accent: '#F1EDE3', port: '#C98B5E', hl: '#D4976A',
}
const SANS = 'font-family="Segoe UI, system-ui, sans-serif"'
const MONO = 'font-family="Consolas, ui-monospace, monospace"'

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
  nodes: [number, number, number]
  cy: number
  labelY: number
  caption: { x: number; y: number }
}

const TALL: Layout = {
  w: 440, h: 436, core: { x: 150, y: 44 },
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
  nodes: [30, 220, 410], cy: 368, labelY: 400, caption: { x: 56, y: 350 },
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
  nodes: [674, 770, 866], cy: 145, labelY: 180, caption: { x: 660, y: 110 },
}

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const short = (text: string, most: number): string => (text.length <= most ? text : `${text.slice(0, most - 1)}…`)

/** `claude-fable-5-2` reads as `fable 5.2`. */
export const shortModel = (model: string): string => {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(model)
  if (m === null) return short(model, 18)
  const minor = m[3]
  return `${m[1]} ${m[2]}${minor !== undefined && minor.length < 3 ? `.${minor}` : ''}`
}

type Wear = 'idle' | 'used' | 'live'

/** A wire: grey at rest, silk once used, and a moving dash while the call runs. */
function wire(d: string, wear: Wear): string {
  if (wear === 'idle') return `<path d="${d}" fill="none" stroke="${C.wire}" stroke-width="1.5"/>`
  if (wear === 'used') return `<path d="${d}" fill="none" stroke="${C.accent}" stroke-width="1.5" opacity="0.6"/>`
  return (
    `<path d="${d}" fill="none" stroke="${C.accent}" stroke-width="5" opacity="0.18"/>` +
    `<path d="${d}" fill="none" stroke="${C.accent}" stroke-width="1.75" stroke-dasharray="8 4"><animate attributeName="stroke-dashoffset" from="12" to="0" dur="0.6s" repeatCount="indefinite"/></path>`
  )
}

export type TrackNames = { staging: string; live: string }

export function drawBoard(b: Board, isWide: boolean, names: TrackNames, now: number): string {
  const L = isWide ? WIDE : TALL
  const wearOf = (id: StationId): Wear => ((b.live[id] ?? 0) > 0 ? 'live' : (b.counts[id] ?? 0) > 0 ? 'used' : 'idle')
  const ids = Object.keys(L.spots) as StationId[]
  let wires = ''
  let chips = ''
  let pins = ''

  for (const id of ids) {
    const s = L.spots[id]
    const wear = wearOf(id)
    const line = wear === 'live' ? C.accent : wear === 'used' ? C.wire : C.nodeLine
    const ink = wear === 'live' ? C.accent : wear === 'used' ? C.text : C.muted
    const count = b.counts[id] ?? 0
    wires += wire(s.wire, wear)
    chips +=
      `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="28" rx="8" fill="${C.node}" stroke="${line}"/>` +
      `<g transform="translate(${s.x + 8} ${s.y + 7}) scale(0.583)" fill="none" stroke="${ink}" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</g>` +
      `<text x="${s.x + 28}" y="${s.y + 18}" ${SANS} font-size="11" fill="${ink}">${NAMES[id]}</text>` +
      (count > 0 ? `<text x="${s.x + s.w - 8}" y="${s.y + 18}" text-anchor="end" ${MONO} font-size="11" fill="${ink}">${count > 99 ? '99+' : count}</text>` : '')
    pins += `<circle cx="${s.pin[0]}" cy="${s.pin[1]}" r="3.5" fill="${C.canvas}" stroke="${wear === 'idle' ? C.port : C.accent}" stroke-width="1.5"/>`
  }

  // The newest call still running names what Claude is doing.
  const running = [...b.rows].reverse().find(r => r.status === 'run')
  const doing = running !== undefined ? `${NAMES[running.station]}: ${running.label}` : b.isWorking ? 'Thinking' : 'Waiting for you'
  const cx = L.core.x + 70
  const core =
    (b.isWorking ? `<rect x="${L.core.x - 4}" y="${L.core.y - 4}" width="148" height="158" rx="13" fill="none" stroke="${C.accent}" stroke-width="4" opacity="0.12"/>` : '') +
    `<rect x="${L.core.x}" y="${L.core.y}" width="140" height="150" rx="10" fill="${C.node}" stroke="${b.isWorking ? C.accent : C.nodeLine}"/>` +
    `<text x="${cx}" y="${L.core.y + 58}" text-anchor="middle" ${MONO} font-size="15" letter-spacing="2" fill="${C.text}">CLAUDE</text>` +
    `<text x="${cx}" y="${L.core.y + 76}" text-anchor="middle" ${MONO} font-size="11" fill="${C.muted}">${esc(b.model === undefined ? '' : shortModel(b.model))}</text>` +
    `<text x="${cx}" y="${L.core.y + 100}" text-anchor="middle" ${SANS} font-size="11" fill="${C.text}">${esc(short(doing, 22))}</text>` +
    (b.context === undefined ? '' : `<text x="${cx}" y="${L.core.y + 118}" text-anchor="middle" ${MONO} font-size="11" fill="${C.muted}">context ${Math.round(b.context)}%</text>`)

  // Files and Shell are the two stations that change the repository: their wires merge and run on to the branch.
  const isWriting = wearOf('files') === 'live' || wearOf('shell') === 'live'
  const edits = b.edited.length
  const flow: Wear = isWriting ? 'live' : edits > 0 ? 'used' : 'idle'
  const tagText = edits === 0 ? 'no file edits this turn' : `${edits} file${edits === 1 ? '' : 's'} edited this turn`
  const tag =
    `<rect x="${L.tag.x}" y="${L.tag.y}" width="${L.tag.w}" height="26" rx="13" fill="${C.canvas}" stroke="${flow === 'idle' ? C.nodeLine : C.accent}"/>` +
    `<text x="${L.tag.x + L.tag.w / 2}" y="${L.tag.y + 17}" text-anchor="middle" ${MONO} font-size="11" fill="${flow === 'idle' ? C.muted : C.accent}">${tagText}</text>`

  // The release track, from git: what is uncommitted, what is on this branch, and how it stands against the trunk.
  const repo = b.repo
  const here = repo !== undefined && repo.kind === 'repo' ? repo : undefined
  const dirty = here?.dirty ?? 0
  const ahead = here?.ahead ?? 0
  const behind = here?.behind ?? 0
  const unpushed = here?.unpushed

  type Stop = { name: string; under: string; count: string; isLit: boolean; isMarked?: boolean }
  const blank: Stop = { name: '', under: '', count: '', isLit: false }
  const working: Stop = {
    name: 'Working',
    under: dirty === 0 ? 'clean' : `${dirty} file${dirty === 1 ? '' : 's'}`,
    count: dirty === 0 ? '' : String(dirty),
    isLit: dirty > 0,
  }
  const hasWorkingStop = here !== undefined && here.staging === undefined
  const onBranch: Stop = {
    name: here === undefined ? 'Branch' : short(here.branch, 15),
    under:
      dirty > 0 && !hasWorkingStop
        ? `${dirty} uncommitted`
        : unpushed === undefined
          ? 'no remote'
          : unpushed > 0
            ? `${unpushed} to push`
            : 'pushed',
    count: ahead === 0 ? '' : `+${ahead}`,
    isLit: ahead > 0 || dirty > 0,
    isMarked: unpushed !== undefined && unpushed > 0,
  }

  // With a staging folder named, the track reads as the release does: branch,
  // then staging, then live. Without one, it shows what git alone can say.
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
            {
              name: short(names.staging, 15),
              under: `updated ${agoOf(here.staging.updatedAt, now)}`,
              count: here.staging.behind === 0 ? '' : String(here.staging.behind),
              isLit: false,
            },
            {
              name: short(names.live, 15),
              under: here.tag === undefined ? 'the trunk' : short(here.tag, 15),
              count: '',
              isLit: false,
            },
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
  const shape = isWide ? WIDE_LANES : TALL_LANES
  const [n1, n2, n3] = L.nodes
  const anchorOf = (at: number, x: number): string =>
    isWide || at === 1 ? `x="${x}" text-anchor="middle"` : at === 0 ? `x="${x - 14}" text-anchor="start"` : `x="${x + 14}" text-anchor="end"`

  let track = `<path d="M${n1 + 14} ${L.cy}H${n2 - 14}M${n2 + 14} ${L.cy}H${n3 - 14}" fill="none" stroke="${C.wire}" stroke-width="1.5"/>`
  const places: [number, number, number] = [n1, n2, n3]
  for (let at = 0; at < 3; at += 1) {
    const stop = stops[at]
    const x = places[at]
    const ring = here === undefined ? C.nodeLine : stop.isLit ? C.accent : C.wire
    const dash = here === undefined ? ' stroke-dasharray="3 3"' : ''
    track +=
      `<circle cx="${x}" cy="${L.cy}" r="13" fill="${C.canvas}" stroke="${ring}" stroke-width="${stop.isLit ? 2 : 1.5}"${dash}/>` +
      (stop.count === '' ? '' : `<text x="${x}" y="${L.cy + 4}" text-anchor="middle" ${MONO} font-size="11" fill="${stop.isLit ? C.accent : C.muted}">${stop.count}</text>`) +
      (stop.isMarked === true ? `<circle cx="${x + 11}" cy="${L.cy - 11}" r="3.5" fill="${C.port}"/>` : '') +
      `<text ${anchorOf(at, x)} y="${L.labelY}" ${SANS} font-size="11" fill="${stop.isLit ? C.hl : C.muted}">${esc(stop.name)}</text>` +
      (stop.under === '' ? '' : `<text ${anchorOf(at, x)} y="${L.labelY + 15}" ${SANS} font-size="11" fill="${C.muted}">${esc(stop.under)}</text>`)
  }
  if (lanes.length > 0) {
    track =
      wire(isWide ? `M630 145H${shape.bus}` : `M220 310V318Q220 326 212 326H${shape.bus + 8}Q${shape.bus} 326 ${shape.bus} 334`, flow) +
      drawLanes(lanes, shape, now, C, SANS, MONO)
  }
  track += `<text x="${L.caption.x}" y="${L.caption.y}" ${SANS} font-size="11" fill="${C.muted}">${here === undefined ? (repo === undefined ? 'Reading the repository…' : repo.kind === 'blocked' ? `Git did not run: ${esc(short(repo.why, isWide ? 50 : 36))}` : repo.why === undefined ? 'No git repository in this folder' : `Git said: ${esc(short(repo.why, isWide ? 50 : 34))}`) : lanes.length > 0 ? `${lanes.length} tracks · ${esc(short(here.branch, isWide ? 30 : 22))}` : here.staging === undefined ? 'Release track' : esc(short(here.staging.subject, isWide ? 46 : 34))}</text>`

  const headY = isWide ? 16 : 24
  const head =
    `<text x="16" y="${headY}" ${SANS} font-size="11" font-weight="600" letter-spacing="0.6" fill="${C.muted}">NOW</text>` +
    `<text x="${L.w - 16}" y="${headY}" text-anchor="end" ${MONO} font-size="11" fill="${C.muted}">${b.calls} tool call${b.calls === 1 ? '' : 's'} this turn</text>`

  const H = lanes.length === 0 || isWide ? L.h : Math.max(L.h, laneHeight(lanes.length, shape))

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.w} ${H}" width="${L.w}" height="${H}">` +
    `<rect width="${L.w}" height="${H}" rx="12" fill="${C.canvas}"/>` +
    head + wires + wire(L.merge, flow) + wire(L.route, flow) + core + chips + pins + tag + track +
    `</svg>`
  )
}
