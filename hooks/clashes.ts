import type { EngineInterface } from 'claude-code'

import type { Clash } from '../types'

/** Open branches looked at for clashes at most, newest first; the branch you are on always among them. */
const MOST_BRANCHES = 16
/** Worktrees whose uncommitted files are read at most. */
const MOST_WORKTREES = 12
/** Worktrees asked for their uncommitted files per refresh, stalest first, so a busy repository costs a few calls, not a dozen. */
const MOST_STATUS = 4
/** How long a worktree's uncommitted files are trusted before they are asked again. */
const STALE_MS = 20000
/** Branch pairs put through `merge-tree` per refresh, beyond those already known. */
const MOST_MERGES = 6
/** Clashes kept, worst first. */
const MOST_CLASHES = 8
/** Uncommitted files kept per worktree, so a folder of build output cannot swamp the pane. */
const MOST_DIRTY = 500
/**
 * Whether a branch git counts as merged still takes part when its worktree
 * holds uncommitted work, as a fresh chat's branch does before its first
 * commit. Off for now, as briefed: merged branches are left out. The chief decides.
 */
const WITH_FRESH_WORKTREES = false

type Run = { exitCode: number; stdout: string }

async function run($: EngineInterface, argv: readonly string[], cwd: string): Promise<Run | undefined> {
  try {
    const ran = await $.process.run(['git', ...argv], { cwd, timeoutMs: 5000 })

    return { exitCode: ran.exitCode, stdout: ran.stdout }
  } catch {
    return undefined
  }
}

const linesOf = (text: string): string[] => text.split('\n').map(one => one.trim()).filter(one => one !== '')

// ---- What each branch changed since it left the trunk ----------------------

/** Files changed per commit pair, kept by the branch's and the trunk's commits, shared by placing and clashes. */
export type FilesKept = Map<string, string[]>

let files: FilesKept = new Map()

/** The files a commit changed since it left the trunk. Undefined when git would not say, so it is asked again. */
export async function filesOf($: EngineInterface, cwd: string, trunkRef: string, trunkSha: string, sha: string, kept: FilesKept): Promise<string[] | undefined> {
  const key = `${sha}:${trunkSha}`
  const before = kept.get(key) ?? files.get(key)
  if (before !== undefined) {
    kept.set(key, before)

    return before
  }
  const ran = await run($, ['diff', '--name-only', `${trunkRef}...${sha}`], cwd)
  if (ran === undefined || ran.exitCode !== 0) return undefined
  const changed = linesOf(ran.stdout)
  kept.set(key, changed)

  return changed
}

/** Keeps only what this refresh used, so the cache never outgrows the repository. */
export function keepFiles(kept: FilesKept): void {
  files = kept
}

// ---- Worktrees and their uncommitted files ---------------------------------

type Worktree = { path: string; branch: string }

/** Every worktree with a branch checked out; detached and bare ones say nothing about a branch. */
async function worktreesOf($: EngineInterface, cwd: string): Promise<Worktree[]> {
  const ran = await run($, ['worktree', 'list', '--porcelain'], cwd)
  if (ran === undefined || ran.exitCode !== 0) return []
  const found: Worktree[] = []
  let path = ''
  for (const line of ran.stdout.split('\n').map(one => one.trim())) {
    if (line.startsWith('worktree ')) path = line.slice(9)
    else if (line.startsWith('branch refs/heads/') && path !== '') found.push({ path, branch: line.slice(18) })
    else if (line === '') path = ''
  }

  return found
}

/** `status --porcelain -z` read into paths; a rename's second entry is its old name, which is skipped. */
export const dirtyFrom = (said: string): string[] => {
  const entries = said.split('\0')
  const found: string[] = []
  for (let index = 0; index < entries.length && found.length < MOST_DIRTY; index += 1) {
    const entry = entries[index] ?? ''
    if (entry.length < 4) continue
    const code = entry.slice(0, 2)
    found.push(entry.slice(3))
    if (code.includes('R') || code.includes('C')) index += 1
  }

  return found
}

let dirt = new Map<string, { at: number; files: string[] }>()

// ---- Whether two branches merge cleanly ------------------------------------

let merges = new Map<string, string[]>()

/** The files git cannot merge between two commits; empty when they merge cleanly, undefined when git would not say. */
async function conflictsOf($: EngineInterface, cwd: string, a: string, b: string, kept: Map<string, string[]>): Promise<string[] | undefined> {
  const ran = await run($, ['merge-tree', '--write-tree', '--name-only', '--no-messages', a, b], cwd)
  if (ran === undefined || (ran.exitCode !== 0 && ran.exitCode !== 1)) return undefined
  // The first line is the merged tree; the conflicted files follow it, until a blank line.
  const lines = ran.stdout.split('\n').map(one => one.trim())
  const end = lines.indexOf('', 1)
  const conflicted = ran.exitCode === 0 ? [] : [...new Set(lines.slice(1, end < 0 ? undefined : end).filter(one => one !== ''))]
  kept.set(`${a}:${b}`, conflicted)

  return conflicted
}

// ---- Clashes ---------------------------------------------------------------

/** A local branch as for-each-ref gives it. */
export type Work = { name: string; sha: string; updatedAt: number }

export type Clashing = {
  clashes: Clash[]
  /** The worst clash each branch is part of. */
  byBranch: Map<string, Clash['level']>
}

const rank = (clash: Clash): number => (clash.level === 'conflict' ? 2 : 1)

