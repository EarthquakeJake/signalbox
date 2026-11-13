import { expect, mock, test } from 'claude-code/testing'

import { LEAST, MOST, ROW, fitPicture, sizedPicture } from './register'

const pane = (bodyColumns: number, bodyRows: number) =>
  ({
    plugin: 'signalbox',
    component: 'Pane',
    requestId: 'signalbox',
    surface: 'desktop',
    props: { title: 'Signalbox', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} },
  }) as const

const svgOf = (w: number, h: number): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="5" height="6"/></svg>`

/** The Svg element's own fields, and its markup's size and viewBox. */
const drawn = (node: unknown): { hasWidth: boolean; width: number; height: number; w: number; h: number } => {
  const json = JSON.stringify(node)
  const box = /viewBox=\\"0 0 ([\d.]+) ([\d.]+)\\" width=\\"(\d+)\\" height=\\"(\d+)/.exec(json)
  return {
    hasWidth: /"width":\d/.test(json),
    w: Number(box?.[1] ?? NaN),
    h: Number(box?.[2] ?? NaN),
    width: Number(box?.[3] ?? NaN),
    height: Number(box?.[4] ?? NaN),
  }
}

test('a drawing asks for the height its rows hold, its shape kept, growing smoothly between the floor and the ceiling', () => {
  for (const [w, h] of [[440, 420], [440, 1156], [900, 284], [440, 200]] as const) {
    let last = 0
    for (let rows = 1; rows <= 120; rows += 1) {
      const fit = fitPicture(svgOf(w, h), rows)
      // Shape kept, to a pixel.
      expect(Math.abs(fit.height - (h * fit.width) / w)).toBeLessThan(1.5)
      // Inside the rows whenever the floor allows it.
      if (fit.width > Math.round(w * LEAST)) expect(fit.height).toBeLessThanOrEqual(rows * ROW + 0.5)
      expect(fit.width).toBeGreaterThanOrEqual(Math.round(w * LEAST))
      expect(fit.width).toBeLessThanOrEqual(Math.round(w * MOST))
      // One row more never shrinks it, nor grows it by more than a row's worth.
      expect(fit.height).toBeGreaterThanOrEqual(last)
      expect(fit.height - last).toBeLessThanOrEqual(last === 0 ? Infinity : ROW + 1)
      last = fit.height
    }
  }
})

test('the cases Jake saw: no ballooning, a tall board is not cut off, a small one grows', () => {
  // A board 1156 tall in 50 rows is held to 50 rows.
  expect(fitPicture(svgOf(440, 1156), 50).height).toBeLessThanOrEqual(50 * ROW)
  // A small spine with room to spare grows to the ceiling, never past it.
  expect(fitPicture(svgOf(440, 200), 60).width).toBe(Math.round(440 * MOST))
  // Too few rows stops at the floor, and the pane scrolls.
  expect(fitPicture(svgOf(900, 284), 5).width).toBe(Math.round(900 * LEAST))
})

test('only the svg tag is resized; the drawing inside is untouched', () => {
  const out = sizedPicture(svgOf(440, 420), 20)
  expect(out).toContain(`viewBox="0 0 440 420" width="${fitPicture(svgOf(440, 420), 20).width}" height="${fitPicture(svgOf(440, 420), 20).height}"`)
  expect(out).toContain('<rect width="5" height="6"/>')
})

test('the pane leaves the width to the host and sizes the height, keeping the feed rows whole', async $ => {
  for (const [columns, rows] of [[60, 60], [70, 40], [140, 20], [200, 30], [100, 80]] as const) {
    const ui = await $.ui.mount(pane(columns, rows))
    const d = drawn(await ui.find({ type: 'Svg' }))
    // No width or height prop: the host fits the markup's own size to the slot.
    expect(d.hasWidth).toBe(false)
    const rowsLeft = d.w > 600 ? rows : rows - 5
    expect(d).toMatchObject(fitPicture(svgOf(d.w, d.h), rowsLeft))
    await ui.unmount()
  }
})

test('while the pane shows it is drawn again every second, with nothing else asking', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  on('command.register', () => ({ value: { command: 'signalbox' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.cwd', () => ({ value: '' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // A staging stop says how long ago it moved, so a redraw shows as new words.
  // Nothing else writes the board here (no folder to read), so only the tick can redraw it.
  on('state.get', () => ({
    value: {
      version: 1,
      value: {
        shape: 'board-1',
        value: {
          counts: {}, live: {}, rows: [], edited: [], calls: 0, isWorking: false,
          repo: { kind: 'repo', branch: 'site/landing', trunk: 'origin/main', ahead: 1, behind: 0, dirty: 0, staging: { updatedAt: 1000, subject: 'UAT', behind: 0 } },
        },
      },
    },
  }))
  const words = async (ui: { find: (q: { type: 'Svg' }) => Promise<unknown> }): Promise<string> => {
    const m = /Staging · ([^<\\]+)/.exec(JSON.stringify(await ui.find({ type: 'Svg' })))
    return m?.[1] ?? 'none'
  }

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount(pane(60, 60))
  expect(await words(ui)).toBe('just now')
  // A minute on, the ticks have drawn the pane again without anything else asking.
  await clock.advance(61000)
  expect(await words(ui)).toBe('1m ago')
  await ui.unmount()
})
