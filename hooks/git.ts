import type { EngineInterface } from 'claude-code'

import type { Repo } from '../types'

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

/** The branch everything else is measured against: the configured one, else the remote's own default, else main or master. */
async function trunkOf($: EngineInterface, cwd: string, asked: string): Promise<string | undefined> {
  if (asked !== '') {
    const has = await git($, ['rev-parse', '--verify', '--quiet', `${asked}^{commit}`], cwd)

    return has !== undefined && has.exitCode === 0 ? asked : undefined
  }
  const head = await git($, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], cwd)
  const named = head?.stdout.trim() ?? ''
  if (head?.exitCode === 0 && named !== '') return named
  const refs = await git($, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/main', 'refs/remotes/origin/master', 'refs/heads/main', 'refs/heads/master'], cwd)

  return refs?.stdout.split('\n').map(line => line.trim()).find(line => line !== '')
}

const countOf = (text: string, at: number): number => {
  const part = text.trim().split(/\s+/)[at]

  return part === undefined ? 0 : Math.max(0, Number.parseInt(part, 10) || 0)
}

/**
 * Reads the branch picture in three git calls: what is uncommitted, what the
 * trunk is, and how far this branch stands from it.
 */
export async function readRepo($: EngineInterface, cwd: string, asked: string): Promise<Repo> {
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
    const head = await git($, ['rev-parse', '--short', 'HEAD'], cwd)
    branch = head?.stdout.trim() ?? 'detached'
  }

  const trunk = await trunkOf($, cwd, asked)
  const isTrunk = trunk !== undefined && (trunk === branch || trunk.endsWith(`/${branch}`))
  let ahead = 0
  let behind = 0
  if (trunk !== undefined && !isTrunk) {
    const spread = await git($, ['rev-list', '--left-right', '--count', `${trunk}...HEAD`], cwd)
    if (spread !== undefined && spread.exitCode === 0) {
      behind = countOf(spread.stdout, 0)
      ahead = countOf(spread.stdout, 1)
    }
  }

  return {
    kind: 'repo',
    branch,
    ...(trunk !== undefined && !isTrunk ? { trunk } : {}),
    ahead,
    behind,
    dirty,
    ...(upstream === '' ? {} : { unpushed: unpushed ?? 0 }),
  }
}
