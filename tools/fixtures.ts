import type { Board, Lane, Repo } from '../types'

// Boards that have broken before, as plain data. The render harness draws each
// one tall and wide, and the plugin tests run the layout check over the same set.
// Only `Board` and `drawBoard`'s arguments are used, so a new drawing can land
// without these changing.

export type Fixture = {
  /** A short file-safe name. */
  id: string
  /** What the case is, in a few words. */
  title: string
  board: Board
  names: { staging: string; live: string }
  now: number
}

export const NOW = Date.UTC(2026, 10, 13, 14, 0)
const H = 3600000
const NAMES = { staging: 'Staging', live: 'Live' }

/** Four lanes the way Silkscreen declares them, one of them set aside. */
const silkscreen = (here: number, extra: Partial<Lane> = {}): Lane[] => {
  const lanes: Lane[] = [
    { name: 'App', branches: 0, isHere: false, staging: { updatedAt: NOW - 2 * H, subject: 'UAT: same as live', behind: 0 }, live: 'app-v3.14.0', isPassed: true },
    { name: 'Website', branches: 1, isHere: false, staging: { updatedAt: NOW - 2 * H, subject: 'UAT: new landing', behind: 0 }, live: 'site-2026-11-13' },
    { name: 'Platform', branches: 1, isHere: false, staging: { updatedAt: NOW - 30 * H, subject: 'UAT: queue retries', behind: 3 }, live: 'platform-v1.2.0' },
    { name: 'Cloud trial', branches: 1, isHere: false, isParked: true },
  ]
  return lanes.map((lane, at) => (at === here ? { ...lane, isHere: true, hasYours: false, ...extra } : lane))
}

const repoOf = (fields: Partial<Extract<Repo, { kind: 'repo' }>>): Repo => ({
  kind: 'repo',
  branch: 'site/landing',
  trunk: 'origin/main',
  trunkRef: 'origin/main',
  ahead: 2,
  behind: 0,
  dirty: 3,
  unpushed: 2,
  ...fields,
})

/** A turn in progress: a few stations used, one Files call still running. */
const busy: Omit<Board, 'repo'> = {
  counts: { skills: 1, model: 6, network: 2, files: 3, shell: 2 },
  live: { files: 1 },
  rows: [
    { id: '3', station: 'files', label: 'Read timeline.js', status: 'ok', startedAt: NOW - 9000, endedAt: NOW - 8700 },
    { id: '2', station: 'shell', label: 'npm run build', status: 'ok', startedAt: NOW - 5000, endedAt: NOW - 800 },
    { id: '1', station: 'files', label: 'Edit landing.css', status: 'run', startedAt: NOW },
  ],
  edited: ['site/landing.css', 'site/index.html', 'site/hero.js'],
  calls: 14,
  isWorking: true,
  model: 'claude-fable-5-2',
  context: 38,
}

/** Between turns: nothing running, nothing counted. */
const calm: Omit<Board, 'repo'> = {
  counts: {},
  live: {},
  rows: [],
  edited: [],
  calls: 0,
  isWorking: false,
  model: 'claude-opus-5-5',
  context: 12,
}

const make = (id: string, title: string, board: Board, names = NAMES): Fixture => ({ id, title, board, names, now: NOW })

export const FIXTURES: Fixture[] = [
  make('lanes-by-name', 'Four lanes, yours lit by its name', { ...busy, repo: repoOf({ lanes: silkscreen(1) }) }),
  make('lanes-by-files', 'Four lanes, yours lit from its files', {
    ...busy,
    repo: repoOf({ branch: 'claude/upbeat-volhard-48eb37', lanes: silkscreen(1, { isGuessed: true, byFiles: 1 }) }),
  }),
  make('lane-none', 'No lane in files', {
    ...calm,
    edited: ['review/plan.md'],
    repo: repoOf({ branch: 'claude/vigorous-khayyam-da3b47', ahead: 1, dirty: 0, unpushed: 0, guess: 'none', lanes: silkscreen(-1) }),
  }),
  make('lane-tied', 'Lanes tied in files', {
    ...calm,
    repo: repoOf({ branch: 'claude/upbeat-volhard-48eb37', ahead: 3, dirty: 1, guess: 'tied', lanes: silkscreen(-1) }),
  }),
  make('long-branch-lanes', 'Long branch name, with lanes', {
    ...busy,
    repo: repoOf({ branch: 'claude/vigorous-khayyam-da3b47', lanes: silkscreen(2, { isGuessed: true }) }),
  }),
  make('long-branch-track', 'Long branch name, single track', {
    ...busy,
    repo: repoOf({ branch: 'claude/vigorous-khayyam-da3b47', behind: 12 }),
  }),
  make('wide-letters', 'Branch of wide letters, with lanes', {
    ...busy,
    repo: repoOf({ branch: 'claude/MMMWWWMMMWWWMMMWWWMMMWWW', guess: 'tied', lanes: silkscreen(-1) }),
  }),
  make('parked-lane', 'A parked lane with a long name', {
    ...calm,
    repo: repoOf({
      dirty: 0,
      lanes: [
        { name: 'Website', branches: 2, isHere: true, staging: { updatedAt: NOW - 5 * 60000, subject: 'UAT', behind: 0 }, live: 'site-2026-11-13', hasYours: true },
        { name: 'Cloud trial and migration', branches: 4, isHere: false, isParked: true },
        { name: 'Wwwwwwwwwwww', branches: 12, isHere: false, isParked: true, live: 'wwww-v10.10.10-rc.1' },
      ],
    }),
  }),
  make('no-lanes-staging', 'No lanes, with a staging stop', {
    ...busy,
    repo: repoOf({ staging: { updatedAt: NOW - 3 * H, subject: 'UAT: the new landing page and the pricing table', behind: 2 }, tag: 'site-2026-11-13' }),
  }, { staging: 'Preview deploy', live: 'Production' }),
  make('no-lanes-plain', 'No lanes, no staging stop', { ...busy, repo: repoOf({ dirty: 14, behind: 5 }) }),
  make('on-trunk', 'On the trunk, clean', { ...calm, repo: repoOf({ branch: 'main', trunk: undefined, ahead: 0, dirty: 0, unpushed: 0 }) }),
  make('reading', 'Reading the repository', { ...calm, repo: undefined }),
  make('no-repo', 'No repository', { ...calm, repo: { kind: 'none' } }),
  make('no-repo-why', 'Git refused, with its words', { ...calm, repo: { kind: 'none', why: 'fatal: detected dubious ownership in repository at C:/Users/someone/projects/a-very-long-folder-name' } }),
  make('git-blocked', 'Git blocked', { ...calm, repo: { kind: 'blocked', why: 'spawn git ENOENT: the command could not be found on this machine', branch: 'claude/vigorous-khayyam-da3b47' } }),
  make('files-running', 'A Files call running, long label', {
    ...busy,
    rows: [...busy.rows.slice(0, 2), { id: '1', station: 'files', label: 'Edit src/components/WideWindowManagerMenu.tsx', status: 'run', startedAt: NOW }],
    calls: 128,
    counts: { ...busy.counts, files: 140 },
    repo: repoOf({ lanes: silkscreen(0) }),
  }),
  make('idle', 'Idle board', { ...calm, model: undefined, context: undefined, repo: repoOf({ ahead: 0, dirty: 0, unpushed: undefined }) }),
]
