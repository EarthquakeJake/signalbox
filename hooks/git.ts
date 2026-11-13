import type { EngineInterface } from 'claude-code'

import type { Clash, Lane, OpenBranch, Repo, Stage } from '../types'
import { readLanes, readSpecs, refOf } from './tracks'

const NONE: Repo = { kind: 'none' }

type Run = { exitCode: number; stdout: string }

/** Git, in the session's folder, with a short leash: a slow repository must never hold the pane up. */
async function git($: EngineInterface, argv: readonly string[], cwd: string): Promise<Run | undefined> {
  try {
    const ran = await $.process.run(['git', ...argv], { cwd, timeoutMs: 5000 })

    return { exitCode: ran.exitCode, stdout: ran.stdout }
  } catch {
    return undefined
  }
}

const said = (ran: Run | undefined): string => (ran !== undefined && ran.exitCode === 0 ? ran.stdout.trim() : '')

const countOf = (text: string, at: number): number => {
  const part = text.trim().split(/\s+/)[at]

  return part === undefined ? 0 : Math.max(0, Number.parseInt(part, 10) || 0)
}

/** The branch everything else is measured against: the configured one, else the remote's own default, else main or master. */
async function trunkOf($: EngineInterface, cwd: string, asked: string): Promise<string | undefined> {
  if (asked !== '') {
    const has = await git($, ['rev-parse', '--verify', '--quiet', `${asked}^{commit}`], cwd)

    return said(has) === '' ? undefined : asked
  }
  const named = said(await git($, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], cwd))
  if (named !== '') return named
  const refs = await git($, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/main', 'refs/remotes/origin/master', 'refs/heads/main', 'refs/heads/master'], cwd)

  return said(refs)
    .split('\n')
    .map(line => line.trim())
    .find(line => line !== '')
}

/**
 * The stage a folder on the trunk stands for: when a commit last touched that
 * folder, and how far the trunk has moved on since. A project whose staging is
 * a folder it publishes, rather than a branch, still has this.
 */
async function stageOf($: EngineInterface, cwd: string, trunkRef: string, path: string, now: number, isRef = false): Promise<Stage | undefined> {
  const argv = isRef ? ['log', '-1', '--format=%H%x09%ct%x09%s', path] : ['log', '-1', '--format=%H%x09%ct%x09%s', trunkRef, '--', path]
  const line = said(await git($, argv, cwd))
  if (line === '') return undefined
  const parts = line.split('\t')
  const sha = parts[0]
  const at = parts[1]
  if (sha === undefined || at === undefined) return undefined
  const seconds = Number.parseInt(at, 10)
  if (!Number.isFinite(seconds)) return undefined
  const after = said(await git($, ['rev-list', '--count', `${sha}..${trunkRef}`], cwd))

  return {
    updatedAt: Math.min(now, seconds * 1000),
    subject: parts.slice(2).join('\t').slice(0, 72),
    behind: after === '' ? 0 : countOf(after, 0),
  }
}

// The repository's top folder per session folder: it changes only when the folder does, so it is asked once.
const roots = new Map<string, string>()

/** The repository's top folder, with forward slashes; undefined when git would not say, and then asked again. */
async function rootOf($: EngineInterface, cwd: string): Promise<string | undefined> {
  const before = roots.get(cwd)
  if (before !== undefined) return before
  const top = said(await git($, ['rev-parse', '--show-toplevel'], cwd)).replace(/\\/g, '/')
  if (top === '') return undefined
  roots.set(cwd, top)

  return top
}

/** Why a call failed, in the few words the pane has room for. */
const reasonOf = (failure: unknown): string => {
  const said = failure instanceof Error ? failure.message : String(failure)

  return said.replace(/\s+/g, ' ').trim().slice(0, 48) || 'no reason given'
}

/**
 * The branch name from `.git/HEAD`, for a host where no command may run: it
 * needs no process, so a pane there still says where you are.
 */
async function headOf($: EngineInterface, cwd: string): Promise<string | undefined> {
  try {
    const head = String(await $.fs.read(`${cwd}/.git/HEAD`)).trim()
    const named = /^ref:\s*refs\/heads\/(.+)$/.exec(head)

    return named?.[1] ?? (head === '' ? undefined : head.slice(0, 7))
  } catch {
    return undefined
  }
}

/**
 * The path in a `status --porcelain=v2` line: after eight fields for a change,
 * nine for a rename (whose old name follows a tab), ten for a conflict, one
 * for an untracked file. A quoted path loses its quotes.
 */
const pathOf = (line: string): string => {
  const skip = line.startsWith('1 ') ? 8 : line.startsWith('2 ') ? 9 : line.startsWith('u ') ? 10 : 1
  const path = (line.split(' ').slice(skip).join(' ').split('\t')[0] ?? '').trim()

  return path.length > 1 && path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1) : path
}

