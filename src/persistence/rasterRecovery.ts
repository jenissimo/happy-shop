import type { HappyDocument } from '../core/document'
import {
  getRasterSurface,
  registerRasterSurface,
} from '../imaging/RasterSurfaceStore'
import { encodeSurfaceToPng } from './encodeSurfacePng'
import {
  clearRecoveryJournal,
  readRecoveryJournal,
  writeRecoveryJournal,
  type RecoveryJournalEntry,
} from './recoveryJournal'
import {
  clearDirtyRasterRecoveryAssets,
  getDirtyRasterRecoveryAssetIds,
} from './rasterRecoveryDirty'

export const RECOVERY_BUDGET_BYTES = 32 * 1024 * 1024
const DB_NAME = 'happy-shop-raster-recovery'
const STORE = 'generations'
const VERSION = 1

export type RecoveryAsset = {
  assetId: string
  width: number
  height: number
  digest: string
  blob: Blob
}

export type RecoveryGeneration = {
  id: string
  documentId: string
  projectPath: string
  revision: string
  createdAt: string
  byteSize: number
  assets: RecoveryAsset[]
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'))
      return
    }
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
    request.onsuccess = () => resolve(request.result)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('IndexedDB operation failed'))
    })
  } finally {
    db.close()
  }
}

async function listGenerations(): Promise<RecoveryGeneration[]> {
  return (await withStore('readonly', (store) => store.getAll())) as RecoveryGeneration[]
}

async function deleteGeneration(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id))
}

