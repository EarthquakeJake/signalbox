# Signalbox

A live circuit board beside your Claude Code chat. Claude sits in the middle as a chip, its tools are pins around it, and the work that changes your repository is wired into a release track. You can see at a glance what Claude is doing and where that work is heading.

A signal box is the room beside a railway that shows where every train is on the tracks. This is that, for a coding session.

Signalbox is a mod for Claude Code (a plugin that adds a pane). It runs locally.

## What it shows

- **Claude, in the middle.** The model in use, what it is doing right now, and how full the context window is.
- **Ten stations as pins.** You, Skills, Hooks, Memory, Model, Agents, Browser, Network, Files and Shell. A station's wire shows a moving dash while a call is running and stays lit, with a count, once it has been used since your last message.
- **Files and Shell feed the branch.** These are the two stations that change a repository. Their wires merge into a tag that counts the files edited since your last message, and run on into the release track.
- **A release track, read from git.** Three stops, and what they are depends on your project.

  Without a staging folder set: **Working** (files changed but not committed), **your branch** (commits the trunk does not have, with a copper dot when some are not pushed) and **the trunk** (main, master or whatever your remote calls its default, with how far behind you are).

  With `stagingPath` set: **your branch**, **staging** (when that folder was last touched on the trunk, and how many commits the trunk has taken since) and **live** (the newest tag on the trunk). The caption carries the subject of the commit that last updated staging.

  A stop lights up when there is work of yours sitting at it.

- **Or one lane per deployable part**, where the project declares them in a track file. Each lane is one row: its name, its open branches, its staging and what is live on it, all hung off one bus. The lane you are working in is the lit one, and where a lane's staging is a branch, it says whether the branch you are on has reached it yet.
- **A short feed.** The last four actions, under the board.

## Two layouts, chosen for you

The pane reads its own width and height and picks a layout:

- **Tall**, for a narrow or full-height pane: the flow runs top to bottom.
- **Wide**, for a short and broad pane, such as one stacked above a browser preview: the flow runs left to right.

It switches as you drag the pane's edges. The drawing is sized to fit the pane both ways, between 0.6 and 1.5 times its own size, so it neither balloons in a large pane nor runs off the bottom of a short one. The parts that matter most are at the top, so a pane that is cut short loses the feed first.

In a terminal there is no drawing surface for the board; the pane shows the feed alone.

## Install

At the prompt of a terminal session:

```
/plugin install signalbox --marketplace EarthquakeJake/signalbox
```

Answer `y` to add the marketplace, then choose a scope (the user scope loads it in every session).

From a shell:

