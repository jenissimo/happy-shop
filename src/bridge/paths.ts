/**
 * Resolve the host project root and content directories.
 *
 * Resolution order for ROOT:
 * 1. HAPPY_SHOP_ROOT (absolute or cwd-relative)
 * 2. process.cwd() when it has .happy-shop/project.json
 * 3. Package root of this repo (fixture/demo layout)
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Always the Happy Shop package. */
export const PACKAGE_ROOT = normalize(
  join(fileURLToPath(new URL('../..', import.meta.url))),
)

export type ProjectConfig = {
  version: 1
  /** Document JSON directory, relative to project root. */
  documentRoot: string
  /** Document opened when workspace has no activeDocument. */
  defaultDocument?: string
}

export type ProjectPaths = {
  root: string
  packageRoot: string
  documentsDir: string
  editorDir: string
  config: ProjectConfig
  rootSource: 'env' | 'cwd' | 'package'
}

const DEFAULT_CONFIG: ProjectConfig = {
  version: 1,
  documentRoot: 'demo/documents',
  defaultDocument: 'demo',
}

function hasProjectConfig(dir: string): boolean {
  return existsSync(join(dir, '.happy-shop', 'project.json'))
}

function envRoot(): string | null {
  const raw = process.env.HAPPY_SHOP_ROOT?.trim()
  if (!raw) return null
  return normalize(isAbsolute(raw) ? raw : resolve(process.cwd(), raw))
}

function resolveRoot(): { root: string; rootSource: ProjectPaths['rootSource'] } {
  const fromEnv = envRoot()
  if (fromEnv) return { root: fromEnv, rootSource: 'env' }

  const cwd = normalize(process.cwd())
  if (hasProjectConfig(cwd)) {
    return { root: cwd, rootSource: 'cwd' }
  }

  return { root: PACKAGE_ROOT, rootSource: 'package' }
}

function mergeConfig(
  base: ProjectConfig,
  raw: Partial<ProjectConfig> | null,
): ProjectConfig {
  if (!raw) return base
  return {
    version: 1,
    documentRoot: raw.documentRoot ?? base.documentRoot,
    defaultDocument: raw.defaultDocument ?? base.defaultDocument,
  }
}

export function readProjectConfigFile(
  editorDir: string,
): Partial<ProjectConfig> | null {
  const path = join(editorDir, 'project.json')
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Partial<ProjectConfig>
  } catch {
    return null
  }
}

export function writeProjectConfig(editorDir: string, config: ProjectConfig) {
  mkdirSync(editorDir, { recursive: true })
  const path = join(editorDir, 'project.json')
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

export function resolveProjectPaths(overrideRoot?: string): ProjectPaths {
  const { root: detected, rootSource } = overrideRoot
    ? {
        root: normalize(
          isAbsolute(overrideRoot)
            ? overrideRoot
            : resolve(process.cwd(), overrideRoot),
        ),
        rootSource: 'env' as const,
      }
    : resolveRoot()

  const editorDir = join(detected, '.happy-shop')
  const config = mergeConfig(DEFAULT_CONFIG, readProjectConfigFile(editorDir))

  return {
    root: detected,
    packageRoot: PACKAGE_ROOT,
    documentsDir: join(detected, config.documentRoot),
    editorDir,
    config,
    rootSource,
  }
}

let cached: ProjectPaths | null = null

export function getProjectPaths(): ProjectPaths {
  if (!cached) cached = resolveProjectPaths()
  return cached
}

export function resetProjectPathsCache() {
  cached = null
}

export function ensureProjectConfig(): ProjectConfig {
  const paths = getProjectPaths()
  if (!existsSync(join(paths.editorDir, 'project.json'))) {
    writeProjectConfig(paths.editorDir, paths.config)
  }
  return paths.config
}

export function ensureEditorDirs() {
  const paths = getProjectPaths()
  mkdirSync(paths.editorDir, { recursive: true })
  mkdirSync(join(paths.editorDir, 'layouts'), { recursive: true })
  mkdirSync(paths.documentsDir, { recursive: true })
  ensureProjectConfig()
}

export function atomicWrite(path: string, contents: string) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, contents, 'utf8')
  renameSync(tmp, path)
}

export function revisionOf(contents: string): string {
  return createHash('sha1').update(contents).digest('hex').slice(0, 12)
}

/** Cached path aliases used by the bridge plugin. */
export const PATHS = {
  get ROOT() {
    return getProjectPaths().root
  },
  get PACKAGE_ROOT() {
    return getProjectPaths().packageRoot
  },
  get EDITOR_DIR() {
    return getProjectPaths().editorDir
  },
  get DOCUMENTS_DIR() {
    return getProjectPaths().documentsDir
  },
  get PROJECT_CONFIG() {
    return getProjectPaths().config
  },
  get PROJECT_ROOT_SOURCE() {
    return getProjectPaths().rootSource
  },
}
