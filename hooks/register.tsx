import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Board, Row, StationId } from '../types'
import { NAMES, drawBoard, short } from './draw'
import { readRepo } from './git'
import { drawSpine } from './spine'

const PANE = 'signalbox'
const TITLE = 'Signalbox'
const KEEP = 12

let isTicking = false

const EMPTY: Board = { counts: {}, live: {}, rows: [], edited: [], calls: 0, isWorking: false }

// Change the tag when a field of Board or Row changes: it declines what an earlier version stored.
const board = atom({ plugin: 'signalbox', key: 'board' } as const, EMPTY, { shape: 'board-1' })

/** Whatever goes wrong on the map must never reach the tool, the turn or the conversation. */
async function quietly<T>(work: () => Promise<T>): Promise<T | undefined> {
  try {
    return await work()
  } catch {
    return undefined
  }
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

const baseName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? ''

const isMemoryPath = (path: string): boolean => /[\\/]memory[\\/]|MEMORY\.md$/i.test(path)

type Seen = { station: StationId; label: string; edits?: string }

/** Which station a tool call lights, and the few words the feed shows for it. */
function classify(tool: string, input: Record<string, unknown>): Seen {
  switch (tool) {
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit': {
      const path = str(input.file_path) || str(input.notebook_path)
      const isEdit = tool !== 'Read'
      return { station: isMemoryPath(path) ? 'memory' : 'files', label: `${tool} ${baseName(path)}`.trim(), ...(isEdit && path !== '' ? { edits: path } : {}) }
    }
    case 'Glob':
    case 'Grep':
      return { station: 'files', label: `${tool} ${short(str(input.pattern), 24)}`.trim() }
    case 'Bash':
    case 'PowerShell':
    case 'Monitor':
      return { station: 'shell', label: short(str(input.description) || str(input.command) || tool, 40) }
    case 'WebFetch':
    case 'WebSearch':
      return { station: 'network', label: tool === 'WebSearch' ? 'Web search' : 'Fetch a page' }
    case 'Agent':
    case 'Task':
    case 'Workflow':
    case 'SendMessage':
      return { station: 'agents', label: short(str(input.description) || tool, 40) }
    case 'Skill':
      return { station: 'skills', label: str(input.skill) || 'Skill' }
    case 'ToolSearch':
      return { station: 'skills', label: 'Loading tools' }
    case 'AskUserQuestion':
      return { station: 'you', label: 'Asking you' }
    default:
  }
  if (tool.startsWith('mcp__')) {
    const name = (tool.split('__').pop() ?? tool).replace(/_/g, ' ')
    if (/browser|chrome|playwright/i.test(tool)) return { station: 'browser', label: name }
    if (/memory/i.test(tool)) return { station: 'memory', label: name }
    return { station: 'network', label: name }
  }
  return { station: 'skills', label: tool }
}

const newId = (now: number): string => `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`

const bump = (map: Board['counts'], id: StationId, by: number): Board['counts'] => ({ ...map, [id]: Math.max(0, (map[id] ?? 0) + by) })

/** A call starts: its station lights and a row opens in the feed. */
async function begin($: EngineInterface, seen: Seen, isCall: boolean): Promise<string | undefined> {
  return quietly(async () => {
    const now = await $.clock.now()
    const row: Row = { id: newId(now), station: seen.station, label: seen.label, status: 'run', startedAt: now }
    await update($, board, b => ({
      ...b,
      counts: bump(b.counts, seen.station, 1),
      live: bump(b.live, seen.station, 1),
      rows: [...b.rows, row].slice(-KEEP),
      calls: b.calls + (isCall ? 1 : 0),
      edited: seen.edits !== undefined && !b.edited.includes(seen.edits) ? [...b.edited, seen.edits].slice(-200) : b.edited,
    }))
    return row.id
  })
}

/** The call is over: its station goes back to rest and its row closes. */
async function finish($: EngineInterface, id: string | undefined, station: StationId, status: 'ok' | 'err', patch?: Partial<Board>): Promise<void> {
  if (id === undefined) return
  await quietly(async () => {
    const now = await $.clock.now()
    await update($, board, b => ({
      ...b,
      ...patch,
      live: bump(b.live, station, -1),
      rows: b.rows.map(r => (r.id === id ? { ...r, status, endedAt: now } : r)),
    }))
  })
}

