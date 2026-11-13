# Signalbox

A live circuit board beside your Claude Code chat. Claude sits in the middle as a chip, its tools are pins around it, and the work that changes your repository is wired into a release track. You can see at a glance what Claude is doing and where that work is heading.

A signal box is the room beside a railway that shows where every train is on the tracks. This is that, for a coding session.

Signalbox is a mod for Claude Code (a plugin that adds a pane). It runs locally.

## What it shows

- **Claude, in the middle.** The model in use, what it is doing right now, and how full the context window is.
- **Ten stations as pins.** You, Skills, Hooks, Memory, Model, Agents, Browser, Network, Files and Shell. A station's wire shows a moving dash while a call is running and stays lit, with a count, once it has been used since your last message.
- **Files and Shell feed the branch.** These are the two stations that change a repository. Their wires merge into a tag that counts the files edited since your last message, and run on into the release track.
- **A release track, read from git.** Three stops: **Working** (files changed but not committed), **your branch** (commits the trunk does not have, with a copper dot when some are not pushed), and **the trunk** (main, master or whatever your remote calls its default, with how far behind you are). A stop lights up when there is work sitting at it.
- **A short feed.** The last four actions, under the board.

## Two layouts, chosen for you

The pane reads its own width and height and picks a layout:

- **Tall**, for a narrow or full-height pane: the flow runs top to bottom.
- **Wide**, for a short and broad pane, such as one stacked above a browser preview: the flow runs left to right.

It switches as you drag the pane's edges. The board has a fixed maximum size, so it does not balloon in a large pane. The parts that matter most are at the top, so a pane that is cut short loses the feed first.

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

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `trunkBranch` | empty | The branch your work is measured against, such as `main`, `master` or `develop`. Left empty, Signalbox asks the remote which branch is its default and falls back to `main` or `master`. |

## What it reads, and what it does not

Signalbox listens to the session's own events: when a turn starts and ends, when the model takes a step, and when a tool is called. From a tool call it keeps the tool's name and a few words for the feed (a file's name, a command's description). It keeps this in the session's state and nowhere else.

For the release track it runs `git` in the session's own folder, read-only: `git status`, `git for-each-ref` or `git symbolic-ref`, and `git rev-list --count`. Nothing is written, nothing is fetched from a remote, and a repository that does not answer within five seconds is left alone. The read happens when a session starts, after a turn, after a call that touched files or the shell, and otherwise every twenty seconds.

It makes no network requests of its own, reads no files, and calls no model. It never changes or blocks a tool call: every event is passed on untouched.

## Roadmap

- **Deploy stages.** Stops for staging and production, where a project has a source for them, with names of its own.
- **More views.** A tracks view and a spine view of all open branches, switchable under the board.

## Status

Version 0.2.0, an early release. Built and tried on Claude Code 2.1.321 in the desktop app on Windows. Other surfaces are covered by the mod's tests but have not been tried by hand. The test engine serves no processes, so the git reading is covered by its failing case alone and was checked by hand in a real repository.

## Development

```
claude plugin validate .
claude plugin test .
```

## Credits

Inspired by [lot-map](https://github.com/alexeyw/lot-map) by Aleksei Volodin, a live map of what Claude Code is doing. Signalbox takes the same idea in a different direction: a board that also shows where the work goes.

## Licence

MIT. See [LICENSE](LICENSE).
