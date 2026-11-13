# Roadmap

The design reference is the **Refined board** page of the Release map canvas: https://claude.ai/artifact/8iqAwTLBDhhLqtmaN3ENDJ. Its spec and working prototype (`refined.ts`) are in Jake's shared notes folder under `refined-board/`.

## Now

| Track | Work | Branch |
| --- | --- | --- |
| Board | Refined design release 2: the tall release section. Your lane is drawn as three large stops (branch, staging, live) with labels underneath, and the other lanes are quiet rows under a hairline. Spec section 7. | `board/release-2` |
| Board | Refined design release 3: the wide release section, with lane rows in the right column, and the feed drawn inside the wide board. Spec sections 8 and 9. Comes after release 2, in the same files. | `board/release-3` |
| Board | **Lane cards, as in option 2** (Jake's priority). Each lane gets its own colour and icon tile, a status line ("Nothing in flight", "3 branches", "No staging yet"), its live tag as a pill, and its open branches listed under it with ahead and behind, and a "behind" or "stale" pill where it applies. A merged-branches summary sits at the foot. This replaces the spec's quiet grey rows. | `board/release-2` |
| Data | Fill in `Lane.id`, `Lane.open` (each open branch's ahead, behind and last-commit time, newest first, at most four) and `Repo.merged`. | `data/lane-branches` |
| Quality | A render harness in the repository: draw the board from fixture data to SVG and PNG, tall and wide, including the edge states, so any change can be looked at before release without borrowing another session's setup. | `quality/render-harness` |

## Next

- **Known drawing faults** (listed in `hooks/layout.test.tsx`): in the wide layout with no lanes, the staging words run into the live tag; on the tall board, a chip reading `99+` runs into its name. Board.
- **Edge states to the refined design** (spec section 10): reading, no repository, git blocked, no lane in files. Board.
- **The width table.** Measure Inter and JetBrains Mono now that they are installed, and fit text by measured widths. Board, with Quality.

## Later

- **Real deploy status.** What a stage is actually serving, where a project has a source for that, rather than inferring it from commits. Data.
- **Option 3, the spine view.** All open branches along the trunk, as on the canvas's FusedSpine. A second view beside the board, switchable under it. Option 1 (the stack) is dropped. Board and Data.
- **Counting every branch.** Today at most twelve unnamed branches are placed by their files. Data.

## Done

- 0.9.0: the wide release section. Lanes in the right column, the feed drawn inside the wide board, and each lane's open branches and the merged count read from git (not drawn yet).
- 0.8.0: the tall release section. Your lane as three large stops, the other lanes as rows under a hairline, text widths measured, and an in-repo render harness with a layout check.
- 0.7.0: the refined finish (fonts, colours, lines, Claude's box, tag wording) and merged branches left out of lane counts.
- 0.6.x: branches placed by the files they change, with a caption when they cannot be.
- 0.5.x: real git data, lanes from a track file, two layouts chosen by the pane's shape.
