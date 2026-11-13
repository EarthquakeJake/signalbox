import { expect, test } from 'claude-code/testing'

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

// The test engine serves no processes, so git always fails here: the board must
// still draw, saying plainly that it found no repository.
test('a folder with no git repository says so', async ($, on) => {
  on('command.register', () => ({ value: { command: 'signalbox' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 1000 }))

  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  await settle()

  const ui = await $.ui.mount(pane(60, 60))
  expect(JSON.stringify(await ui.find({ type: 'Svg' }))).toContain('No git repository')
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
  await ui.unmount()
})
