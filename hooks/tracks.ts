import type { EngineInterface } from 'claude-code'

import type { Lane, Stage, TrackSpec } from '../types'
import { matches, pickLane, type Pick } from './paths'

/** Where a project may declare its lanes; the first one found wins. */
const FILES = ['signalbox.tracks.json', 'tracks.json']
const MOST = 4

async function git($: EngineInterface, argv: readonly string[], cwd: string): Promise<string> {
  try {
    const ran = await $.process.run(['git', ...argv], { cwd, timeoutMs: 5000 })

    return ran.exitCode === 0 ? ran.stdout.trim() : ''
  } catch {
    return ''
  }
}

/** For the git questions whose answer is the exit code rather than the output. */
async function asks($: EngineInterface, argv: readonly string[], cwd: string): Promise<boolean | undefined> {
  try {
    const ran = await $.process.run(['git', ...argv], { cwd, timeoutMs: 5000 })

    return ran.exitCode === 0 ? true : ran.exitCode === 1 ? false : undefined
  } catch {
    return undefined
  }
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const list = (value: unknown): string[] => (Array.isArray(value) ? value.map(text).filter(one => one !== '') : [])


/** Branches placed by their files at most, so a repository full of them stays cheap. */
const MOST_PLACED = 12

// Each branch's verdict, kept against the commit it and the trunk stood at, so
// a diff runs only when one of them moves and not on every refresh.
let placed = new Map<string, { key: string; pick: Pick | undefined }>()

/**
 * The lane a branch belongs to when its name does not say: the one owning most
 * of the files it changed since it left the trunk. Undefined when it changed
 * nothing the trunk lacks.
 */
async function pickOf($: EngineInterface, cwd: string, trunkRef: string, trunkSha: string, ref: string, sha: string, specs: readonly TrackSpec[], kept: Map<string, { key: string; pick: Pick | undefined }>): Promise<Pick | undefined> {
  const key = `${sha}:${trunkSha}`
  const before = placed.get(ref)
  if (before !== undefined && before.key === key) {
    kept.set(ref, before)

    return before.pick
  }
  const changed = await git($, ['diff', '--name-only', `${trunkRef}...${sha}`], cwd)
  const files = changed.split('\n').map(one => one.trim()).filter(one => one !== '')
  const pick = pickLane(files, specs.map(spec => spec.paths ?? []))
  kept.set(ref, { key, pick })

  return pick
}

/**
 * Reads the lanes a project declares, taking either spelling: a `branch`
 * prefix with a `uat` branch and a `tag` prefix, or `branches` with a
 * `staging` and a `live`. The file is the project's own, so every field is
 * checked and anything unexpected is left out rather than trusted.
 */
export async function readSpecs($: EngineInterface, cwd: string): Promise<TrackSpec[]> {
  for (const name of FILES) {
    let raw = ''
    try {
      raw = String(await $.fs.read(`${cwd}/${name}`))
    } catch {
      continue
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return []
    }
    const held = parsed as { tracks?: unknown }
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(held.tracks) ? held.tracks : []
    const specs: TrackSpec[] = []
    for (const row of rows.slice(0, MOST)) {
      const one = row as Record<string, unknown>
      const named = text(one.name) || text(one.id)
      if (named === '') continue
      const staging = (one.staging ?? one.uat ?? {}) as Record<string, unknown>
      const live = (one.live ?? {}) as Record<string, unknown>
      const prefix = text(one.branch)
      const branches = list(one.branches)
      const stagingBranch = text(staging.branch)
      const stagingPath = text(staging.path)
      const tagPrefix = text(live.tagPrefix) || text(one.tag)
      specs.push({
        name: named.slice(0, 24),
        ...(text(one.id) === '' ? {} : { id: text(one.id) }),
        branches: branches.length > 0 ? branches : prefix === '' ? [] : [prefix.endsWith('*') ? prefix : `${prefix}*`],
        ...(stagingPath === '' ? {} : { stagingPath }),
        ...(stagingBranch === '' ? {} : { stagingBranch }),
        ...(tagPrefix === '' ? {} : { tagPrefix }),
        ...(list(one.paths).length === 0 ? {} : { paths: list(one.paths) }),
        ...(one.parked === true ? { isParked: true } : {}),
      })
    }

    return specs
  }

  return []
}

/** A ref as the repository actually holds it: the branch itself, or the remote's copy. */
async function refOf($: EngineInterface, cwd: string, name: string): Promise<string | undefined> {
  for (const candidate of [name, `origin/${name}`]) {
    const sha = await git($, ['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`], cwd)
    if (sha !== '') return candidate
  }

  return undefined
}

/** A ref as the repository holds it, exported so a single track can use it too. */
export { refOf }

/** When a ref, or a folder on the trunk, was last touched, and what the trunk has taken since. */
async function stageOf($: EngineInterface, cwd: string, trunkRef: string, spec: TrackSpec, now: number): Promise<{ stage: Stage; sha: string; ref: string } | undefined> {
  const named = spec.stagingBranch
  const ref = named === undefined ? trunkRef : await refOf($, cwd, named)
  if (ref === undefined) return undefined
  const argv = ['log', '-1', '--format=%H%x09%ct%x09%s', ref, ...(named === undefined ? ['--', spec.stagingPath ?? ''] : [])]
  const line = await git($, argv, cwd)
  if (line === '') return undefined
  const parts = line.split('\t')
  const sha = parts[0]
  const at = parts[1]
  if (sha === undefined || at === undefined) return undefined
  const seconds = Number.parseInt(at, 10)
  if (!Number.isFinite(seconds)) return undefined
  const after = await git($, ['rev-list', '--count', `${sha}..${trunkRef}`], cwd)
  const behind = Number.parseInt(after, 10)

  return {
    sha,
    ref,
    stage: {
      updatedAt: Math.min(now, seconds * 1000),
      subject: parts.slice(2).join('\t').slice(0, 72),
      behind: Number.isFinite(behind) ? Math.max(0, behind) : 0,
    },
  }
}

/** The lanes as they stand, and what became of placing your branch by its files where its name did not place it. */
export type Placed = { lanes: Lane[]; guess?: 'none' | 'tied' }

/** Fills in each declared lane: its open branches, its staging and what is live on it. */
export async function readLanes($: EngineInterface, cwd: string, trunkRef: string, specs: readonly TrackSpec[], branch: string, now: number): Promise<Placed> {
  if (specs.length === 0) return { lanes: [] }
  const rows = (await git($, ['for-each-ref', '--format=%(refname:short)%09%(objectname)', 'refs/heads'], cwd))
    .split('\n')
    .map(one => one.trim().split('\t'))
    .flatMap(([name, sha]) => (name === undefined || name === '' || sha === undefined ? [] : [{ name, sha }]))
  const heads = rows.map(row => row.name)
  const trunkName = trunkRef.replace(/^origin\//, '')
  const named = specs.map(spec => heads.filter(head => head !== trunkName && (spec.branches ?? []).some(pattern => matches(pattern, head))))
  const isNamed = named.some(mine => mine.includes(branch))

  // Every branch whose name claims no lane is placed by what it changed, so a
  // lane's count covers the branches the desktop app names for you too.
  const byFiles = specs.map(() => 0)
  let here: Pick | undefined
  if (specs.some(spec => (spec.paths ?? []).length > 0)) {
    const trunkSha = await git($, ['rev-parse', '--verify', '--quiet', `${trunkRef}^{commit}`], cwd)
    if (trunkSha !== '') {
      const kept = new Map<string, { key: string; pick: Pick | undefined }>()
      const loose = rows
        .filter(row => row.name !== trunkName && !named.some(mine => mine.includes(row.name)))
        // The branch you are on first, so the cap never leaves it out.
        .sort((a, b) => Number(b.name === branch) - Number(a.name === branch))
        .slice(0, MOST_PLACED)
      for (const row of loose) {
        const pick = await pickOf($, cwd, trunkRef, trunkSha, row.name, row.sha, specs, kept)
        if (pick?.kind === 'lane') byFiles[pick.index] = (byFiles[pick.index] ?? 0) + 1
        if (row.name === branch) here = pick
      }
      // A detached head is no branch, so it is placed on its own.
      if (!isNamed && branch !== trunkName && !heads.includes(branch)) {
        const sha = await git($, ['rev-parse', 'HEAD'], cwd)
        if (sha !== '') here = await pickOf($, cwd, trunkRef, trunkSha, 'HEAD', sha, specs, kept)
      }
      placed = kept
    }
  }

  const lanes: Lane[] = []
  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index] as TrackSpec
    const mine = named[index] ?? []
    const extra = byFiles[index] ?? 0
    const isGuessed = !isNamed && here?.kind === 'lane' && here.index === index
    const found = spec.stagingPath === undefined && spec.stagingBranch === undefined ? undefined : await stageOf($, cwd, trunkRef, spec, now)
    const tags = spec.tagPrefix === undefined ? '' : await git($, ['tag', '--sort=-creatordate', '--list', `${spec.tagPrefix}*`], cwd)
    const live = tags.split('\n')[0]?.trim()

    // A lane whose checks have passed carries a tag on the very commit staging stands at.
    let isPassed: boolean | undefined
    if (found !== undefined && spec.id !== undefined) {
      const stamped = await git($, ['rev-parse', '--verify', '--quiet', `refs/tags/uat-passed/${spec.id}^{commit}`], cwd)
      if (stamped !== '') isPassed = stamped === found.sha
    }

    // The question a lane answers for the branch you are on: has your work reached it?
    let hasYours: boolean | undefined
    if (found !== undefined && spec.stagingBranch !== undefined) {
      hasYours = await asks($, ['merge-base', '--is-ancestor', 'HEAD', found.ref], cwd)
    }

    lanes.push({
      name: spec.name,
      branches: mine.length + extra,
      ...(extra > 0 ? { byFiles: extra } : {}),
      isHere: mine.includes(branch) || isGuessed,
      ...(isGuessed ? { isGuessed: true } : {}),
      ...(spec.isParked === true ? { isParked: true } : {}),
      ...(found === undefined ? {} : { staging: found.stage }),
      ...(live === undefined || live === '' ? {} : { live }),
      ...(isPassed === undefined ? {} : { isPassed }),
      ...(hasYours === undefined ? {} : { hasYours }),
    })
  }

  // Your branch was looked at by its files and could not be placed: say so, rather than go quietly dark.
  const guess = isNamed || branch === trunkName || here === undefined || here.kind === 'lane' ? undefined : here.kind

  return { lanes, ...(guess === undefined ? {} : { guess }) }
}
