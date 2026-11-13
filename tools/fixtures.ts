import type { Board, Clash, Lane, OpenBranch, Repo } from '../types'

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
  make('lane-cards', 'Lane cards, Silkscreen as it stands', {
    ...busy,
    repo: repoOf({
      branch: 'claude/upbeat-volhard-48eb37',
      behind: 91,
      merged: 4,
      lanes: [
        { id: 'app', name: 'App', branches: 0, isHere: false, open: [], staging: { updatedAt: NOW - 2 * H, subject: 'UAT', behind: 0 }, live: 'app-v3.14.0', isPassed: true },
        {
          id: 'website', name: 'Website', branches: 1, isHere: true, isGuessed: true, byFiles: 1, live: 'site-2026-11-13',
          staging: { updatedAt: NOW - 2 * H, subject: 'UAT', behind: 0 }, hasYours: false,
          open: [{ name: 'claude/upbeat-volhard-48eb37', ahead: 2, behind: 91, updatedAt: NOW - H, isByFiles: true }],
        },
        { id: 'platform', name: 'Platform', branches: 1, isHere: false, open: [{ name: 'platform/branch-prefix', ahead: 1, behind: 0, updatedAt: NOW - 26 * H }] },
        { id: 'cloud', name: 'Cloud trial', branches: 1, isHere: false, isParked: true, open: [{ name: 'codex/private-alpha', ahead: 17, behind: 111, updatedAt: NOW - 20 * 24 * H, isByFiles: true }] },
      ],
    }),
  }),
  make('spine-silkscreen', 'Spine: Silkscreen with releases and branches in no lane', {
    ...busy,
    repo: repoOf({
      branch: 'claude/upbeat-volhard-48eb37',
      behind: 91,
      merged: 4,
      loose: [
        { name: 'review/plan-notes', ahead: 3, behind: 26, updatedAt: NOW - 5 * H },
        { name: 'claude/wonderful-mcclintock-4a2b', ahead: 1, behind: 4, updatedAt: NOW - 30 * 24 * H },
      ],
      lanes: [
        {
          id: 'app', name: 'App', branches: 0, isHere: false, open: [], live: 'app-v3.14.0', isPassed: true,
          staging: { updatedAt: NOW - 2 * H, subject: 'UAT', behind: 0 },
          releases: [
            { name: 'app-v3.14.0', at: NOW - 6 * H },
            { name: 'app-v3.12.0', at: NOW - 26 * H },
            { name: 'app-v3.11.1', at: NOW - 3 * 24 * H },
            { name: 'app-v3.11.0', at: NOW - 6 * 24 * H },
          ],
        },
        {
          id: 'website', name: 'Website', branches: 1, isHere: true, isGuessed: true, byFiles: 1, live: 'site-2026-11-13', hasYours: false,
          staging: { updatedAt: NOW - 2 * H, subject: 'UAT', behind: 12 },
          open: [{ name: 'claude/upbeat-volhard-48eb37', ahead: 2, behind: 91, updatedAt: NOW - H, isByFiles: true }],
          releases: [{ name: 'site-2026-11-13', at: NOW - 7 * H }, { name: 'site-2026-11-10', at: NOW - 3 * 24 * H }],
        },
        { id: 'platform', name: 'Platform', branches: 1, isHere: false, open: [{ name: 'platform/branch-prefix', ahead: 1, behind: 0, updatedAt: NOW - 26 * H }] },
        { id: 'cloud', name: 'Cloud trial', branches: 1, isHere: false, isParked: true, open: [{ name: 'codex/private-alpha', ahead: 17, behind: 111, updatedAt: NOW - 20 * 24 * H, isByFiles: true }] },
      ],
    }),
  }),
  make('spine-silkscreen-today', 'Spine: Silkscreen as git read it on 13 Nov', {
    ...busy,
    repo: repoOf({
      branch: 'claude/upbeat-volhard-48eb37',
      behind: 91,
      merged: 4,
      loose: [{ name: 'claude/vigorous-khayyam-da3b47', ahead: 4, behind: 91, updatedAt: NOW - 26 * H }],
      lanes: [
        { id: 'app', name: 'App', branches: 0, isHere: false, open: [], live: 'app-v3.14.0', releases: [{ name: 'app-v3.14.0', at: NOW - 4.5 * H }] },
        {
          id: 'website', name: 'Website', branches: 1, isHere: true, isGuessed: true, byFiles: 1, live: 'site-2026-11-13',
          open: [{ name: 'claude/upbeat-volhard-48eb37', ahead: 2, behind: 91, updatedAt: NOW - H, isByFiles: true }],
          releases: [{ name: 'site-2026-11-13', at: NOW - 4.5 * H }],
        },
        { id: 'platform', name: 'Platform', branches: 1, isHere: false, open: [{ name: 'platform/branch-prefix', ahead: 1, behind: 0, updatedAt: NOW - 26 * H }] },
        { id: 'cloud', name: 'Cloud trial', branches: 1, isHere: false, isParked: true, open: [{ name: 'codex/private-alpha', ahead: 17, behind: 111, updatedAt: NOW - 20 * 24 * H, isByFiles: true }] },
      ],
    }),
  }),
  make('spine-signalbox', 'Spine: this repository, four tracks and the Release lane\'s versions', {
    ...busy,
    repo: repoOf({
      branch: 'board/spine',
      behind: 3,
      dirty: 0,
      unpushed: undefined,
      merged: 9,
      lanes: [
        {
          id: 'board', name: 'Board', branches: 2, isHere: true,
          open: [{ name: 'board/spine', ahead: 2, behind: 3, updatedAt: NOW - 10 * 60000 }, { name: 'board/release-3', ahead: 0, behind: 14, updatedAt: NOW - 90 * 60000 }],
        },
        { id: 'data', name: 'Data', branches: 1, isHere: false, open: [{ name: 'data/lane-branches', ahead: 0, behind: 9, updatedAt: NOW - 2 * H }] },
        { id: 'quality', name: 'Quality', branches: 0, isHere: false, open: [] },
        {
          id: 'release', name: 'Release', branches: 0, isHere: false, open: [], live: 'v0.10.0',
          releases: [
            { name: 'v0.10.0', at: NOW - 24 * 60000 },
            { name: 'v0.9.0', at: NOW - 31 * 60000 },
            { name: 'v0.8.0', at: NOW - 33 * 60000 },
            { name: 'v0.7.0', at: NOW - 56 * 60000 },
          ],
        },
      ],
    }),
  }),
  make('spine-crowded','Spine: many open branches, none yours, one far past the scale', {
    ...calm,
    repo: repoOf({
      branch: 'claude/vigorous-khayyam-da3b47',
      behind: 3,
      guess: 'none',
      merged: 21,
      loose: [
        { name: 'claude/MMMWWWMMMWWWMMMWWWMMMWWW', ahead: 140, behind: 4000, updatedAt: NOW - 90 * 24 * H },
        { name: 'fix', ahead: 1, behind: 1, updatedAt: NOW - 60000 },
      ],
      lanes: ['App', 'Website', 'Platform'].map((name, at) => ({
        id: name.toLowerCase(),
        name,
        branches: 4,
        isHere: false,
        open: [0, 1, 2, 3].map(k => ({ name: `${name.toLowerCase()}/branch-${k}-${'x'.repeat(k * 6)}`, ahead: k + 1, behind: [2, 9, 40, 180][k]! + at * 3, updatedAt: NOW - (k * 9 + at) * 24 * H })),
      })),
    }),
  }),
  make('lane-cards-full','Lane cards, four lanes of four branches, none yours', {
    ...calm,
    repo: repoOf({
      branch: 'claude/vigorous-khayyam-da3b47',
      guess: 'none',
      merged: 21,
      lanes: ['App', 'Website and landing pages', 'Platform', 'Cloud trial'].map((name, at) => ({
        id: name.toLowerCase().split(' ')[0],
        name,
        branches: 4 + at * 3,
        isHere: false,
        isParked: at === 3,
        live: at === 2 ? undefined : ['app-v3.14.0-rc.12', 'site-2026-11-13', '', 'cloud-v0.1.0'][at],
        staging: at === 1 ? undefined : { updatedAt: NOW - (at + 1) * 9 * H, subject: 'UAT', behind: at },
        open: [
          { name: 'claude/MMMWWWMMMWWWMMMWWWMMMWWW', ahead: 140, behind: 312, updatedAt: NOW - 40 * 24 * H },
          { name: 'codex/private-alpha', ahead: 17, behind: 111, updatedAt: NOW - 3 * H },
          { name: 'feature/a-rather-long-branch-name-for-this', ahead: 3, behind: 12, updatedAt: NOW - 30 * 24 * H },
          { name: 'fix', ahead: 1, behind: 0, updatedAt: NOW - 60000 },
        ],
      })),
    }),
  }),
  make('descriptions', 'Branch descriptions from commit subjects, and staging the same as live', {
    ...busy,
    repo: repoOf({
      branch: 'claude/upbeat-volhard-48eb37',
      behind: 91,
      merged: 4,
      loose: [{ name: 'claude/vigorous-khayyam-da3b47', ahead: 4, behind: 91, updatedAt: NOW - 26 * H, subject: 'Draft the review plan for the pricing page' }],
      lanes: [
        {
          id: 'app', name: 'App', branches: 2, isHere: false, live: 'app-v3.14.0', isStagingLive: true,
          staging: { updatedAt: NOW - 30 * H, subject: 'UAT', behind: 8 },
          releases: [{ name: 'app-v3.14.0', at: NOW - 4.5 * H }],
          open: [
            { name: 'claude/wonderful-mcclintock-4a2b', ahead: 3, behind: 2, updatedAt: NOW - 3 * H, subject: 'Timeline: keep the scroll position when a filter changes' },
            { name: 'app/offline-sync', ahead: 6, behind: 40, updatedAt: NOW - 20 * 24 * H, subject: 'Queue writes while offline and replay them in order' },
          ],
        },
        {
          id: 'website', name: 'Website', branches: 1, isHere: true, isGuessed: true, byFiles: 1, live: 'site-2026-11-13', isStagingLive: true, hasYours: false,
          staging: { updatedAt: NOW - 30 * H, subject: 'UAT', behind: 8 },
          releases: [{ name: 'site-2026-11-13', at: NOW - 4.5 * H }],
          open: [{ name: 'claude/upbeat-volhard-48eb37', ahead: 2, behind: 91, updatedAt: NOW - H, subject: 'Landing: untangle the hero and the pricing table', isByFiles: true }],
        },
        { id: 'platform', name: 'Platform', branches: 1, isHere: false, open: [{ name: 'platform/branch-prefix', ahead: 1, behind: 0, updatedAt: NOW - 26 * H, subject: 'Name branches by lane prefix' }] },
        { id: 'cloud', name: 'Cloud trial', branches: 1, isHere: false, isParked: true, open: [{ name: 'codex/private-alpha', ahead: 17, behind: 111, updatedAt: NOW - 20 * 24 * H, subject: 'Private alpha: invite-only sign-up' }] },
      ],
    }),
  }, { staging: 'UAT', live: 'Live' }),
  make('silkscreen-same-as-live', 'Silkscreen as git read it: staging 12 behind but the same as live, with subjects', {
    ...busy,
    repo: repoOf({
      branch: 'claude/upbeat-volhard-48eb37',
      behind: 91,
      merged: 4,
      loose: [{ name: 'claude/vigorous-khayyam-da3b47', ahead: 4, behind: 91, updatedAt: NOW - 26 * H, subject: 'Plan: old sessions ended (5.2)' }],
      lanes: [
        {
          id: 'app', name: 'App', branches: 3, isHere: false, live: 'app-v3.14.0', isStagingLive: true,
          staging: { updatedAt: NOW - 30 * H, subject: 'UAT', behind: 12 },
          releases: [{ name: 'app-v3.14.0', at: NOW - 4.5 * H }],
          open: [
            { name: 'app/pins-tooltip', ahead: 2, behind: 12, updatedAt: NOW - 5 * H, subject: 'Pins: show the full name in a tooltip' },
            { name: 'app/board-check', ahead: 1, behind: 30, updatedAt: NOW - 2 * 24 * H, subject: 'Check the board before saving' },
            { name: 'app/routing-order', ahead: 3, behind: 64, updatedAt: NOW - 16 * 24 * H, subject: 'Routing: keep the order of nested routes' },
          ],
        },
        {
          id: 'website', name: 'Website', branches: 1, isHere: true, isGuessed: true, byFiles: 1, live: 'site-2026-11-13', isStagingLive: true, hasYours: false,
          staging: { updatedAt: NOW - 30 * H, subject: 'UAT', behind: 12 },
          releases: [{ name: 'site-2026-11-13', at: NOW - 4.5 * H }],
          open: [{ name: 'claude/upbeat-volhard-48eb37', ahead: 2, behind: 91, updatedAt: NOW - H, isByFiles: true, subject: 'Landing: untangle the hero' }],
        },
        { id: 'platform', name: 'Platform', branches: 1, isHere: false, open: [{ name: 'platform/branch-prefix', ahead: 1, behind: 0, updatedAt: NOW - 26 * H, subject: 'Name branches by lane prefix' }] },
        { id: 'cloud', name: 'Cloud trial', branches: 1, isHere: false, isParked: true, open: [{ name: 'codex/private-alpha', ahead: 17, behind: 111, updatedAt: NOW - 20 * 24 * H, isByFiles: true }] },
      ],
    }),
  }, { staging: 'UAT', live: 'Live' }),
  make('trunk-releases','On main in no lane: what is live in every lane', {
    ...calm,
    repo: repoOf({
      branch: 'main',
      trunk: undefined,
      ahead: 0,
      dirty: 0,
      unpushed: 0,
      merged: 4,
      lanes: [
        { id: 'app', name: 'App', branches: 0, isHere: false, open: [], live: 'app-v3.14.0', releases: [{ name: 'app-v3.14.0', at: NOW - 4.5 * H }, { name: 'app-v3.12.0', at: NOW - 26 * H }] },
        { id: 'website', name: 'Website', branches: 0, isHere: false, open: [], live: 'site-2026-11-13', releases: [{ name: 'site-2026-11-13', at: NOW - 4.5 * H }] },
        { id: 'platform', name: 'Platform', branches: 1, isHere: false, open: [{ name: 'platform/branch-prefix', ahead: 1, behind: 0, updatedAt: NOW - 26 * H }] },
        { id: 'release', name: 'Release', branches: 0, isHere: false, open: [], live: 'v0.12.0', releases: [{ name: 'v0.12.0', at: NOW - 20 * 60000 }] },
      ],
    }),
  }),
]

