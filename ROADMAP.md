# Roadmap

The design reference is the **Refined board** page of the Release map canvas: https://claude.ai/artifact/8iqAwTLBDhhLqtmaN3ENDJ. Its spec and working prototype (`refined.ts`) are in Jake's shared notes folder under `refined-board/`.

## Now

| Track | Work | Branch |
| --- | --- | --- |
| Quality | The wide layout sticks on height-only resizes: the host does not redraw then. A timed redraw may fix it; waiting on Jake's drag check. | — |
| Board | Option A from the canvas page "Board, slimmer": tighter cards and a colour per station icon. Prototype patches in `board-slimmer/`. | `board/slim-a` |

## Next

- **Edge states to the refined design** (spec section 10): reading, no repository, git blocked, no lane in files. Board.
- **The width table.** Measure Inter and JetBrains Mono now that they are installed, and fit text by measured widths. Board, with Quality.

## Later

- **Real deploy status.** What a stage is actually serving, where a project has a source for that, rather than inferring it from commits. Data.
- **Counting every branch.** Today at most twelve unnamed branches are placed by their files. Data.

## Done

- 0.11.0: option 3, the spine, switched with `/signalbox spine` and `/signalbox board`; the drawing is centred rather than stretched in a broad pane.
- 0.10.0: option 2's lane cards. A colour and icon per lane, its status, live tag as a pill, staging, and its open branches listed with behind and stale pills; the merged count at the foot. Wide lanes carry the same, on one line each. All known drawing faults fixed.
- 0.9.0: the wide release section. Lanes in the right column, the feed drawn inside the wide board, and each lane's open branches and the merged count read from git (not drawn yet).
- 0.8.0: the tall release section. Your lane as three large stops, the other lanes as rows under a hairline, text widths measured, and an in-repo render harness with a layout check.
- 0.7.0: the refined finish (fonts, colours, lines, Claude's box, tag wording) and merged branches left out of lane counts.
- 0.6.x: branches placed by the files they change, with a caption when they cannot be.
- 0.5.x: real git data, lanes from a track file, two layouts chosen by the pane's shape.
