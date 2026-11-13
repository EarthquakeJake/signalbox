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