/**
 * Silkscreen with clashes: the repository's list, each branch's worst level and
 * your branch's, as the Data lead's reading would give them.
 */
function withClashes(id: string, title: string, clashes: Clash[], more: Record<string, OpenBranch[]> = {}): Fixture {
  const base = FIXTURES.find(f => f.id === 'silkscreen-same-as-live') as Fixture
  const plain = base.board.repo as Extract<Repo, { kind: 'repo' }>
  // `more` adds open branches to lanes by id, for a reading with branches the base does not have.
  const repo = { ...plain, lanes: (plain.lanes ?? []).map(lane => ({ ...lane, open: [...(lane.open ?? []), ...(more[lane.id ?? ''] ?? [])], branches: lane.branches + (more[lane.id ?? '']?.length ?? 0) })) }
  const worst = (name: string): Clash['level'] | undefined => {
    const levels = clashes.filter(c => c.a === name || c.b === name).map(c => c.level)
    return levels.includes('conflict') ? 'conflict' : levels.length > 0 ? 'overlap' : undefined
  }
  const mark = (b: OpenBranch): OpenBranch => ({ ...b, clash: worst(b.name) })
  return {
    ...base,
    id,
    title,
    board: {
      ...base.board,
      repo: {
        ...repo,
        clashes,
        clash: worst(repo.branch),
        loose: (repo.loose ?? []).map(mark),
        lanes: (repo.lanes ?? []).map(lane => ({ ...lane, open: (lane.open ?? []).map(mark) })),
      },
    },
  }
}

