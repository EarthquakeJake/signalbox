import { expect, test } from 'claude-code/testing'

import { fit } from './draw'
import { covers, matches, pickLane } from './paths'

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 150))

const pane = (bodyColumns: number, bodyRows: number) =>
  ({
    plugin: 'signalbox',
    component: 'Pane',
    requestId: 'signalbox',
    surface: 'desktop',
    props: {
      title: 'Signalbox',
      isFocused: false,
      bodyColumns,
      placement: 'dock',
      scroll: { offset: 0, bodyRows },
      view: {},
    },
  }) as const

test('a shell call shows in the feed and the board is drawn', async ($, on) => {
  on('command.register', () => ({ value: { command: 'signalbox' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 1000 }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls', description: 'List files' })
  await settle()

  const ui = await $.ui.mount(pane(60, 60))
  const row = await ui.find({ type: 'Text', text: /Shell/ })
  expect(row?.text).toContain('List files')
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(1)
  await ui.unmount()
})

test('a tall pane gets the tall board and a short wide pane the wide one', async $ => {
  const tall = await $.ui.mount(pane(60, 60))
  expect(JSON.stringify(await ui_svg(tall))).toContain('0 0 440 436')
  await tall.unmount()

  const wide = await $.ui.mount(pane(120, 20))
  expect(JSON.stringify(await ui_svg(wide))).toContain('0 0 900 284')
  await wide.unmount()
})

async function ui_svg(ui: { find: (query: { type: 'Svg' }) => Promise<unknown> }): Promise<unknown> {
  return ui.find({ type: 'Svg' })
}

// The test engine serves no processes, so git cannot run here at all: the board
// must say that, rather than claim the folder holds no repository.
test('a host that runs no commands says git did not run', async ($, on) => {
  on('command.register', () => ({ value: { command: 'signalbox' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 1000 }))
  on('session.cwd', () => ({ value: '/repo' }))

  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  await settle()

  const ui = await $.ui.mount(pane(60, 60))
  expect(JSON.stringify(await ui.find({ type: 'Svg' }))).toContain('Git did not run')
  await ui.unmount()
})

test('declared lanes are drawn in place of the single track', async ($, on) => {
  // The board's own stored value, as a reload would meet it: three lanes, the
  // middle one the lane this branch belongs to.
  on('state.get', () => ({
    value: {
      version: 1,
      value: {
        shape: 'board-1',
        value: {
        counts: {},
        live: {},
        rows: [],
        edited: [],
        calls: 0,
        isWorking: false,
        repo: {
          kind: 'repo',
          branch: 'site/landing',
          ahead: 2,
          behind: 0,
          dirty: 1,
          lanes: [
            { name: 'App', branches: 0, isHere: false, live: 'app-v3.14.0', staging: { updatedAt: 0, subject: 'UAT: same as live', behind: 0 }, isPassed: true },
            { name: 'Site', branches: 3, isHere: true, live: 'site-2026-11-13', staging: { updatedAt: 0, subject: 'UAT: new landing', behind: 4 }, hasYours: false },
            { name: 'Cloud', branches: 1, isHere: false, isParked: true },
          ],
          },
        },
      },
    },
  }))

  const ui = await $.ui.mount(pane(60, 60))
  const svg = JSON.stringify(await ui.find({ type: 'Svg' }))
  expect(svg).toContain('App')
  expect(svg).toContain('site-2026-11-13')
  expect(svg).toContain('not yet')
  expect(svg).toContain('parked')
  expect(svg).toContain('3 tracks')
  expect(svg).toContain('site/landing')
  await ui.unmount()
})

test('path globs place a file in the right lane', () => {
  // `**` spans folders, `*` stays inside one, as a project's track file means them.
  expect(covers('app/**', 'app/src/main.ts')).toBe(true)
  expect(covers('app/**', 'site/src/main.ts')).toBe(false)
  expect(covers('public/*.html', 'public/index.html')).toBe(true)
  expect(covers('public/*.html', 'public/uat/index.html')).toBe(false)
  expect(covers('**/tracks.json', 'tools/tracks.json')).toBe(true)
  expect(covers('**/tracks.json', 'tracks.json')).toBe(true)
  expect(covers('review/**', 'review/qa/notes.md')).toBe(true)
  // A glob that cannot compile must refuse rather than throw.
  expect(covers('app/[', 'app/[')).toBe(true)
})

test('branch patterns match by name', () => {
  expect(matches('app/*', 'app/landing')).toBe(true)
  expect(matches('app/*', 'site/landing')).toBe(false)
  expect(matches('feature/app-*', 'feature/app-wires')).toBe(true)
  expect(matches('app/*', 'app/deep/branch')).toBe(true)
})

test('a branch goes to the lane owning most of its files, and a tie names no lane', () => {
  const lanes = [['app/**'], ['site/**'], [], ['cloud/**']]
  expect(pickLane(['site/a.ts', 'site/b.ts', 'app/c.ts'], lanes)).toEqual({ kind: 'lane', index: 1 })
  expect(pickLane(['app/a.ts', 'site/b.ts'], lanes)).toEqual({ kind: 'tied' })
  expect(pickLane(['review/plan.md'], lanes)).toEqual({ kind: 'none' })
  expect(pickLane([], lanes)).toBeUndefined()
  // A tie below the top does not spoil a clear winner.
  expect(pickLane(['cloud/a', 'cloud/b', 'app/c', 'site/d'], lanes)).toEqual({ kind: 'lane', index: 3 })
})

test('a branch name is cut by its width, so wide letters stop short of the wire', () => {
  expect(fit('claude/awesome-wozniak-mw3m9b7', 190)).toBe('claude/awesome-wozniak-mw3m9b7')
  expect(fit('claude/MMMMWWWWMMMMWWWWMMMMWWWW', 190).length).toBeLessThan(24)
})
