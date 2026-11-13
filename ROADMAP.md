# Roadmap

The design reference is the **Refined board** page of the Release map canvas: https://claude.ai/artifact/8iqAwTLBDhhLqtmaN3ENDJ. Its spec and working prototype (`refined.ts`) are in Jake's shared notes folder under `refined-board/`.

## Now

| Track | Work | Branch |
| --- | --- | --- |
| Design | Spine options on the canvas (2–3, from real Silkscreen data): calmer and more colourful, more room for the Claude ring, a minimal legend, no scale sentence. Jake picks one. | canvas |
| Data | `OpenBranch.subject` (each branch's newest commit subject, as its description), `Lane.isStagingLive` (staging holds exactly what is live), and lane counts checked against Silkscreen's local branches. | `data/descriptions` |
| Quality | Both views fit the pane: as large as it allows, never larger, never running off the bottom. And the redraw for height-only resizes. | `quality/fit-pane` |
| Board | "UAT · same as live" instead of commit counts; every lane's live release on the spine when on the trunk; branch descriptions on cards and the spine. Then the spine option Jake picks. | `board/descriptions` |

## Next

- **Edge states to the refined design** (spec section 10): reading, no repository, git blocked, no lane in files. Board.
- **The width table.** Measure Inter and JetBrains Mono now that they are installed, and fit text by measured widths. Board, with Quality.

## Later

- **Conflict signals** (next after this round; Jake calls it the core of Signalbox): red when two branches or chats would change the same files and collide (`git merge-tree`, no checkout), amber when they share a lane but not files.
- **Lane check per turn:** the edit tag names its lane, and warns when one turn touches two lanes or a branch's prefix doesn't match its files.
- **Release train:** a train from trunk to live while a deploy runs, with an estimate from recent runs, and a "needs you" stop when UAT holds unreleased work. Needs `gh`, so opt-in.
- **Fetch on a timer**, opt-in, so teammates' pushed work shows.
- **Needs-Jake counts** per lane, and waiting feedback per lane from the Intake mailbox.
- **Leftover dev servers** per worktree (PID, port).
- To check first: each chat's state (working, idle, waiting on Jake) may be out of a mod's reach; click-to-ask needs real buttons under the picture.
- **Real deploy status.** What a stage is actually serving, where a project has a source for that, rather than inferring it from commits. Data.
- **Counting every branch.** Today at most twelve unnamed branches are placed by their files. Data.

## Done

- 0.12.0: option A from "Board, slimmer": tighter lane cards (726 to 666 px on Silkscreen) and each tool station's icon in its own colour, on the board and the spine.
- 0.11.1: release pills on the spine are never cut, branches in no lane show on it, and tracks named board, data, quality or release get their own icons.
- 0.11.0: option 3, the spine, switched with `/signalbox spine` and `/signalbox board`; the drawing is centred rather than stretched in a broad pane.
- 0.10.0: option 2's lane cards. A colour and icon per lane, its status, live tag as a pill, staging, and its open branches listed with behind and stale pills; the merged count at the foot. Wide lanes carry the same, on one line each. All known drawing faults fixed.
- 0.9.0: the wide release section. Lanes in the right column, the feed drawn inside the wide board, and each lane's open branches and the merged count read from git (not drawn yet).
- 0.8.0: the tall release section. Your lane as three large stops, the other lanes as rows under a hairline, text widths measured, and an in-repo render harness with a layout check.
- 0.7.0: the refined finish (fonts, colours, lines, Claude's box, tag wording) and merged branches left out of lane counts.
- 0.6.x: branches placed by the files they change, with a caption when they cannot be.
- 0.5.x: real git data, lanes from a track file, two layouts chosen by the pane's shape.
