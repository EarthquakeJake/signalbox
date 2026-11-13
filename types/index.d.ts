export type StationId = 'you' | 'skills' | 'hooks' | 'memory' | 'model' | 'agents' | 'browser' | 'network' | 'files' | 'shell'

export type Row = {
  id: string
  station: StationId
  label: string
  status: 'run' | 'ok' | 'err'
  startedAt: number
  endedAt?: number
}

export type Board = {
  /** Uses of each station since the person's last message. */
  counts: Partial<Record<StationId, number>>
  /** Calls of each station still running. */
  live: Partial<Record<StationId, number>>
  /** The newest rows of the feed. */
  rows: Row[]
  /** Files edited or written since the person's last message. */
  edited: string[]
  /** Tool calls since the person's last message. */
  calls: number
  isWorking: boolean
  model?: string
  context?: number
}

declare module 'claude-code' {
  interface PluginState {
    'signalbox': { board: Shaped<Board> }
  }
}
