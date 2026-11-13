# Idea: decisions on the rail

Status: idea, not planned. Written 13 November 2026 from Jake's use of Signalbox alongside Silkscreen's change review. For review before any building.

## The problem

Jake runs Silkscreen with one orchestrating agent (Silkscreen Nexus) and a set of leads (App, Website, Platform, Intake, Janitor), each with its own work chats in their own worktrees. The work goes fast; the decisions do not. Leads keep stopping to ask for approval, and the questions arrive scattered across chats: merge this, release that, mock-up first, drop this idea. It is easy to lose track of what is waiting on him, why, and what each answer would set off.

Nexus answered that with a **change review**: one side panel listing every decision waiting on Jake, each in plain words (what the change is, why, today against after), with its lead and a link to the chat, and four answers: **Go**, **Mock-up first**, **Later**, **No**, plus a note. It works well.

Signalbox, meanwhile, shows the **rails**: lanes, branches, staging, live, conflicts, what Claude is doing. It shows where work is, but not what is held up waiting on a human, and the change review shows what is waiting, but not where it sits on the rails or how risky it is.

In a real signal box the signalman's job is the decisions; the track diagram exists so they are made well. Signalbox has the diagram and no levers. The change review has levers and no diagram.

## The idea

Keep the two tools separate, and give them one shared list of decisions.

### 1. Decisions drawn as signals on the track

Every pending decision appears where it holds work up, as a signal:

- a red signal on a branch waiting for "go" to merge;
- an amber signal on a lane whose staging waits for "release it";
- a signal before a lane's first stop for an idea waiting on "mock-up first".

A glance at the board then shows where things are stuck on Jake, without reading a list. Cleared decisions turn green briefly, then disappear.

### 2. The feature lifecycle as stations along the rail

A feature moves through stations:

**idea → mock-up → approved → building (branch) → staging / UAT → live**

The change review's four answers are the signals between these stations: Go moves a feature on, Mock-up first sends it to the mock-up station, Later parks it, No takes it off the line. The spine could show features before they have a branch, as proposed stops in their lane, so the board covers what is coming and not only what is in flight.

### 3. Evidence attached to each decision

When a lead asks "can I merge A4?", the decision card carries what Signalbox already knows about that branch:

> no conflicts · 2 behind main · UAT passed · shares public/app/index.html with 3 branches

Jake decides with the risk in front of him, without opening the lead's chat to ask. A decision with a red conflict signal on its branch says so on the card, and **Go** is not the obvious answer.

### 4. One line for what is waiting

At the top of the board:

> 3 decisions waiting · 2 App · 1 Housekeeping

in red when a lead is blocked on Jake (it has stopped and cannot continue), in amber when decisions wait but nothing is stopped. This is the "losing oversight" problem in one line.

### 5. Who is asking

Each decision shows its lead and work chat, and links to it. The join is the worktree: each work chat has its own worktree, so worktree → branch → session ties a decision to the chat that raised it and the branch it concerns.

## How it could be built

**Two tools, one shared list.** The change review stays where Jake decides: it is an artifact with real buttons, so it can take clicks, notes and history in ways the Signalbox pane (one drawn picture) cannot. Signalbox reads the same list and draws it on the rails.

**The shared list: a small decisions file in the repository**, written by the orchestrator (Nexus), read by Signalbox, for example `.signalbox/decisions.json`:

```json
{
  "decisions": [
    {
      "id": "A4-build",
      "title": "Copilot imports: a small \"not in your text\" hint",
      "lane": "app",
      "branch": "app/a4-hint",
      "station": "approved",
      "asks": "merge",
      "lead": "App lead",
      "session": "local_…",
      "since": "2026-11-13T17:40:00Z",
      "isBlocking": true,
      "answer": null
    }
  ]
}
```

- `station`: where the feature stands on the lifecycle.
- `asks`: what kind of decision is waiting (`build`, `mock-up`, `merge`, `release`, `drop`).
- `isBlocking`: the lead has stopped and is waiting.
- `answer`: written back when Jake decides (`go`, `mock-up`, `later`, `no`), with the time.

Signalbox only reads it, and never writes. If the file is absent, nothing changes. Projects without an orchestrator lose nothing.

**Why a file rather than linking the two tools directly.** Either side can change, be replaced or be absent. Any orchestrator can write the file, so the idea is not tied to Silkscreen or Nexus. And it lives in git, so the history of decisions is kept for free.

## A possible order

1. **Read and count.** Signalbox reads the decisions file and shows the one-line summary (idea 4). Small, and immediately useful.
2. **Signals on the rails.** Each decision is drawn where its branch or lane is (idea 1), with who is asking (idea 5).
3. **Evidence on the cards.** Nexus's change review reads Signalbox's view of each branch (conflicts, behind, staging) and shows it on the decision card (idea 3). Signalbox could publish what it knows as a small file the review reads.
4. **The lifecycle.** Proposed and mock-up stations on the spine (idea 2). This is the largest step and changes what the spine is: from what is in flight to everything from idea to live.

## Open questions

- **Who writes the file?** Nexus today, but should leads add their own decisions, with Nexus only collecting them?
- **Where does it live?** In the repository (shared through git, seen by every worktree), or outside it so decisions do not create commits?
- **Is a decision always tied to a branch?** Ideas and mock-ups often have none yet. They would hang off their lane instead.
- **What can the pane see?** Signalbox can read files in the repository; whether it can see other sessions' state directly (working, waiting on Jake) needs checking against the mod engine before relying on it.
- **Clicking.** The board is a picture and cannot be clicked. Real buttons under it are possible on the desktop, but answering decisions probably belongs in the change review, with Signalbox linking to it.
- **Noise.** With many leads, the signals could crowd the board. They may need the same treatment as conflicts: strong marks only for what blocks, and the rest folded into one line.