/** Reads the branch picture: what is uncommitted, where this branch stands, and what the stages hold. */
export async function readRepo($: EngineInterface, cwd: string, asked: string, stagingPath: string, stagingRef: string): Promise<Repo> {
  // The first call apart, so that a host which runs no commands is told apart
  // from a folder that holds no repository.
  let status: { exitCode: number; stdout: string; stderr: string }
  try {
    const ran = await $.process.run(['git', 'status', '--porcelain=v2', '--branch'], { cwd, timeoutMs: 5000 })
    status = { exitCode: ran.exitCode, stdout: ran.stdout, stderr: ran.stderr }
  } catch (failure) {
    const branch = await headOf($, cwd)

    return { kind: 'blocked', why: reasonOf(failure), ...(branch === undefined ? {} : { branch }) }
  }
  // Git's own first words, so a refusal names itself rather than passing for an empty folder.
  if (status.exitCode !== 0) {
    const said = status.stderr.split('\n').map(line => line.trim()).find(line => line !== '')

    return said === undefined ? NONE : { kind: 'none', why: said.replace(/^fatal:\s*/i, '').slice(0, 60) }
  }

  let branch = ''
  let upstream = ''
  let unpushed: number | undefined
  let dirty = 0
  // The same files by name, so this folder's uncommitted work counts in clashes as the branch you are on.
  const dirtyFiles: string[] = []
  for (const line of status.stdout.split('\n')) {
    if (line.startsWith('# branch.head ')) branch = line.slice(14).trim()
    else if (line.startsWith('# branch.upstream ')) upstream = line.slice(18).trim()
    else if (line.startsWith('# branch.ab ')) unpushed = countOf(line.slice(12).replace(/[+-]/g, ''), 0)
    else if (/^[12u?] /.test(line)) {
      dirty += 1
      const path = pathOf(line)
      if (path !== '' && dirtyFiles.length < 500) dirtyFiles.push(path)
    }
  }
  if (branch === '' || branch === '(detached)') {
    branch = said(await git($, ['rev-parse', '--short', 'HEAD'], cwd)) || 'detached'
  }

  const root = await rootOf($, cwd)
  const trunkRef = await trunkOf($, cwd, asked)
  const isTrunk = trunkRef !== undefined && (trunkRef === branch || trunkRef.endsWith(`/${branch}`))
  let ahead = 0
  let behind = 0
  if (trunkRef !== undefined && !isTrunk) {
    const spread = said(await git($, ['rev-list', '--left-right', '--count', `${trunkRef}...HEAD`], cwd))
    if (spread !== '') {
      behind = countOf(spread, 0)
      ahead = countOf(spread, 1)
    }
  }

  let staging: Stage | undefined
  let tag: string | undefined
  let lanes: Lane[] | undefined
  let guess: 'none' | 'tied' | undefined
  let merged: number | undefined
  let loose: OpenBranch[] | undefined
  let clashes: Clash[] | undefined
  let clash: Clash['level'] | undefined
  let mismatch: { named: string; byFiles: string } | undefined
  if (trunkRef !== undefined) {
    const now = await $.clock.now()
    // The track file sits at the top of the repository, which a session in a subfolder is not.
    const specs = await readSpecs($, root ?? cwd)
    if (specs.length > 0) {
      const placed = await readLanes($, cwd, trunkRef, specs, branch, now, dirtyFiles)
      lanes = placed.lanes
      guess = placed.guess
      merged = placed.merged
      loose = placed.loose
      clashes = placed.clashes
      clash = placed.clash
      mismatch = placed.mismatch
    } else if (stagingRef !== '') {
      const found = await refOf($, cwd, stagingRef)
      if (found !== undefined) staging = await stageOf($, cwd, trunkRef, found, now, true)
    } else if (stagingPath !== '') {
      staging = await stageOf($, cwd, trunkRef, stagingPath, now)
    }
    tag = said(await git($, ['describe', '--tags', '--abbrev=0', trunkRef], cwd)) || undefined
  }

  return {
    kind: 'repo',
    branch,
    ...(trunkRef === undefined ? {} : { trunkRef }),
    ...(trunkRef !== undefined && !isTrunk ? { trunk: trunkRef } : {}),
    ahead,
    behind,
    dirty,
    ...(upstream === '' ? {} : { unpushed: unpushed ?? 0 }),
    ...(staging === undefined ? {} : { staging }),
    ...(tag === undefined ? {} : { tag }),
    ...(lanes === undefined || lanes.length === 0 ? {} : { lanes }),
    ...(guess === undefined || lanes === undefined || lanes.length === 0 ? {} : { guess }),
    ...(merged === undefined ? {} : { merged }),
    ...(loose === undefined || loose.length === 0 ? {} : { loose }),
    ...(clashes === undefined || clashes.length === 0 ? {} : { clashes }),
    ...(clash === undefined ? {} : { clash }),
    ...(root === undefined ? {} : { root }),
    ...(mismatch === undefined ? {} : { mismatch }),
  }
}