/**
 * Pairs of open work that would collide: branches that changed the same files,
 * with each worktree's uncommitted files counted as its branch's, and of those
 * the pairs git cannot merge cleanly. Uncommitted work cannot be merged, so a
 * clash resting on it alone stays an overlap. A branch merged into the trunk
 * is left out unless a worktree holds uncommitted work on it, as a fresh
 * chat's branch does before its first commit.
 */
export async function readClashes(
  $: EngineInterface,
  cwd: string,
  trunkRef: string,
  trunkSha: string,
  open: readonly Work[],
  merged: readonly Work[],
  branch: string,
  hereDirty: readonly string[],
  keptFiles: FilesKept,
  now: number,
): Promise<Clashing> {
  const none: Clashing = { clashes: [], byBranch: new Map() }
  if (!WITH_FRESH_WORKTREES) merged = []
  if (trunkSha === '' || open.length + merged.length < 2) return none

  // Uncommitted files per branch: yours from this folder's status, the rest from their worktrees, a few per refresh.
  const known = new Set([...open, ...merged].map(work => work.name))
  const newest = new Map([...open, ...merged].map(work => [work.name, work.updatedAt]))
  const trees = (await worktreesOf($, cwd))
    .filter(tree => tree.branch !== branch && known.has(tree.branch))
    .sort((a, b) => (newest.get(b.branch) ?? 0) - (newest.get(a.branch) ?? 0))
    .slice(0, MOST_WORKTREES)
  const keptDirt = new Map<string, { at: number; files: string[] }>()
  const stalest = [...trees].sort((a, b) => (dirt.get(a.path)?.at ?? -1) - (dirt.get(b.path)?.at ?? -1))
  let asked = 0
  for (const tree of stalest) {
    const before = dirt.get(tree.path)
    if (before !== undefined && (now - before.at < STALE_MS || asked >= MOST_STATUS)) {
      keptDirt.set(tree.path, before)
      continue
    }
    if (asked >= MOST_STATUS) continue
    asked += 1
    // Another chat's worktree: read it without taking its index lock or refreshing its index.
    const ran = await run($, ['--no-optional-locks', 'status', '--porcelain', '-z', '--untracked-files=all'], tree.path)
    if (ran !== undefined && ran.exitCode === 0) keptDirt.set(tree.path, { at: now, files: dirtyFrom(ran.stdout) })
    else if (before !== undefined) keptDirt.set(tree.path, before)
  }
  dirt = keptDirt
  const dirty = new Map<string, string[]>()
  for (const tree of trees) {
    const found = keptDirt.get(tree.path)?.files ?? []
    if (found.length > 0) dirty.set(tree.branch, found)
  }
  if (hereDirty.length > 0 && known.has(branch)) dirty.set(branch, [...hereDirty])

  // Who takes part: the newest open branches, yours first, and merged ones only where uncommitted work is on them.
  const members = [
    ...[...open].sort((a, b) => Number(b.name === branch) - Number(a.name === branch) || b.updatedAt - a.updatedAt).slice(0, MOST_BRANCHES),
    ...merged.filter(work => dirty.has(work.name)),
  ]
  const isOpen = new Set(open.map(work => work.name))
  const committed = new Map<string, Set<string>>()
  for (const work of members) {
    const changed = isOpen.has(work.name) ? await filesOf($, cwd, trunkRef, trunkSha, work.sha, keptFiles) : []
    committed.set(work.name, new Set(changed ?? []))
  }

  const keptMerges = new Map<string, string[]>()
  let merging = 0
  const clashes: Clash[] = []
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      const a = members[i] as Work
      const b = members[j] as Work
      const inA = committed.get(a.name) ?? new Set<string>()
      const inB = committed.get(b.name) ?? new Set<string>()
      const allA = new Set([...inA, ...(dirty.get(a.name) ?? [])])
      const shared = [...new Set([...inB, ...(dirty.get(b.name) ?? [])])].filter(file => allA.has(file)).sort()
      if (shared.length === 0) continue
      const bothCommitted = shared.filter(file => inA.has(file) && inB.has(file))

      // Only committed work can be merged; each pair is put through merge-tree once per pair of commits.
      let conflicted: string[] | undefined
      if (bothCommitted.length > 0) {
        const [x, y] = a.sha < b.sha ? [a.sha, b.sha] : [b.sha, a.sha]
        const before = keptMerges.get(`${x}:${y}`) ?? merges.get(`${x}:${y}`)
        if (before !== undefined) {
          keptMerges.set(`${x}:${y}`, before)
          conflicted = before
        } else if (merging < MOST_MERGES) {
          merging += 1
          conflicted = await conflictsOf($, cwd, x, y, keptMerges)
        }
      }
      const isConflict = conflicted !== undefined && conflicted.length > 0
      const isUncommitted = shared.length > bothCommitted.length
      clashes.push({
        a: a.name,
        b: b.name,
        level: isConflict ? 'conflict' : 'overlap',
        files: [...new Set([...(isConflict ? (conflicted ?? []) : []), ...shared])].slice(0, 3),
        ...(isUncommitted ? { isUncommitted: true } : {}),
      })
    }
  }
  merges = keptMerges

  const byBranch = new Map<string, Clash['level']>()
  for (const clash of clashes) {
    for (const name of [clash.a, clash.b]) {
      if (byBranch.get(name) !== 'conflict') byBranch.set(name, clash.level)
    }
  }
  clashes.sort((p, q) => rank(q) - rank(p) || Number(q.a === branch || q.b === branch) - Number(p.a === branch || p.b === branch) || p.a.localeCompare(q.a) || p.b.localeCompare(q.b))

  return { clashes: clashes.slice(0, MOST_CLASHES), byBranch }
}