/** Every pair among some branches, as overlaps on one file: the App's branches all touch its one big file. */
const pairs = (names: string[], file: string): Clash[] =>
  names.flatMap((a, i) => names.slice(i + 1).map(b => ({ a, b, level: 'overlap' as const, files: [file] })))

/** A fixture's board with every station counted in two figures, the narrow chips' hardest case. */
const chipCounts = (): Fixture => {
  const base = FIXTURES.find(f => f.id === 'lane-cards') as Fixture
  return { ...base, id: 'chip-counts', title: 'Two-figure counts on every chip', board: { ...base.board, counts: { you: 12, skills: 20, hooks: 20, memory: 20, model: 48, agents: 20, browser: 20, network: 20, files: 20, shell: 20 } } }
}

FIXTURES.push(
  chipCounts(),
  withClashes(
    'clash-hidden-branch',
    'App pairs with a fifth branch the lane does not list, routine by Clash.lane; one overlap crosses lanes',
    [
      // Clash.lane says both branches share a lane, listed or not.
      ...pairs(['app/board-check', 'app/pins-tooltip', 'app/routing-order', 'app/hidden-fifth'], 'public/app/index.html').map(c => ({ ...c, lane: 'app' })),
      { a: 'platform/branch-prefix', b: 'app/hidden-fifth', level: 'overlap', files: ['hooks/tracks.ts'] },
    ],
  ),
  withClashes(
    'clash-silkscreen-laned',
    'Silkscreen read with Clash.lane: the conflict, five routine App pairs, and one App pair on two files',
    [
      { a: 'site/no-paid-mentions', b: 'claude/upbeat-volhard-48eb37', level: 'conflict', files: ['public/privacy/index.html', 'site/tools/make_legal.py', 'public/terms/index.html'], lane: 'site' },
      ...pairs(['app/board-check', 'app/pins-tooltip', 'app/release-3.14.1', 'app/routing-order'], 'public/app/index.html')
        .map(c => ({ ...c, lane: 'app' }))
        // The one pair on two files is not routine, and stays amber.
        .map(c => (c.a === 'app/release-3.14.1' && c.b === 'app/routing-order' ? { ...c, files: ['public/app/index.html', 'src/router.ts'] } : c)),
    ],
    {
      app: [{ name: 'app/release-3.14.1', ahead: 4, behind: 3, updatedAt: NOW - 8 * H, subject: 'Release 3.14.1: the pins fix' }],
      website: [{ name: 'site/no-paid-mentions', ahead: 2, behind: 20, updatedAt: NOW - 30 * H, subject: 'Legal: no paid mentions in the privacy and terms pages' }],
    },
  ),
  withClashes(
    'clash-silkscreen',
    'Silkscreen as git read it: one conflict, and six routine App overlaps on one file',
    [
      { a: 'site/no-paid-mentions', b: 'claude/upbeat-volhard-48eb37', level: 'conflict', files: ['public/privacy/index.html', 'site/tools/make_legal.py', 'public/terms/index.html'] },
      ...pairs(['app/board-check', 'app/pins-tooltip', 'app/release-3.14.1', 'app/routing-order'], 'public/app/index.html'),
    ],
    {
      app: [{ name: 'app/release-3.14.1', ahead: 4, behind: 3, updatedAt: NOW - 8 * H, subject: 'Release 3.14.1: the pins fix' }],
      website: [{ name: 'site/no-paid-mentions', ahead: 2, behind: 20, updatedAt: NOW - 30 * H, subject: 'Legal: no paid mentions in the privacy and terms pages' }],
    },
  ),
  withClashes('clash-conflict','One conflict between two App branches', [
    { a: 'app/board-check', b: 'app/routing-order', level: 'conflict', files: ['src/router.ts', 'src/board/check.ts'] },
  ]),
  withClashes('clash-overlap', 'Your branch overlaps a Platform branch', [
    { a: 'claude/upbeat-volhard-48eb37', b: 'platform/branch-prefix', level: 'overlap', files: ['site/index.html'] },
  ]),
  withClashes('clash-uncommitted', 'Your uncommitted work overlaps an App branch', [
    { a: 'claude/upbeat-volhard-48eb37', b: 'app/pins-tooltip', level: 'overlap', files: ['shared/tooltip.css', 'site/landing.css'], isUncommitted: true },
  ]),
  withClashes('clash-many', 'Many clashes, yours among them, worst first', [
    { a: 'claude/upbeat-volhard-48eb37', b: 'app/routing-order', level: 'conflict', files: ['src/router.ts'], isUncommitted: true },
    { a: 'app/board-check', b: 'app/routing-order', level: 'conflict', files: ['src/board/check.ts', 'src/router.ts'] },
    { a: 'codex/private-alpha', b: 'claude/vigorous-khayyam-da3b47', level: 'conflict', files: ['cloud/deploy/very/long/path/to/the/alpha-config.yaml'] },
    { a: 'app/pins-tooltip', b: 'app/board-check', level: 'overlap', files: ['src/board/pins.tsx'] },
    { a: 'platform/branch-prefix', b: 'claude/vigorous-khayyam-da3b47', level: 'overlap', files: ['hooks/tracks.ts'] },
    { a: 'claude/upbeat-volhard-48eb37', b: 'platform/branch-prefix', level: 'overlap', files: ['site/index.html'] },
    { a: 'app/pins-tooltip', b: 'claude/vigorous-khayyam-da3b47', level: 'overlap', files: ['README.md'] },
    { a: 'app/routing-order', b: 'platform/branch-prefix', level: 'overlap', files: ['package.json'] },
  ]),
)