const took = (row: Row): string => {
  if (row.endedAt === undefined) return 'running'
  const ms = row.endedAt - row.startedAt
  return ms < 100 ? '' : ms < 10000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`
}

// The trunk to measure against, set when the module loads. The folder is asked
// for on every read, never kept: a session is given its folder after it starts,
// and /cd or a worktree move changes it again.
let asked = ''
let stagingPath = ''
let stagingRef = ''
let readAt = 0
let isReading = false

/** Re-reads the branch picture, at most once every three seconds, never holding up the caller. */
async function refresh($: EngineInterface, isForced: boolean): Promise<void> {
  if (isReading) return
  const now = await quietly(() => $.clock.now())
  if (now === undefined) return
  if (!isForced && now - readAt < 3000) return
  const where = await quietly(() => $.session.cwd())
  if (where === undefined || where === '') return
  isReading = true
  readAt = now
  try {
    const repo = await readRepo($, where, asked, stagingPath, stagingRef)
    await quietly(() => update($, board, b => ({ ...b, repo })))
  } finally {
    isReading = false
  }
}

/**
 * Which board a pane gets, from its body's size in cells. A text cell is about
 * twice as tall as it is wide: the pane is wide when it is clearly broader than
 * it is high, and at least 90 cells across so the wide board is not shrunk past
 * reading. The answer depends on the size alone, never on what was drawn before.
 *
 * The host re-runs the pane's render hook when its width changes, once the
 * resize settles, but not when only its height changes: then this is asked
 * again only at the board's next redraw (a tool call, a step, a turn's end).
 */
export function isWidePane(columns: number, rows: number): boolean {
  return columns >= 90 && columns > rows * 2 * 1.6
}

/**
 * A pane cell in CSS pixels. A desktop surface counts the pane in cells of its
 * code font (its advance and line height), and says nothing of the font's size,
 * so these are a low guess: around a 12–13 px monospace. Guessing low makes the
 * drawing a little smaller than the room; guessing high would cut it off.
 */
export const CELL = { w: 7, h: 17 }
/** The drawing is never shrunk below this, so its 11 px text stays readable; a smaller pane scrolls. */
export const LEAST = 0.6
/** Nor grown past this, so a broad pane does not blow it up. */
export const MOST = 1.5

/**
 * The CSS size to draw an SVG at in a pane `columns` by `rows` cells, `rows`
 * being what is left after anything stacked under it: as large as fits both
 * ways with its shape kept, between LEAST and MOST of its own size.
 */
export function fitPicture(svg: string, columns: number, rows: number): { width: number; height: number } {
  const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
  const w = box === null ? 440 : Number(box[1])
  const h = box === null ? 440 : Number(box[2])
  const room = Math.min((Math.max(columns, 1) * CELL.w) / w, (Math.max(rows, 1) * CELL.h) / h)
  const scale = Math.min(MOST, Math.max(LEAST, room))

  return { width: Math.floor(w * scale), height: Math.floor(h * scale) }
}

/** When a desktop pane was last drawn; the redraw tick stops once it has not been for a while. */
let paneDrawnAt = 0
const NUDGE = 2000

export const register: Register = (on, options) => {
  asked = typeof options?.trunkBranch === 'string' ? options.trunkBranch.trim() : ''
  stagingPath = typeof options?.stagingPath === 'string' ? options.stagingPath.trim() : ''
  stagingRef = typeof options?.stagingBranch === 'string' ? options.stagingBranch.trim() : ''
  const names = {
    staging: typeof options?.stagingName === 'string' && options.stagingName.trim() !== '' ? options.stagingName.trim() : 'Staging',
    live: typeof options?.liveName === 'string' && options.liveName.trim() !== '' ? options.liveName.trim() : 'Live',
  }

  on('session.start', async ($, e, next) => {
    await quietly(() => $.command.register({ name: 'signalbox', description: 'Open the Signalbox pane; add spine or board to switch views' }))
    void quietly(() => $.ui.open({ id: PANE, title: TITLE }))
    void refresh($, true)
    if (!isTicking) {
      isTicking = true
      // A quiet heartbeat, so a commit or a checkout made outside this session still shows.
      void quietly(async () => $.clock.every(20000, () => void refresh($, false)))
      // The host does not redraw a pane whose height alone changed, so while a
      // desktop pane is showing it is asked to draw again every two seconds and
      // so read its size afresh. Each redraw marks the pane drawn, which keeps
      // the tick going; once the pane is closed nothing is drawn and it stops.
      void quietly(async () =>
        $.clock.every(NUDGE, async () => {
          const now = await quietly(() => $.clock.now())
          if (now !== undefined && now - paneDrawnAt <= NUDGE * 3) $.ui.invalidate('ui.render')
        }),
      )
    }

    return next(e)
  })

  on('command.run', { command: 'signalbox' }, async ($, e) => {
    // `/signalbox spine` and `/signalbox board` switch the picture; plain `/signalbox` opens the pane.
    const asked = (e.args ?? '').trim().toLowerCase()
    const view = asked === 'spine' || asked === 'board' ? asked : undefined
    if (view !== undefined) await quietly(() => update($, board, b => ({ ...b, view })))
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    if (!opened.isPlaced) return { text: 'The pane could not be shown here.' }

    return { text: view === undefined ? 'Signalbox opened. Try /signalbox spine or /signalbox board.' : `Signalbox now shows the ${view}.` }
  })

  on('turn.start', async ($, e, next) => {
    // A message of the person's starts a fresh count; a background task reporting back does not.
    if (e.agentId === undefined && e.text !== '' && !e.text.trimStart().startsWith('<')) {
      await quietly(() => update($, board, b => ({ ...b, counts: { you: 1 }, live: {}, edited: [], calls: 0, isWorking: true })))
    } else if (e.agentId === undefined) {
      await quietly(() => update($, board, b => ({ ...b, isWorking: true })))
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const isMain = e.agentId === undefined
    const id = await begin($, { station: isMain ? 'model' : 'agents', label: isMain ? `Step ${e.index + 1}` : 'Subagent step' }, false)
    if (isMain) await quietly(() => update($, board, b => ({ ...b, model: e.model, isWorking: true })))
    try {
      return yield* next(e)
    } finally {
      const percent = isMain ? await quietly(async () => (await $.session.usage()).context.percent) : undefined
      await finish($, id, isMain ? 'model' : 'agents', 'ok', typeof percent === 'number' ? { context: percent } : undefined)
    }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      // An interrupted call never reports back; left alone its station would stay lit.
      await quietly(async () => {
        const now = await $.clock.now()
        await update($, board, b => ({
          ...b,
          isWorking: false,
          live: {},
          rows: b.rows.map(r => (r.status === 'run' ? { ...r, status: 'ok' as const, endedAt: now } : r)),
        }))
      })
      void refresh($, true)
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const seen = classify(e.tool, e as unknown as Record<string, unknown>)
    const id = await begin($, seen, true)
    try {
      const ran = await next(e)
      await finish($, id, seen.station, ran.deny !== undefined || ran.isError === true ? 'err' : 'ok')
      if (seen.station === 'files' || seen.station === 'shell') void refresh($, false)

      return ran
    } catch (failure) {
      await finish($, id, seen.station, 'err')
      throw failure
    }
  })

  on('classic.PreToolUse', async ($, e, next) => {
    const decided = await next(e)
    // A settings hook that stopped a call is the one moment the Hooks station has something to say.
    if (decided.deny !== undefined) {
      const id = await begin($, { station: 'hooks', label: `Stopped ${e.tool}` }, false)
      await finish($, id, 'hooks', 'err')
    }

    return decided
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const state = await read($, board)
    const now = (await quietly(() => $.clock.now())) ?? 0
    const { Box, Text } = $.ui.resolve(e)
    const rows = state.rows.filter(r => r.station !== 'model').slice(-4)
    const feed =
      rows.length === 0
        ? [<Text dimColor>Nothing yet.</Text>]
        : rows.map(r => (
            <Text mono size="footnote" color={r.status === 'err' ? 'error' : undefined} dimColor={r.status === 'ok'}>
              {`${r.status === 'run' ? '●' : r.status === 'ok' ? '·' : '✕'} ${NAMES[r.station].padEnd(8)} ${r.label}  ${took(r)}`}
            </Text>
          ))

    if (e.surface === 'terminal') {
      return <Box flexDirection="column">{feed}</Box>
    }

    const isWide = isWidePane(e.props.bodyColumns, e.props.scroll.bodyRows)
    const { Svg } = $.ui.resolve(e)
    const running = [...state.rows].reverse().find(r => r.status === 'run')
    const alt = `${TITLE}. ${running !== undefined ? `${NAMES[running.station]}: ${running.label}` : state.isWorking ? 'Thinking' : 'Waiting for you'}`

    const picture = state.view === 'spine' ? drawSpine(state, isWide, now) : drawBoard(state, isWide, names, now)
    paneDrawnAt = now

    // Sized to the pane both ways, its shape kept, and centred.
    // The wide board draws the feed itself, under the tag, where a short pane cannot cut it off.
    if (isWide) {
      const size = fitPicture(picture, e.props.bodyColumns, e.props.scroll.bodyRows)
      return (
        <Box flexDirection="column" alignItems="center">
          <Svg source={picture} alt={alt} width={size.width} height={size.height} />
        </Box>
      )
    }

    // The feed's lines and the gap above them come out of the drawing's room.
    const size = fitPicture(picture, e.props.bodyColumns, e.props.scroll.bodyRows - feed.length - 1)
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column" alignItems="center">
          <Svg source={picture} alt={alt} width={size.width} height={size.height} />
        </Box>
        <Box flexDirection="column">{feed}</Box>
      </Box>
    )
  })
}
