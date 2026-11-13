import { expect, mock, test } from 'claude-code/testing'

import { CELL, LEAST, MOST, fitPicture } from './register'

const pane = (bodyColumns: number, bodyRows: number) =>
  ({
    plugin: 'signalbox',
    component: 'Pane',
    requestId: 'signalbox',
    surface: 'desktop',
    props: { title: 'Signalbox', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} },
  }) as const

const svgOf = (w: number, h: number): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"></svg>`

/** The Svg element's own fields, out of what `find` answers. */
const drawn = (node: unknown): { width: number; height: number; w: number; h: number } => {
  const json = JSON.stringify(node)
  const box = /viewBox=\\"0 0 ([\d.]+) ([\d.]+)/.exec(json)
  return {
    width: Number(/"width":(\d+)/.exec(json)?.[1] ?? NaN),
    height: Number(/"height":(\d+)/.exec(json)?.[1] ?? NaN),
    w: Number(box?.[1] ?? NaN),
    h: Number(box?.[2] ?? NaN),
  }
}

test('a drawing fits the room both ways, its shape kept, between the floor and the ceiling', () => {
  const sizes: Array<[number, number]> = [
    [40, 20], [60, 30], [60, 60], [60, 120], [80, 40], [100, 25], [120, 30], [140, 20], [160, 50], [200, 60], [300, 100],
  ]
  for (const [w, h] of [[440, 420], [440, 1156], [900, 284], [440, 200]] as const) {
    for (const [columns, rows] of sizes) {
      const fit = fitPicture(svgOf(w, h), columns, rows)
      const scale = fit.width / w
      // Shape kept, to the pixel.
      expect(Math.abs(fit.height - h * scale)).toBeLessThan(1.5)
      // Never past the ceiling nor under the floor.
      expect(scale).toBeLessThanOrEqual(MOST)
      expect(scale).toBeGreaterThanOrEqual(LEAST - 0.01)
      // Inside the room whenever the floor allows it, and touching it on one side unless at the ceiling.
      const roomW = columns * CELL.w
      const roomH = rows * CELL.h
      if (scale > LEAST) {
        expect(fit.width).toBeLessThanOrEqual(roomW)
        expect(fit.height).toBeLessThanOrEqual(roomH)
      }
      if (scale > LEAST && scale < MOST - 0.01) expect(Math.max(fit.width / roomW, fit.height / roomH)).toBeGreaterThan(0.98)
    }
  }
})

test('the cases Jake saw: a broad pane does not balloon, a tall board is not cut off, a small one grows', () => {
  // Broad and short: limited by height, not stretched to the width.
  const broad = fitPicture(svgOf(440, 420), 200, 30)
  expect(broad.height).toBeLessThanOrEqual(30 * CELL.h)
  expect(broad.width).toBeLessThan(200 * CELL.w / 2)
  // A board 1156 tall in a 60 by 50 pane is shrunk to the pane's height.
  const tall = fitPicture(svgOf(440, 1156), 60, 50)
  expect(tall.height).toBeLessThanOrEqual(50 * CELL.h)
  // A small spine in a roomy pane grows, up to the ceiling.
  expect(fitPicture(svgOf(440, 200), 120, 60).width).toBe(Math.floor(440 * MOST))
  // A tiny pane stops at the floor and scrolls rather than drawing unreadable text.
  expect(fitPicture(svgOf(900, 284), 20, 5).width).toBe(Math.floor(900 * LEAST))
})

test('the pane passes a fitted size, leaving room for the feed under the tall board', async $ => {
  for (const [columns, rows] of [[60, 60], [70, 40], [140, 20], [200, 30], [100, 80]] as const) {
    const ui = await $.ui.mount(pane(columns, rows))
    const d = drawn(await ui.find({ type: 'Svg' }))
    expect(Math.abs(d.height - (d.h * d.width) / d.w)).toBeLessThan(1.5)
    expect(d.width).toBeLessThanOrEqual(Math.max(columns * CELL.w, Math.floor(d.w * LEAST)))
    // The tall board has its feed under it: "Nothing yet." and the gap take two rows.
    const rowsLeft = d.w > 600 ? rows : rows - 2
    if (d.width > Math.floor(d.w * LEAST)) expect(d.height).toBeLessThanOrEqual(rowsLeft * CELL.h)
    await ui.unmount()
  }
})

test('while the pane shows it is drawn again every two seconds, with nothing else asking',async ($, on) => {
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
  // Two minutes on, in two-second ticks, the pane has been drawn again without anything else asking.
  for (let at = 0; at < 60; at += 1) await clock.advance(2000)
  expect(await words(ui)).toBe('2m ago')
  await ui.unmount()
})
