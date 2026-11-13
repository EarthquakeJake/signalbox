# Signalbox: how the team works

Signalbox is a Claude Code mod: a live board beside the chat showing what Claude is doing and where the work is heading. This file is for every Claude session working in this repository.

## Roles

- **Chief (lead developer).** One session, the one Jake talks to about Signalbox. It owns `main`, version numbers, releases, installing, and replies to the Silk Signal chats that report bugs. It starts and briefs the track leads, reviews their branches and merges them.
- **Track leads.** One session per track (see `signalbox.tracks.json`). Each works in its own worktree on a branch named `<track>/<topic>`, such as `board/release-2`, and changes only its own track's files. A lead may fork subagents for parts of its work, but stays responsible for what they hand back.
- **Testers.** Short, read-only sessions started after a release to check it against a real repository, usually Silkscreen.

Track leads never push to `main`, never change the version in `.claude-plugin/plugin.json`, never publish or install the plugin, and never change files in another project. If work needs another track's files, they ask the chief.

## Tracks

| Track | Branch prefix | Owns |
| --- | --- | --- |
| Board | `board/` | `hooks/draw.ts`, `hooks/lanes.ts`, `hooks/spine.ts`: everything drawn |
| Data | `data/` | `hooks/git.ts`, `hooks/tracks.ts`, `hooks/paths.ts`, `hooks/clashes.ts`, `types/`: what is read from git and the track file |
| Quality | `quality/` | tests, `tools/`: render harness and checks |
| Release | `release/` | `hooks/register.tsx`, `hooks/hooks.json`, `.claude-plugin/`, `README.md`: wiring, manifest and docs |

`types/index.d.ts` is shared. Data owns it; a lead that needs a new field asks for it in their hand-back rather than editing it on the side.

## Before handing back a branch

1. `claude plugin test .` and `claude plugin validate .` both pass. The CLI is not on PATH; on this machine it is `C:\Users\Jake\AppData\Roaming\Claude\claude-code\2.1.321\d0e23af87588\claude.exe`.
2. For anything that changes the drawing, render it tall and wide and look at it. A passing test is not a picture.
3. Commits are made with `EarthquakeJake <EarthquakeJake@users.noreply.github.com>`, set for this repository only.
4. Hand back with one short message: branch, what changed, what was checked, and anything not checked.

## Engine rules that have bitten us

- `$` may only be passed to functions declared at the top level of a file, or imported from this module's own files.
- `$.process.run` does not exist in the test engine, so git reading is tested by its failure case, and checked by hand in a real repository.
- `$.session.cwd()` is the folder the session is in now. Do not cache the folder from `session.start`.
- Pane size is `e.props.bodyColumns` and `e.props.scroll.bodyRows`. `e.viewport` describes the whole window and does not follow the pane.
- Write TypeScript with the Write or Edit tools, not shell heredocs: backslashes in regular expressions get mangled.

## Releasing (chief only)

Bump the version in `.claude-plugin/plugin.json` and the README's Status section, commit, tag `v<version>`, push with tags, then `plugin marketplace update signalbox` and `plugin update signalbox@signalbox`. A running chat keeps the version it started with, so testers must be new sessions.

See `ROADMAP.md` for what is being worked on.