```
claude plugin install signalbox --marketplace EarthquakeJake/signalbox
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `EarthquakeJake/signalbox`, then **Add plugin**.

Start a new session afterwards. The pane opens by itself; `/signalbox` opens it again if you closed it.

## Two views

- **The board** (`/signalbox board`, the default): Claude, its tools, and the lanes.
- **The spine** (`/signalbox spine`): the trunk drawn as a spine, newest at the top, with each open branch joined to it where it forked, far-behind branches dashed in red, your branch and your lane's staging beside it, and the releases below.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `stagingName` | `Staging` | The name of the middle stop, such as Staging, UAT or Preview. |
| `stagingBranch` | empty | A branch that is your staging, such as `uat/site`. Tried as given and as `origin/<name>`, and preferred over the folder below. |
| `stagingPath` | empty | A folder on the trunk whose newest commit means staging was updated, such as `public/uat`. Left empty, and with no staging branch, the track shows what is uncommitted instead of a staging stop. |
| `liveName` | `Live` | The name of the last stop, such as Live or Production. |
| `trunkBranch` | empty | The branch your work is measured against, such as `main`, `master` or `develop`. Left empty, Signalbox asks the remote which branch is its default and falls back to `main` or `master`. |

A project whose staging is a published folder rather than a branch is the case `stagingPath` is for: the newest commit touching that folder is taken as the moment staging was last updated.

## The track file

A project with more than one deployable part declares its lanes in `signalbox.tracks.json`, or in a `tracks.json`, at the root of the repository. Up to four lanes are drawn, and the file replaces the single track above.

```json
{
  "tracks": [
    {
      "id": "app",
      "name": "App",
      "branch": "app/",
      "uat": { "branch": "uat/app" },
      "tag": "app-v"
    },
    {
      "id": "site",
      "name": "Site",
      "branches": ["site/*", "feature/site-*"],
      "staging": { "path": "public/uat/site" },
      "live": { "tagPrefix": "site-" }
    },
    { "id": "cloud", "name": "Cloud", "branch": "cloud/", "parked": true }
  ]
}
```

Both spellings above are read, so a file written for something else often works as it is:

| What a lane may say | Meaning |
| --- | --- |
| `name`, or `id` | What the lane is called. |
| `branch` (a prefix) or `branches` (patterns, where `*` stands for anything) | Which open branches belong to this lane. |
| `paths` (globs, where `**` spans folders and `*` stays inside one) | The files this lane owns. Used only to place a branch whose name claims no lane. |
| `uat.branch` or `staging.branch` | A branch that is this lane's staging; `origin/` is tried too. |
| `staging.path` | A folder on the trunk whose newest commit means staging moved. |
| `tag` or `live.tagPrefix` | The start of this lane's release tags, so the newest one can be shown. |
| `parked` | Draws the lane set back, as one not in play. |

Everything else in the file is ignored. All four settings above are ignored once a track file is found: the file decides.

Where a branch's name matches no lane's pattern — the branches the desktop app names for you, say — Signalbox asks git which files that branch changed since it left the trunk and places it in the lane owning most of them. Every such branch counts towards its lane, up to twelve of them, so a lane's number covers branches of any name. A branch already merged into the trunk is not counted. The branch you are on lights its lane with `lane from files` beside the branch name, so you know it was worked out rather than declared. When it cannot be worked out, the caption says so instead of going quiet: `no lane in files` when none of the changed files belongs to a lane, and `lanes tied in files` when two lanes own the same number, since a coin flip is not shown as an answer. Each branch costs one diff, kept until the branch or the trunk moves, and it all needs `paths` on the lanes. Where a lane has an `id` and a tag `uat-passed/<id>` sits on the very commit its staging stands at, the lane is marked as having passed its checks.

## What it reads, and what it does not

Signalbox listens to the session's own events: when a turn starts and ends, when the model takes a step, and when a tool is called. From a tool call it keeps the tool's name and a few words for the feed (a file's name, a command's description). It keeps this in the session's state and nowhere else.

For the release track it runs `git` in the session's own folder, read-only: `git status`, `git for-each-ref` or `git symbolic-ref`, `git rev-list --count`, and, where a staging folder is set, `git log -1` on that folder and `git describe --tags`; with a track file, also `git tag --list`, `git merge-base --is-ancestor` and `git diff --name-only` against the trunk for branches placed by their files. Nothing is written, nothing is fetched from a remote, and a repository that does not answer within five seconds is left alone. The read happens when a session starts, after a turn, after a call that touched files or the shell, and otherwise every twenty seconds. It asks the session where it is running each time, so a session given its folder after it starts, or moved by `/cd` or into a worktree, still reads the right repository.

Where git will not answer, the board says so in git's own words rather than claiming the folder holds no repository, and on a host where no command may run at all it reads `.git/HEAD` for the branch name.

It makes no network requests of its own, and calls no model. It never changes or blocks a tool call: every event is passed on untouched.

## Roadmap

- **Real deploy status.** What a stage is actually serving, where a project has a source for that, rather than inferring it from commits.
- **A view switch.** Tracks, a branch history and a board, switchable under the board.
- **More views.** A tracks view and a spine view of all open branches, switchable under the board.

## Status

Version 0.14.2, an early release. Both layouts have been rendered and looked at, with lanes and without. Built and tried on Claude Code 2.1.321 in the desktop app on Windows. Other surfaces are covered by the mod's tests but have not been tried by hand. The test engine serves no processes, so the git reading is covered by its failing case alone and was checked by hand in a real repository.

## Development

```
claude plugin validate .
claude plugin test .
```

## Credits

Inspired by [lot-map](https://github.com/alexeyw/lot-map) by Aleksei Volodin, a live map of what Claude Code is doing. Signalbox takes the same idea in a different direction: a board that also shows where the work goes.

## Licence

MIT. See [LICENSE](LICENSE).
