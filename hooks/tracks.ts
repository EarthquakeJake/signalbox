import type { EngineInterface } from 'claude-code'

import type { Clash, Lane, OpenBranch, Stage, TrackSpec } from '../types'
import { filesOf, keepFiles, readClashes, type FilesKept } from './clashes'
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
async function pickOf($: EngineInterface, cwd: string, trunkRef: string, trunkSha: string, ref: string, sha: string, specs: readonly TrackSpec[], kept: Map<string, { key: string; pick: Pick | undefined }>, keptFiles: FilesKept): Promise<Pick | undefined> {
  const key = `${sha}:${trunkSha}`
  const before = placed.get(ref)
  if (before !== undefined && before.key === key) {
    kept.set(ref, before)
    // The verdict stands, but its files are kept too, so clashes need not ask for them again.
    await filesOf($, cwd, trunkRef, trunkSha, sha, keptFiles)

    return before.pick
  }
  // The same diff clashes read, asked once between them.
  const files = (await filesOf($, cwd, trunkRef, trunkSha, sha, keptFiles)) ?? []
  const pick = pickLane(files, specs.map(spec => spec.paths ?? []))
  kept.set(ref, { key, pick })

  return pick
}

/** Open branches listed under a lane at most; `branches` still counts them all. */
const MOST_LISTED = 4

type Spread = { ahead: number; behind: number }

// Each listed branch's ahead and behind, kept against the commits it and the
// trunk stood at, as `placed` is, so a count runs only when one of them moves.
let spreads = new Map<string, { key: string; spread: Spread }>()

/** How far a branch has gone from the trunk, both ways. Undefined when git would not say, so a failure is asked again next time. */
async function spreadOf($: EngineInterface, cwd: string, trunkRef: string, trunkSha: string, ref: string, sha: string, kept: Map<string, { key: string; spread: Spread }>): Promise<Spread | undefined> {
  const key = `${sha}:${trunkSha}`
  const before = spreads.get(ref)
  if (before !== undefined && before.key === key) {
    kept.set(ref, before)

    return before.spread
  }
  const counted = (await git($, ['rev-list', '--left-right', '--count', `${trunkRef}...${sha}`], cwd)).split(/\s+/)
  const behind = Number.parseInt(counted[0] ?? '', 10)
  const ahead = Number.parseInt(counted[1] ?? '', 10)
  if (!Number.isFinite(behind) || !Number.isFinite(ahead)) return undefined
  const spread = { ahead: Math.max(0, ahead), behind: Math.max(0, behind) }
  kept.set(ref, { key, spread })

  return spread
}

/** A local branch as for-each-ref gives it. */
type Head = { name: string; sha: string; updatedAt: number; subject?: string }

/** Branches to show, newest first and at most four, each measured against the trunk. */
async function listOf($: EngineInterface, cwd: string, trunkRef: string, trunkSha: string, candidates: readonly Head[], fromFiles: readonly string[], kept: Map<string, { key: string; spread: Spread }>): Promise<OpenBranch[]> {
  const shown = [...candidates].sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name)).slice(0, MOST_LISTED)
  const listed: OpenBranch[] = []
  for (const row of shown) {
    const spread = trunkSha === '' ? undefined : await spreadOf($, cwd, trunkRef, trunkSha, row.name, row.sha, kept)
    listed.push({
      name: row.name,
      ahead: spread?.ahead ?? 0,
      behind: spread?.behind ?? 0,
      updatedAt: row.updatedAt,
      ...(row.subject === undefined ? {} : { subject: row.subject }),
      ...(fromFiles.includes(row.name) ? { isByFiles: true } : {}),
    })
  }

  return listed
}

/** Tag lines as `name<TAB>seconds<TAB>object`, newest first, read into names, times and the object each names. */
const releasesOf = (said: string, now: number): { name: string; at: number; sha: string }[] =>
  said
    .split('\n')
    .map(line => line.trim().split('\t'))
    .flatMap(([name, at, sha]) => {
      if (name === undefined || name === '') return []
      const seconds = Number.parseInt(at ?? '', 10)

      return [{ name, at: Number.isFinite(seconds) ? Math.min(now, seconds * 1000) : 0, sha: sha ?? '' }]
    })

// Whether each lane's staging holds what is live, kept against the staging
// commit and the live tag's object, so the two are compared only when one moves.
let sames = new Map<string, { key: string; isSame: boolean }>()

/**
 * Whether staging holds exactly what the live tag does, in the files that
 * lane owns: a staging branch often carries its own build and other lanes'
 * files, which say nothing about this lane. A lane that names no files is
 * compared whole. Undefined when git cannot say.
 */
