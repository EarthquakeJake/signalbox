export type StationId = 'you' | 'skills' | 'hooks' | 'memory' | 'model' | 'agents' | 'browser' | 'network' | 'files' | 'shell'

export type Row = {
  id: string
  station: StationId
  label: string
  status: 'run' | 'ok' | 'err'
  startedAt: number
  endedAt?: number
}

/** What git says about the folder this session works in. */
export type Repo =
  | { kind: 'none' }
  | {
      kind: 'repo'
      /** The branch checked out, or a short commit id when the head is detached. */
      branch: string
      /** The trunk this branch is measured against, such as `main`. */
      trunk?: string
      /** Commits on this branch that the trunk does not have. */
      ahead: number
      /** Commits on the trunk that this branch does not have. */
      behind: number
      /** Files changed, added or removed and not yet committed. */
      dirty: number
      /** Commits not yet on the remote; absent when the branch has no remote. */
      unpushed?: number
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
  /** The branch picture, re-read in the background; absent until the first read. */
  repo?: Repo
}

declare module 'claude-code' {
  interface PluginState {
    'signalbox': { board: Shaped<Board> }
  }
}
