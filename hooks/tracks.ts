import type { EngineInterface } from 'claude-code'

import type { Lane, Stage, TrackSpec } from '../types'

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

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const list = (value: unknown): string[] => (Array.isArray(value) ? value.map(text).filter(one => one !== '') : [])

/** A name pattern, where `*` stands for any run of characters. */
const matches = (pattern: string, name: string): boolean => {
  const source = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')

  return new RegExp(`^${source}$`).test(name)
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

/** When a ref, or a folder on the trunk, was last touched, and what the trunk has taken since. */
async function stageOf($: EngineInterface, cwd: string, trunkRef: string, spec: TrackSpec, now: number): Promise<{ stage: Stage; sha: string } | undefined> {
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
    stage: {
      updatedAt: Math.min(now, seconds * 1000),
      subject: parts.slice(2).join('\t').slice(0, 72),
      behind: Number.isFinite(behind) ? Math.max(0, behind) : 0,
    },
  }
}

/** Fills in each declared lane: its open branches, its staging stage and what is live on it. */
export async function readLanes($: EngineInterface, cwd: string, trunkRef: string, specs: readonly TrackSpec[], branch: string, now: number): Promise<Lane[]> {
  if (specs.length === 0) return []
  const heads = (await git($, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], cwd))
    .split('\n')
    .map(one => one.trim())
    .filter(one => one !== '')
  const trunkName = trunkRef.replace(/^origin\//, '')

  const lanes: Lane[] = []
  for (const spec of specs) {
    const patterns = spec.branches ?? []
    const mine = heads.filter(head => head !== trunkName && patterns.some(pattern => matches(pattern, head)))
    const found = spec.stagingPath === undefined && spec.stagingBranch === undefined ? undefined : await stageOf($, cwd, trunkRef, spec, now)
    const tags = spec.tagPrefix === undefined ? '' : await git($, ['tag', '--sort=-creatordate', '--list', `${spec.tagPrefix}*`], cwd)
    const live = tags.split('\n')[0]?.trim()

    // A lane whose checks have passed carries a tag on the very commit staging stands at.
    let isPassed: boolean | undefined
    if (found !== undefined && spec.id !== undefined) {
      const stamped = await git($, ['rev-parse', '--verify', '--quiet', `refs/tags/uat-passed/${spec.id}^{commit}`], cwd)
      if (stamped !== '') isPassed = stamped === found.sha
    }

    lanes.push({
      name: spec.name,
      branches: mine.length,
      isHere: mine.includes(branch),
      ...(spec.isParked === true ? { isParked: true } : {}),
      ...(found === undefined ? {} : { staging: found.stage }),
      ...(live === undefined || live === '' ? {} : { live }),
      ...(isPassed === undefined ? {} : { isPassed }),
    })
  }

  return lanes
}