async function sameOf($: EngineInterface, cwd: string, lane: string, stagingSha: string, tagSha: string, paths: readonly string[], kept: Map<string, { key: string; isSame: boolean }>): Promise<boolean | undefined> {
  const key = `${stagingSha}:${tagSha}:${paths.join(',')}`
  const before = sames.get(lane)
  if (before !== undefined && before.key === key) {
    kept.set(lane, before)

    return before.isSame
  }
  const scope = paths.length === 0 ? [] : ['--', ...paths.map(glob => `:(glob)${glob}`)]
  const isSame = await asks($, ['diff', '--quiet', '--no-ext-diff', stagingSha, tagSha, ...scope], cwd)
  if (isSame === undefined) return undefined
  kept.set(lane, { key, isSame })

  return isSame
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
export type Placed = {
  lanes: Lane[]
  guess?: 'none' | 'tied'
  /** Local branches already merged into the trunk, the trunk and the branch you are on apart; absent when git could not say. */
  merged?: number
  /** Open branches in no lane, newest first, at most four. */
  loose: OpenBranch[]
  /** Open work that would collide, worst first, at most eight. */
  clashes?: Clash[]
  /** The worst clash the branch you are on is part of. */
  clash?: Clash['level']
}

/**
 * Fills in each declared lane: its open branches, its staging and what is live
 * on it, and the clashes among the open branches. `hereDirty` is this folder's
 * uncommitted files, counted as the branch you are on.
 */
export async function readLanes($: EngineInterface, cwd: string, trunkRef: string, specs: readonly TrackSpec[], branch: string, now: number, hereDirty: readonly string[] = []): Promise<Placed> {
  if (specs.length === 0) return { lanes: [], loose: [] }
  // Each branch's changed files, shared by placing and clashes, kept for the next refresh.
  const keptFiles: FilesKept = new Map()
  // Names, commits and commit times in the one call, so listing a lane's branches newest first costs nothing more.
  // The newest commit's subject rides along too, so a branch can say what it is for at no extra cost.
  const rows = (await git($, ['for-each-ref', '--format=%(refname:short)%09%(objectname)%09%(committerdate:unix)%09%(contents:subject)', 'refs/heads'], cwd))
    .split('\n')
    .map(one => one.trim().split('\t'))
    .flatMap(([name, sha, at, ...said]): Head[] => {
      if (name === undefined || name === '' || sha === undefined || sha === '') return []
      const seconds = Number.parseInt(at ?? '', 10)
      const subject = said.join(' ').trim().slice(0, 72)

      return [{ name, sha, updatedAt: Number.isFinite(seconds) ? Math.min(now, seconds * 1000) : 0, ...(subject === '' ? {} : { subject }) }]
    })
  const heads = rows.map(row => row.name)
  const trunkName = trunkRef.replace(/^origin\//, '')
  const named = specs.map(spec => heads.filter(head => head !== trunkName && (spec.branches ?? []).some(pattern => matches(pattern, head))))
  const isNamed = named.some(mine => mine.includes(branch))

  // A branch already merged into the trunk is no longer in flight, so it is not
  // counted. Where git cannot say, every branch counts, as before.
  let open: Set<string> | undefined
  try {
    const ran = await $.process.run(['git', 'for-each-ref', '--format=%(refname:short)', `--no-merged=${trunkRef}`, 'refs/heads'], { cwd, timeoutMs: 5000 })
    if (ran.exitCode === 0) open = new Set(ran.stdout.split('\n').map(one => one.trim()).filter(one => one !== ''))
  } catch {
    open = undefined
  }
  const isOpen = (name: string): boolean => open === undefined || open.has(name)

  // Every branch whose name claims no lane is placed by what it changed, so a
  // lane's count covers the branches the desktop app names for you too.
  const byFiles = specs.map(() => 0)
  // The branches each lane holds by their files, by name, for listing under it.
  const placedIn = specs.map((): string[] => [])
  let here: Pick | undefined
  // The trunk's commit, the key of both caches, asked once and only when some branch besides the trunk exists.
  const trunkSha = heads.some(head => head !== trunkName) ? await git($, ['rev-parse', '--verify', '--quiet', `${trunkRef}^{commit}`], cwd) : ''
  if (specs.some(spec => (spec.paths ?? []).length > 0)) {
    if (trunkSha !== '') {
      const kept = new Map<string, { key: string; pick: Pick | undefined }>()
      const loose = rows
        .filter(row => row.name !== trunkName && !named.some(mine => mine.includes(row.name)))
        // The branch you are on first, so the cap never leaves it out, then the newest.
        .sort((a, b) => Number(b.name === branch) - Number(a.name === branch) || b.updatedAt - a.updatedAt)
        .slice(0, MOST_PLACED)
      for (const row of loose) {
        const pick = await pickOf($, cwd, trunkRef, trunkSha, row.name, row.sha, specs, kept, keptFiles)
        if (pick?.kind === 'lane') {
          byFiles[pick.index] = (byFiles[pick.index] ?? 0) + 1
          placedIn[pick.index]?.push(row.name)
        }
        if (row.name === branch) here = pick
      }
      // A detached head is no branch, so it is placed on its own.
      if (!isNamed && branch !== trunkName && !heads.includes(branch)) {
        const sha = await git($, ['rev-parse', 'HEAD'], cwd)
        if (sha !== '') here = await pickOf($, cwd, trunkRef, trunkSha, 'HEAD', sha, specs, kept, keptFiles)
      }
      placed = kept
    }
  }

  // Only the few branches shown under each lane are measured against the trunk.
  const shaOf = new Map(rows.map(row => [row.name, row]))
  const keptSpreads = new Map<string, { key: string; spread: Spread }>()
  const keptSames = new Map<string, { key: string; isSame: boolean }>()
  const lanes: Lane[] = []
  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index] as TrackSpec
    const mine = named[index] ?? []
    const extra = byFiles[index] ?? 0
    const byName = mine.filter(isOpen)
    const fromFiles = placedIn[index] ?? []
    const candidates = [...byName, ...fromFiles].flatMap(name => {
      const row = shaOf.get(name)

      return row === undefined ? [] : [row]
    })
    const listed = await listOf($, cwd, trunkRef, trunkSha, candidates, fromFiles, keptSpreads)
    const isGuessed = !isNamed && here?.kind === 'lane' && here.index === index
    const found = spec.stagingPath === undefined && spec.stagingBranch === undefined ? undefined : await stageOf($, cwd, trunkRef, spec, now)
    // The call that already named what is live now carries each tag's date too, so the release history costs nothing more.
    // Newest by version, not by date: a tag's date can be a backfill, and version order also ranks date-named tags. Each keeps its own date for display.
    const tags = spec.tagPrefix === undefined ? '' : await git($, ['tag', '--sort=-v:refname', '--format=%(refname:strip=2)%09%(creatordate:unix)%09%(objectname)', '--list', `${spec.tagPrefix}*`], cwd)
    const tagged = releasesOf(tags, now).slice(0, MOST_LISTED)
    const releases = tagged.map(one => ({ name: one.name, at: one.at }))
    const live = tagged[0]?.name

    // Staging may sit behind the trunk and still hold just what is live: say so, so "behind" is not read as live being out of date.
    const liveSha = tagged[0]?.sha ?? ''
    // A staging folder on the trunk with no files of its own named has nothing to compare but the whole trunk, which says nothing, so it is left unsaid.
    const lanePaths = spec.paths ?? []
    const isComparable = found !== undefined && liveSha !== '' && (spec.stagingBranch !== undefined || lanePaths.length > 0)
    const isStagingLive = !isComparable ? undefined : await sameOf($, cwd, spec.id ?? spec.name, found.sha, liveSha, lanePaths, keptSames)

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
      ...(spec.id === undefined ? {} : { id: spec.id }),
      name: spec.name,
      branches: byName.length + extra,
      open: listed,
      ...(extra > 0 ? { byFiles: extra } : {}),
      isHere: mine.includes(branch) || isGuessed,
      ...(isGuessed ? { isGuessed: true } : {}),
      ...(spec.isParked === true ? { isParked: true } : {}),
      ...(found === undefined ? {} : { staging: found.stage }),
      ...(live === undefined || live === '' ? {} : { live }),
      ...(releases.length === 0 ? {} : { releases }),
      ...(isStagingLive === undefined ? {} : { isStagingLive }),
      ...(isPassed === undefined ? {} : { isPassed }),
      ...(hasYours === undefined ? {} : { hasYours }),
    })
  }

  // Your branch was looked at by its files and could not be placed: say so, rather than go quietly dark.
  const guess = isNamed || branch === trunkName || here === undefined || here.kind === 'lane' ? undefined : here.kind

  // Open branches in no lane, by name or by files: those past the placing cap are among them, since nothing placed them.
  // A lane's staging branch is a stage, not work in flight, so it is never loose either.
  const inLane = new Set([...named.flat(), ...placedIn.flat(), ...specs.flatMap(spec => (spec.stagingBranch === undefined ? [] : [spec.stagingBranch]))])
  const strays = rows.filter(row => row.name !== trunkName && !inLane.has(row.name) && isOpen(row.name))
  const loose = await listOf($, cwd, trunkRef, trunkSha, strays, [], keptSpreads)
  spreads = keptSpreads
  sames = keptSames

  // What could be cleaned up: merged into the trunk, and not the trunk itself or the branch checked out here.
  const unmerged = open
  const merged = unmerged === undefined ? undefined : heads.filter(head => head !== trunkName && head !== branch && !unmerged.has(head)).length

  // Clashes among open work: the trunk and staging branches are never work in flight.
  const stages = new Set(specs.flatMap(spec => (spec.stagingBranch === undefined ? [] : [spec.stagingBranch])))
  const working = rows.filter(row => row.name !== trunkName && !stages.has(row.name))
  const clashing = await readClashes(
    $,
    cwd,
    trunkRef,
    trunkSha,
    working.filter(row => isOpen(row.name)),
    working.filter(row => !isOpen(row.name)),
    branch,
    hereDirty,
    keptFiles,
    now,
  )
  keepFiles(keptFiles)
  for (const listed of [...lanes.flatMap(lane => lane.open ?? []), ...loose]) {
    const level = clashing.byBranch.get(listed.name)
    if (level !== undefined) listed.clash = level
  }
  const clash = clashing.byBranch.get(branch)

  return {
    lanes,
    ...(guess === undefined ? {} : { guess }),
    ...(merged === undefined ? {} : { merged }),
    loose,
    ...(clashing.clashes.length === 0 ? {} : { clashes: clashing.clashes }),
    ...(clash === undefined ? {} : { clash }),
  }
}
