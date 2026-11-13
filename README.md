# Signalbox

A live circuit board beside your Claude Code chat. Claude sits in the middle as a chip, its tools are pins around it, and the work that changes your repository is wired into a release track. You can see at a glance what Claude is doing and where that work is heading.

A signal box is the room beside a railway that shows where every train is on the tracks. This is that, for a coding session.

Signalbox is a mod for Claude Code (a plugin that adds a pane). It runs locally.

## What it shows

- **Claude, in the middle.** The model in use, what it is doing right now, and how full the context window is.
- **Ten stations as pins.** You, Skills, Hooks, Memory, Model, Agents, Browser, Network, Files and Shell. A station's wire shows a moving dash while a call is running and stays lit, with a count, once it has been used since your last message.
- **Files and Shell feed the branch.** These are the two stations that change a repository. Their wires merge into a tag that counts the files edited since your last message, and run on into the release track.
- **A release track.** Your branch, a middle stage and a last stage. In this version the track is a placeholder: it is drawn, and the stage names are yours to set, but it does not read branch or deploy data yet (see Roadmap).
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
| `stagingName` | `Staging` | The name of the middle stop of the release track, such as Staging, UAT or Preview. |
| `liveName` | `Live` | The name of the last stop, such as Live or Production. |

## What it reads, and what it does not

Signalbox listens to the session's own events: when a turn starts and ends, when the model takes a step, and when a tool is called. From a tool call it keeps the tool's name and a few words for the feed (a file's name, a command's description). It keeps this in the session's state and nowhere else.

In this version it makes no network requests, reads no files, runs no processes and calls no model. It never changes or blocks a tool call: every event is passed on untouched.

## Roadmap

- **Branch data.** Read the current branch, how far it is ahead of and behind the main branch, and what is uncommitted, and show them on the release track.
- **Stage status.** Show what is on the middle and last stages, where a project has a source for that.
- **More views.** A tracks view and a spine view of all open branches, switchable under the board.

Reading branch data means running `git` in the project folder. When that arrives it will be stated here.

## Status

Version 0.1.0, an early release. Built and tried on Claude Code 2.1.321 in the desktop app on Windows. Other surfaces are covered by the mod's tests but have not been tried by hand.

## Development

```
claude plugin validate .
claude plugin test .
```

## Credits

Inspired by [lot-map](https://github.com/alexeyw/lot-map) by Aleksei Volodin, a live map of what Claude Code is doing. Signalbox takes the same idea in a different direction: a board that also shows where the work goes.

## Licence

MIT. See [LICENSE](LICENSE).
