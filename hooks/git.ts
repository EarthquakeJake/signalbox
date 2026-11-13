import type { EngineInterface } from 'claude-code'

import type { Lane, Repo, Stage } from '../types'
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

/** Reads the branch picture: what is uncommitted, where this branch stands, and what the stages hold. */
export async function readRepo($: EngineInterface, cwd: string, asked: string, stagingPath: string, stagingRef: string): Promise<Repo> {
  const status = await git($, ['status', '--porcelain=v2', '--branch'], cwd)
  if (status === undefined || status.exitCode !== 0) return NONE

  let branch = ''
  let upstream = ''
  let unpushed: number | undefined
  let dirty = 0
  for (const line of status.stdout.split('\n')) {
    if (line.startsWith('# branch.head ')) branch = line.slice(14).trim()
    else if (line.startsWith('# branch.upstream ')) upstream = line.slice(18).trim()
    else if (line.startsWith('# branch.ab ')) unpushed = countOf(line.slice(12).replace(/[+-]/g, ''), 0)
    else if (/^[12u?] /.test(line)) dirty += 1
  }
  if (branch === '' || branch === '(detached)') {
    branch = said(await git($, ['rev-parse', '--short', 'HEAD'], cwd)) || 'detached'
  }

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
  if (trunkRef !== undefined) {
    const now = await $.clock.now()
    const specs = await readSpecs($, cwd)
    if (specs.length > 0) {
      lanes = await readLanes($, cwd, trunkRef, specs, branch, now)
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
  }
}
