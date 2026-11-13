import { expect, test } from 'claude-code/testing'

import { FIXTURES } from '../tools/fixtures'
import { layoutProblems } from '../tools/layout'
import { drawBoard } from './draw'

// Faults the drawing is known to have, seen in the render harness's pictures
// and left to the Board track. They do not fail the tests; anything new does.
// Add a line only with a reason, and remove it once the drawing no longer has it.
// The seven faults found in 0.7.0 were fixed with the lane cards.
const KNOWN: Record<string, string[]> = {}

for (const f of FIXTURES) {
  for (const isWide of [false, true]) {
    const name = `${f.id}_${isWide ? 'wide' : 'tall'}`
    test(`layout: ${f.title}, ${isWide ? 'wide' : 'tall'}: no text overlaps, crosses a wire or leaves the board`, () => {
      const found = layoutProblems(drawBoard(f.board, isWide, f.names, f.now))
      const known = KNOWN[name] ?? []
      expect(found.filter(p => !known.includes(p))).toEqual([])
    })
  }
}

test('the layout check sees the faults it is for', () => {
  const svg = (body: string): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">${body}</svg>`
  const t = (x: number, y: number, text: string, extra = ''): string => `<text x="${x}" y="${y}" font-size="11"${extra}>${text}</text>`
  // Clear.
  expect(layoutProblems(svg(t(10, 20, 'Website') + t(10, 40, 'App') + '<path d="M100 0V100" fill="none" stroke="#fff"/>'))).toEqual([])
  // Two texts on one line.
  expect(layoutProblems(svg(t(10, 20, 'Website') + t(40, 20, 'App')))).toHaveLength(1)
  // A numbered entity is one letter wide, not six.
  expect(layoutProblems(svg(t(10, 20, 'a&#160;b') + t(40, 20, 'App')))).toEqual([])
  // A wire through a word, and the same word with a halo breaking the wire.
  expect(layoutProblems(svg(t(90, 50, 'Website') + '<path d="M100 0V100" fill="none" stroke="#fff"/>'))).toHaveLength(1)
  expect(layoutProblems(svg(t(90, 50, 'Website', ' fill="none" stroke="#000"') + t(90, 50, 'Website') + '<path d="M100 0V100" fill="none" stroke="#fff"/>'))).toEqual([])
  // Off the right edge, measured from where an end-anchored text starts.
  expect(layoutProblems(svg(t(170, 50, 'Website')))).toHaveLength(1)
  expect(layoutProblems(svg(t(190, 50, 'Website', ' text-anchor="end"')))).toEqual([])
  // Out through the side of a box.
  expect(layoutProblems(svg('<rect x="10" y="30" width="40" height="28"/>' + t(18, 48, 'Website and more')))).toHaveLength(1)
  expect(layoutProblems(svg('<rect x="10" y="30" width="80" height="28"/>' + t(18, 48, 'Website')))).toEqual([])
})