function newGenerationId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `recovery-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function sha256(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 is unavailable')
  const bytes = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function rasterAssetIds(document: HappyDocument): string[] {
  const documentAssets = new Set(Object.values(document.layers)
    .filter((layer) => layer.type === 'raster')
    .map((layer) => String(layer.pixels)))
  return getDirtyRasterRecoveryAssetIds().filter((assetId) => documentAssets.has(assetId))
}

/**
 * Validation is deliberately metadata-only until each blob is SHA-256 checked.
 * This prevents journal data from replacing pixels in a different project.
 */
export function canRecoverGeneration(
  generation: RecoveryGeneration,
  journal: RecoveryJournalEntry,
  document: HappyDocument,
  project: { projectPath: string | null; revision: string | null },
): boolean {
  if (
    journal.generationId !== generation.id ||
    !journal.dirty ||
    !project.projectPath ||
    !project.revision ||
    journal.projectPath !== project.projectPath ||
    journal.revision !== project.revision ||
    generation.projectPath !== project.projectPath ||
    generation.revision !== project.revision ||
    journal.documentId !== document.id ||
    generation.documentId !== document.id ||
    generation.assets.length === 0
  ) return false
  const documentAssets = new Map(
    Object.values(document.layers)
      .filter((layer) => layer.type === 'raster')
      .map((layer) => [String(layer.pixels), layer]),
  )
  return generation.assets.every((asset) => {
    const layer = documentAssets.get(asset.assetId)
    const durableSurface = getRasterSurface(asset.assetId)
    return Boolean(
      layer &&
      durableSurface &&
      durableSurface.width === asset.width &&
      durableSurface.height === asset.height &&
      asset.width > 0 &&
      asset.height > 0 &&
      asset.digest.length === 64,
    )
  })
}

export async function writeRasterRecoveryGeneration(
  document: HappyDocument,
  project: { projectPath: string | null; revision: string | null },
): Promise<{ ok: true; generationId: string } | { ok: false; error: string }> {
  if (!project.projectPath || !project.revision) {
    return { ok: false, error: 'Save the project once before raster recovery is available.' }
  }

  try {
    // PNG conversion runs after the edit flush, never in pointer-move handling.
    const assets = await Promise.all(rasterAssetIds(document).map(async (assetId) => {
      const surface = getRasterSurface(assetId)
      if (!surface) throw new Error(`Raster surface ${assetId} is unavailable`)
      const blob = await encodeSurfaceToPng(surface)
      return {
        assetId,
        width: surface.width,
        height: surface.height,
        digest: await sha256(blob),
        blob,
      }
    }))
    const byteSize = assets.reduce((total, asset) => total + asset.blob.size, 0)
    if (assets.length === 0 || byteSize > RECOVERY_BUDGET_BYTES) {
      return { ok: false, error: 'Raster recovery exceeds the 32 MiB local budget.' }
    }

    const existing = await listGenerations()
    const sameDocument = existing.filter((entry) => entry.documentId === document.id)
    let retainedBytes = existing
      .filter((entry) => entry.documentId !== document.id)
      .reduce((total, entry) => total + entry.byteSize, 0)
    // Evict oldest unrelated generations before committing. The previous
    // generation for this document is intentionally retained until success.
    for (const entry of existing
      .filter((entry) => entry.documentId !== document.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      if (retainedBytes + byteSize <= RECOVERY_BUDGET_BYTES) break
      await deleteGeneration(entry.id)
      retainedBytes -= entry.byteSize
    }
    if (retainedBytes + byteSize > RECOVERY_BUDGET_BYTES) {
      return { ok: false, error: 'Raster recovery exceeds the 32 MiB local budget.' }
    }

    const generation: RecoveryGeneration = {
      id: newGenerationId(),
      documentId: document.id,
      projectPath: project.projectPath,
      revision: project.revision,
      createdAt: new Date().toISOString(),
      byteSize,
      assets,
    }
    await withStore('readwrite', (store) => store.put(generation))

    // Commit the tiny journal pointer only after every PNG blob is durable.
    if (!writeRecoveryJournal({
      version: 2,
      savedAt: generation.createdAt,
      projectPath: project.projectPath,
      revision: project.revision,
      documentId: document.id,
      documentName: document.name,
      dirty: true,
      generationId: generation.id,
    })) {
      // The previous pointer and its complete generation remain usable.
      await deleteGeneration(generation.id).catch(() => undefined)
      return { ok: false, error: 'Recovery journal is unavailable.' }
    }
    for (const previous of sameDocument) await deleteGeneration(previous.id)
    return { ok: true, generationId: generation.id }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Raster recovery unavailable' }
  }
}

export async function getPendingRasterRecovery(
  document: HappyDocument,
  project: { projectPath: string | null; revision: string | null },
): Promise<RecoveryGeneration | null> {
  const journal = readRecoveryJournal()
  const generationId = journal?.generationId
  if (!journal || !generationId) return null
  const key: IDBValidKey = generationId
  try {
    const generation = await withStore('readonly', (store) => store.get(key)) as RecoveryGeneration | undefined
    return generation && canRecoverGeneration(generation, journal, document, project)
      ? generation
      : null
  } catch {
    return null
  }
}

export async function recoverPendingRasterGeneration(
  document: HappyDocument,
  project: { projectPath: string | null; revision: string | null },
): Promise<boolean> {
  const generation = await getPendingRasterRecovery(document, project)
  if (!generation) return false
  try {
    for (const asset of generation.assets) {
      if (await sha256(asset.blob) !== asset.digest) return false
      const bitmap = await createImageBitmap(asset.blob)
      if (bitmap.width !== asset.width || bitmap.height !== asset.height) {
        bitmap.close()
        return false
      }
      registerRasterSurface({ assetId: asset.assetId, width: asset.width, height: asset.height, bitmap, sourceBlob: asset.blob })
    }
    return true
  } catch {
    return false
  }
}

export async function discardRasterRecovery(): Promise<void> {
  const journal = readRecoveryJournal()
  if (journal?.generationId) {
    try {
      await deleteGeneration(journal.generationId)
    } catch {
      // The journal is still cleared: malformed/unavailable bytes must not prompt forever.
    }
  }
  clearRecoveryJournal()
  clearDirtyRasterRecoveryAssets()
}

export async function clearRasterRecoveryAfterSave(): Promise<void> {
  await discardRasterRecovery()
}
