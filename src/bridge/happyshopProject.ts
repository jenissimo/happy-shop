/**
 * Server-side Happy Shop project directory I/O (SPEC §13).
 * Layout:
 *   example.happyshop/
 *     manifest.json
 *     assets/
 *     layers/
 *     thumbnails/
 *     .cache/
 *     .staging/   (transient)
 */

import {
  createHash,
  randomBytes,
} from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, normalize, resolve } from 'node:path'
import { parseManifest, createEmptyManifest } from '../persistence/manifest.ts'
import { assertSafeAssetId, resolveUnderRoot } from './pathSafety.ts'
import type {
  ProjectAssetDescriptor,
  ProjectLocator,
  ProjectManifest,
  ProjectRevision,
} from '../persistence/types.ts'
import type { HappyDocument } from '../core/document/schema.ts'
import { createEmptyDocument } from '../core/document/factories.ts'
import { PATHS } from './paths.ts'

export type OpenedProject = {
  locator: ProjectLocator
  manifest: ProjectManifest
}

let opened: OpenedProject | null = null

export function getOpenedProject(): OpenedProject | null {
  return opened
}

function revisionOfBytes(buf: Buffer | string): ProjectRevision {
  return createHash('sha1').update(buf).digest('hex').slice(0, 12)
}

function ensureProjectDirs(root: string) {
  for (const sub of ['assets', 'layers', 'thumbnails', '.cache', '.staging']) {
    mkdirSync(join(root, sub), { recursive: true })
  }
}

function defaultUntitledPath(): string {
  const dir = join(PATHS.ROOT, 'projects', 'Untitled.happyshop')
  return normalize(dir)
}

export function openProjectDirectory(rawPath: string | null | undefined): OpenedProject {
  const path = normalize(
    rawPath && rawPath.trim()
      ? resolve(rawPath)
      : defaultUntitledPath(),
  )
  ensureProjectDirs(path)
  const manifestPath = join(path, 'manifest.json')
  let manifest: ProjectManifest
  if (existsSync(manifestPath)) {
    const raw = readFileSync(manifestPath, 'utf8')
    manifest = parseManifest(JSON.parse(raw))
  } else {
    const doc = createEmptyDocument({ name: 'Untitled' })
    const rev = revisionOfBytes(JSON.stringify(doc))
    manifest = createEmptyManifest(doc, rev)
    atomicWriteJson(manifestPath, manifest)
  }
  opened = { locator: { kind: 'directory', path }, manifest }
  return opened
}

export function readOpenedSnapshot(): OpenedProject {
  if (!opened) {
    return openProjectDirectory(null)
  }
  // Refresh manifest from disk so external edits are visible.
  const manifestPath = join(opened.locator.path, 'manifest.json')
  if (existsSync(manifestPath)) {
    opened.manifest = parseManifest(
      JSON.parse(readFileSync(manifestPath, 'utf8')),
    )
  }
  return opened
}

function atomicWriteJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  const body = `${JSON.stringify(value, null, 2)}\n`
  writeFileSync(tmp, body, 'utf8')
  renameSync(tmp, path)
}

function atomicWriteBytes(path: string, bytes: Buffer) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, bytes)
  renameSync(tmp, path)
}

function relativeForKind(kind: string, id: string): string {
  const safe = assertSafeAssetId(id)
  if (kind === 'layer') return `layers/${safe}.png`
  if (kind === 'thumbnail') return `thumbnails/${safe}.webp`
  return `assets/${safe}.png`
}

export function stageAsset(
  id: string,
  kind: string,
  bytes: Buffer,
  meta: { width?: number; height?: number; mimeType?: string },
): ProjectAssetDescriptor {
  const project = readOpenedSnapshot()
  const relativePath = relativeForKind(kind, id)
  const abs = resolveUnderRoot(project.locator.path, relativePath)
  const stagingRel = `.staging/${randomBytes(8).toString('hex')}-${assertSafeAssetId(id)}`
  const stagingAbs = resolveUnderRoot(project.locator.path, stagingRel)
  writeFileSync(stagingAbs, bytes)
  // Promote into final location (still before manifest commit).
  mkdirSync(dirname(abs), { recursive: true })
  renameSync(stagingAbs, abs)

  const descriptor: ProjectAssetDescriptor = {
    id: assertSafeAssetId(id),
    relativePath,
    kind: kind === 'layer' || kind === 'thumbnail' ? (kind as 'layer' | 'thumbnail') : 'asset',
    width: meta.width,
    height: meta.height,
    mimeType: meta.mimeType ?? 'image/png',
  }
  project.manifest.assets[descriptor.id] = descriptor
  return descriptor
}

export function readAssetBytes(id: string): Buffer {
  const project = readOpenedSnapshot()
  const safe = assertSafeAssetId(id)
  const desc = project.manifest.assets[safe]
  if (!desc) throw new Error('asset not found')
  const abs = resolveUnderRoot(project.locator.path, desc.relativePath)
  if (!existsSync(abs)) throw new Error('asset file missing')
  return readFileSync(abs)
}

export function deleteUnusedAsset(id: string): void {
  const project = readOpenedSnapshot()
  const safe = assertSafeAssetId(id)
  const desc = project.manifest.assets[safe]
  if (!desc) return
  const abs = resolveUnderRoot(project.locator.path, desc.relativePath)
  if (existsSync(abs)) unlinkSync(abs)
  delete project.manifest.assets[safe]
}

export type SaveProjectBody = {
  expectedRevision: string | null
  document: HappyDocument
  removedAssetIds?: string[]
  assetIds?: string[]
}

export type SaveProjectResult =
  | { ok: true; revision: ProjectRevision; manifest: ProjectManifest }
  | {
      ok: false
      conflict: true
      currentRevision: ProjectRevision
      document: HappyDocument
    }

/**
 * Atomic save: assets already staged on disk; write manifest last via
 * temp + rename. `expectedRevision` prevents silent overwrite.
 */
export function saveProject(body: SaveProjectBody): SaveProjectResult {
  const project = readOpenedSnapshot()
  const current = project.manifest.revision
  if (
    body.expectedRevision != null &&
    body.expectedRevision !== current
  ) {
    return {
      ok: false,
      conflict: true,
      currentRevision: current,
      document: project.manifest.document,
    }
  }

  for (const id of body.removedAssetIds ?? []) {
    try {
      deleteUnusedAsset(id)
    } catch {
      /* ignore missing */
    }
  }

  const nextAssets = { ...project.manifest.assets }
  // Drop assets not referenced and not in the just-written set if removed.
  const manifest: ProjectManifest = {
    schemaVersion: 1,
    revision: '', // filled below
    savedAt: new Date().toISOString(),
    document: body.document,
    assets: nextAssets,
  }
  const payload = JSON.stringify(manifest)
  const revision = revisionOfBytes(payload)
  manifest.revision = revision

  const manifestPath = join(project.locator.path, 'manifest.json')
  atomicWriteJson(manifestPath, manifest)
  project.manifest = manifest

  // Best-effort staging cleanup
  const staging = join(project.locator.path, '.staging')
  if (existsSync(staging)) {
    try {
      rmSync(staging, { recursive: true, force: true })
      mkdirSync(staging, { recursive: true })
    } catch {
      /* ignore */
    }
  }

  return { ok: true, revision, manifest }
}

export function writeExportFile(
  destinationPath: string,
  bytes: Buffer,
): { path: string } {
  // Exports may target outside the project; restrict to PATHS.ROOT.
  const abs = resolveUnderRoot(PATHS.ROOT, destinationPath)
  atomicWriteBytes(abs, bytes)
  return { path: abs }
}
