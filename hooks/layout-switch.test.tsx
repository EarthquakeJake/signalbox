import { expect, test } from 'claude-code/testing'

import { isWidePane } from './register'

const pane = (bodyColumns: number, bodyRows: number) =>
  ({
    plugin: 'signalbox',
    component: 'Pane',
    requestId: 'signalbox',
    surface: 'desktop',
    props: { title: 'Signalbox', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} },
  }) as const

/** `wide` or `tall`, read from the board's viewBox. */
const shapeOf = (svg: unknown): string => {
  const m = /viewBox=\\?"0 0 (\d+) (\d+)/.exec(JSON.stringify(svg))
  return m === null ? 'none' : Number(m[1]) > 600 ? 'wide' : 'tall'
}

test('the switch point: 90 cells across, and wider than 3.2 cells per row', () => {
  // Under 90 cells the board stays tall, however short the pane.
  expect(isWidePane(89, 5)).toBe(false)
  expect(isWidePane(90, 5)).toBe(true)
  // At and past 90, the ratio decides: wide while columns > rows × 3.2.
  expect(isWidePane(96, 30)).toBe(false)
  expect(isWidePane(97, 30)).toBe(true)
  expect(isWidePane(128, 40)).toBe(false)
  expect(isWidePane(129, 40)).toBe(true)
  expect(isWidePane(192, 60)).toBe(false)
  expect(isWidePane(193, 60)).toBe(true)
})

test('a pane follows every size it is given, back and forth, with nothing held over', async $ => {
  const ui = await $.ui.mount(pane(60, 60))
  const seen: string[] = []
  for (const [columns, rows] of [[60, 60], [140, 20], [60, 60], [140, 60], [140, 20], [97, 30], [96, 30], [97, 30], [100, 40]] as const) {
    await ui.redraw({ ...pane(columns, rows).props })
    seen.push(shapeOf(await ui.find({ type: 'Svg' })))
  }
  expect(seen).toEqual(['tall', 'wide', 'tall', 'tall', 'wide', 'wide', 'tall', 'wide', 'tall'])
  await ui.unmount()
})

test('what the board holds does not move the switch point', async ($, on) => {
  // A board with many lanes draws far taller; the choice is the pane's size alone.
  const lanes = Array.from({ length: 8 }, (_, at) => ({ name: `Lane ${at}`, branches: at, isHere: at === 2 }))
  on('state.get', () => ({
    value: {
      version: 1,
      value: {
        shape: 'board-1',
        value: { counts: {}, live: {}, rows: [], edited: [], calls: 0, isWorking: false, repo: { kind: 'repo', branch: 'site/landing', ahead: 1, behind: 0, dirty: 0, lanes } },
      },
    },
  }))
  for (const [columns, rows] of [[96, 30], [97, 30], [140, 20], [60, 60]] as const) {
    const ui = await $.ui.mount(pane(columns, rows))
    expect(shapeOf(await ui.find({ type: 'Svg' }))).toBe(isWidePane(columns, rows) ? 'wide' : 'tall')
    await ui.unmount()
  }
})
