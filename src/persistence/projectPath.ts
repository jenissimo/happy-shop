import { assertSafeAssetId } from './assetId'

/**
 * Destination paths for "Save As".
 *
 * Character safety is delegated to `assertSafeAssetId` — the persistence
 * layer's existing client-safe guard (`[A-Za-z0-9._-]`), which already admits
 * no path separator, drive letter, URL scheme or NUL byte, so a name that
 * passes it can never address anything outside the project folder. The only
 * thing left to reject on top of it are the two segments that are legal
 * characters yet still mean "somewhere else": `.` and `..`.
 */

export const PROJECT_DIR = 'projects'
export const PROJECT_DIR_SUFFIX = '.happyshop'
export const BROWSER_PATH_PREFIX = 'browser:'

const TRAVERSAL_NAMES = new Set(['.', '..'])

/** Users type "My Art" or "My Art.happyshop"; both mean the same project. */
export function stripProjectSuffix(raw: string): string {
  return raw.trim().replace(/\.happyshop$/i, '')
}

export function assertSafeProjectName(raw: string): string {
  const name = stripProjectSuffix(raw)
  if (!name) throw new Error('Project name is required')
  if (TRAVERSAL_NAMES.has(name)) throw new Error('Invalid project name')
  try {
    return assertSafeAssetId(name)
  } catch {
    throw new Error(
      'Use letters, digits, dot, dash or underscore in the project name',
    )
  }
}

export function isSafeProjectName(raw: string): boolean {
  try {
    assertSafeProjectName(raw)
    return true
  } catch {
    return false
  }
}

/**
 * Build the locator path for a user-entered name.
 * `browser: true` targets the IndexedDB store (static hosting), otherwise the
 * Vite bridge writes `projects/<name>.happyshop` under the workspace root.
 */
export function projectPathForName(
  raw: string,
  options: { browser: boolean },
): string {
  const name = assertSafeProjectName(raw)
  return options.browser
    ? `${BROWSER_PATH_PREFIX}${name}`
    : `${PROJECT_DIR}/${name}${PROJECT_DIR_SUFFIX}`
}

/**
 * Re-validate a destination right before it reaches a ProjectStore, so a
 * caller that built the string by hand cannot smuggle a traversal through.
 */
export function assertSafeProjectPath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) throw new Error('Destination path is required')
  if (trimmed.startsWith(BROWSER_PATH_PREFIX)) {
    assertSafeProjectName(trimmed.slice(BROWSER_PATH_PREFIX.length))
    return trimmed
  }
  const segments = trimmed.split('/')
  if (segments.length !== 2 || segments[0] !== PROJECT_DIR) {
    throw new Error(`Destination must be a ${PROJECT_DIR}/ project directory`)
  }
  assertSafeProjectName(segments[1]!)
  return trimmed
}

/**
 * Display/prefill name for an already-bound project path. Tolerant on purpose:
 * the bridge hands back absolute OS paths that `assertSafeProjectPath` would
 * (correctly) refuse as a *destination*.
 */
export function projectNameFromPath(
  path: string | null | undefined,
): string | null {
  if (!path) return null
  const tail = path.startsWith(BROWSER_PATH_PREFIX)
    ? path.slice(BROWSER_PATH_PREFIX.length)
    : (path.split(/[/\\]/).pop() ?? '')
  return stripProjectSuffix(tail) || null
}
