# Tools

## Render harness

Draws the board from fixture data straight from `hooks/draw.ts` (`drawBoard`), tall and wide, so a drawing change can be looked at before it ships.

```bash
node tools/render.ts
```

Node 24 or later, nothing to install and no build step. It writes to `tools/out/` (ignored by git):

- `index.html`: every fixture in a row, tall beside wide, with the layout check's findings under each board. Open it in a browser.
- `svg/<fixture>_<tall|wide>.svg`: the boards exactly as `drawBoard` returns them.
- `png/<fixture>_<tall|wide>.png`: the same boards drawn at 2x, for reading in a chat or attaching to a report.

Options:

| Option | Effect |
| --- | --- |
| `tools/render.ts <folder>` | Write somewhere else, such as a session's scratchpad. |
| `--only lane-none,idle` | Draw only these fixtures. |
| `--no-png` | Skip the PNGs (they take about ten seconds). |
| `--strict` | Exit with 1 if the layout check finds anything. |

### PNGs

The PNGs come from a Chrome or Edge already on the machine, run headless with `--screenshot`, four at a time and each with its own throwaway profile in `tools/out/.shots`. That needs nothing installed: Edge is on every Windows machine, and Puppeteer or Playwright would mean downloading a browser of their own. Set `SIGNALBOX_BROWSER` to a browser's path to choose one. With no browser found, the harness still writes the SVGs and the page and says so.

The text is drawn in the fonts installed here, as the real board is: Inter and JetBrains Mono where they are installed, Segoe UI and Consolas where they are not. The page loads no web fonts.

### How it runs `draw.ts` unchanged

`render.ts` registers a Node resolve hook so the hooks' extensionless imports (`./lanes`, `../types`) find their `.ts` files, then imports `hooks/draw.ts` as it is. It uses only `drawBoard(board, isWide, names, now)` and the `Board` type, so a new drawing works without changes here, as long as that signature stays.

## Fixtures

`fixtures.ts` holds the boards that have broken before. Each is plain `Board` data with the stage names and a fixed clock:

| Fixture | Case |
| --- | --- |
| `lanes-by-name` | Four Silkscreen-like lanes, yours lit by its name, a Files call running |
| `lanes-by-files` | The same, yours lit from its files |
| `lane-none` | No lane in files |
| `lane-tied` | Lanes tied in files |
| `long-branch-lanes` | `claude/vigorous-khayyam-da3b47`, with lanes |
| `long-branch-track` | The same name on the single track, 12 behind |
| `wide-letters` | A branch of `M`s and `W`s, with lanes |
| `parked-lane` | Parked lanes with a long name and a wide one |
| `no-lanes-staging` | No lanes, with a staging stop and long stage names |
| `no-lanes-plain` | No lanes, no staging stop |
| `on-trunk` | On the trunk, clean |
| `reading` | Reading the repository |
| `no-repo` | No repository |
| `no-repo-why` | Git refused, with a long reason |
| `git-blocked` | Git could not run |
| `files-running` | A long running Files label, 140 Files calls, 128 tool calls |
| `idle` | Idle, with no model or context known |

Add a case by adding to `FIXTURES`: the harness and the tests pick it up.

## Layout check

`layout.ts` reads a drawn SVG back and reports text that:

- overlaps other text;
- crosses a wire (a stroked, unfilled path outside the icons), unless the text carries a halo, the canvas-coloured outline that breaks a line behind it on purpose;
- straddles the edge of a box or circle rather than sitting wholly inside or outside it;
- runs off the board.

`hooks/layout.test.tsx` runs it over every fixture, tall and wide, in `claude plugin test .`, with a small test of the check itself.

**How far to trust it.** Text widths are estimates from the same letter table `draw.ts` uses to cut branch names, with mono at 0.6em, and 1 px of overlap is allowed. It found every fault visible in the pictures when it was written and nothing that was not there, but a line within a few pixels of something can pass here and still touch on screen, especially in Segoe UI. Nothing here replaces looking at the PNGs.

**Known faults.** The drawing in 0.7.0 has faults the check finds. They are listed in `KNOWN` in `hooks/layout.test.tsx`, so the tests pass on them and fail on anything new. Take a line out once the drawing is fixed.

It does not check colours, whether a word was cut too short to read, what a wire means, or anything drawn as a shape other than text.
