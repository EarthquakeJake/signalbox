export type StationId = 'you' | 'skills' | 'hooks' | 'memory' | 'model' | 'agents' | 'browser' | 'network' | 'files' | 'shell'

export type Row = {
  id: string
  station: StationId
  label: string
  status: 'run' | 'ok' | 'err'
  startedAt: number
  endedAt?: number
}

/** A stage of the release, read from the folder on the trunk that stands for it. */
export type Stage = {
  /** When a commit last touched that folder. */
  updatedAt: number
  /** The subject of that commit. */
  subject: string
  /** Commits the trunk has taken since, which the stage has not seen. */
  behind: number
}

/** A lane a project declares in its track file: one deployable part of it. */
export type TrackSpec = {
  name: string
  /** The lane's own id, where it has one; the checks tag is named after it. */
  id?: string
  /** Name patterns for the branches that belong to this lane; `*` stands for anything. */
  branches?: string[]
  /** A folder on the trunk whose newest commit means this lane's staging moved. */
  stagingPath?: string
  /** A branch that is this lane's staging, where it has one of its own. */
  stagingBranch?: string
  /** The start of the tag names that mark this lane's releases, such as `app-`. */
  tagPrefix?: string
  /** The files this lane owns, as globs: `**` spans folders, `*` stays inside one. */
  paths?: string[]
  /** True for a lane the project has set aside. */
  isParked?: boolean
}

/** One open branch of a lane, for listing under it. */
export type OpenBranch = {
  name: string
  /** Commits on it that the trunk does not have. */
  ahead: number
  /** Commits on the trunk that it does not have. */
  behind: number
  /** When its newest commit was made, in milliseconds. */
  updatedAt: number
  /** True where it was placed in this lane by its files rather than its name. */
  isByFiles?: boolean
  /** The worst clash this branch is part of, for marking it where it is drawn. */
  clash?: 'conflict' | 'overlap'
  /** Its newest commit's subject, which says what the branch is for when its name does not. */
  subject?: string
}

/**
 * Two pieces of open work that would collide, the signal Signalbox exists to give
 * teams and parallel agents early.
 */
export type Clash = {
  /** The two branches. Uncommitted work counts as part of the branch its worktree has checked out. */
  a: string
  b: string
  /** `conflict`: git finds merge conflicts between them. `overlap`: they change the same files, but git merges them cleanly. */
  level: 'conflict' | 'overlap'
  /** Up to three of the files involved, conflicting ones first. */
  files: string[]
  /** True where uncommitted work in a worktree, not only commits, is part of the clash. */
  isUncommitted?: boolean
  /** The lane's id when both branches are in the same lane, by name or by files; absent across lanes or where either is in none. */
  lane?: string
}

/** One lane as it stands now. */
export type Lane = {
  /** The lane's id from the track file, where it has one; a stable key for its colour. */
  id?: string
  /** Its open branches, newest first, at most four. `branches` remains the full count. */
  open?: OpenBranch[]
  /** Its newest release tags with when each was made, newest first, at most four, for the spine view. */
  releases?: { name: string; at: number }[]
  name: string
  /** Open branches that belong to this lane: those not yet merged into the trunk. */
  branches: number
  /** True while the branch you are on is one of them. */
  isHere: boolean
  staging?: Stage
  /** The newest tag of this lane, which usually names what is live. */
  live?: string
  /** True when staging holds exactly what is live (the same tree as the live tag), however far its branch sits from the trunk. */
  isStagingLive?: boolean
  /** Whether this lane's checks passed on what staging holds now. */
  isPassed?: boolean
  /** Whether the branch you are on has already reached this lane's staging. */
  hasYours?: boolean
  /** How many of `branches` were placed here by the files they changed, their names claiming no lane. */
  byFiles?: number
  /** True where this lane was worked out from the files changed, not from the branch name. */
  isGuessed?: boolean
  /** True for a lane the project has set aside. */
  isParked?: boolean
}

/** What git says about the folder this session works in. */
export type Repo =
  /** Git ran and would not answer: `why` carries its own first words. */
  | { kind: 'none'; why?: string }
  /** Git could not be run at all here, which is not the same as having no repository. */
  | { kind: 'blocked'; why: string; branch?: string }
  | {
      kind: 'repo'
      /** The branch checked out, or a short commit id when the head is detached. */
      branch: string
      /** The trunk's ref, kept even while you stand on it. */
      trunkRef?: string
      /** The trunk this branch is measured against; absent while you are on it. */
      trunk?: string
      /** Commits on this branch that the trunk does not have. */
      ahead: number
      /** Commits on the trunk that this branch does not have. */
      behind: number
      /** Files changed, added or removed and not yet committed. */
      dirty: number
      /** Commits not yet on the remote; absent when the branch has no remote. */
      unpushed?: number
      /** The staging stage, when a folder was named for it. */
      staging?: Stage
      /** The newest tag on the trunk, which usually names what is live. */
      tag?: string
      /** The lanes the project declares, where it declares any. */
      lanes?: Lane[]
      /** Your branch's name claimed no lane and its files could not settle one: none matched, or two lanes tied. */
      guess?: 'none' | 'tied'
      /** Local branches already merged into the trunk, which could be cleaned up. */
      merged?: number
      /** Open branches that belong to no lane, newest first, at most four, for the spine view. */
      loose?: OpenBranch[]
      /** Clashes among open branches and their worktrees' uncommitted work, worst first, at most eight. */
      clashes?: Clash[]
      /** The worst clash the branch you are on, with its uncommitted work, is part of. */
      clash?: 'conflict' | 'overlap'
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
  /** Which picture the pane shows: the board, or the trunk as a spine. Absent means the board. */
  view?: 'board' | 'spine'
  /** The branch picture, re-read in the background; absent until the first read. */
  repo?: Repo
}

declare module 'claude-code' {
  interface PluginState {
    'signalbox': { board: Shaped<Board> }
  }
}
