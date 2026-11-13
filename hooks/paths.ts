const SPECIAL = /[.+?^${}()|[\]\\]/g
const DOUBLE_SLASH = /\u0000S\u0000/g
const DOUBLE = /\u0000A\u0000/g

/**
 * A path glob, in the spelling a project's own track file uses: `**` spans
 * folders, `*` stays inside one.
 */
export const covers = (pattern: string, path: string): boolean => {
  const source = pattern
    .replace(SPECIAL, '\\$&')
    .split('**/')
    .join('\u0000S\u0000')
    .split('**')
    .join('\u0000A\u0000')
    .split('*')
    .join('[^/]*')
    .replace(DOUBLE_SLASH, '(?:.*/)?')
    .replace(DOUBLE, '.*')

  try {
    return new RegExp(`^${source}$`).test(path)
  } catch {
    return false
  }
}

/** A name pattern, where `*` stands for any run of characters. */
export const matches = (pattern: string, name: string): boolean => {
  const source = pattern.replace(SPECIAL, '\\$&').split('*').join('.*')

  try {
    return new RegExp(`^${source}$`).test(name)
  } catch {
    return false
  }
}

/**
 * Which lane owns most of a branch's changed files. A tie at the top is no
 * answer: a guess shown as a lane should never be a coin flip.
 */
export type Pick = { kind: 'lane'; index: number } | { kind: 'tied' } | { kind: 'none' }

export const pickLane = (files: readonly string[], lanePaths: readonly (readonly string[])[]): Pick | undefined => {
  if (files.length === 0) return undefined
  let best = -1
  let most = 0
  let isTied = false
  for (let index = 0; index < lanePaths.length; index += 1) {
    const globs = lanePaths[index] ?? []
    if (globs.length === 0) continue
    const count = files.filter(file => globs.some(glob => covers(glob, file))).length
    if (count === 0) continue
    if (count > most) {
      most = count
      best = index
      isTied = false
    } else if (count === most) {
      isTied = true
    }
  }
  if (best < 0) return { kind: 'none' }

  return isTied ? { kind: 'tied' } : { kind: 'lane', index: best }
}
