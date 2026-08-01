import { createEmptyDocument } from '../core/document'
import { assertSafeAssetId } from './assetId'
import { createEmptyManifest, parseManifest } from './manifest'
import { ProjectConflictError } from './BridgeProjectStore'
import type {
  AssetId,
  ExportRequest,
  ProjectAssetDescriptor,
  ProjectLocator,
  ProjectManifest,
  ProjectRevision,
  ProjectSaveTransaction,
  ProjectSnapshot,
  ProjectStore,
} from './types'

const DB_NAME = 'happy-shop-projects'
const DB_VERSION = 1
const MANIFESTS = 'manifests'
const ASSETS = 'assets'

const DEFAULT_BROWSER_PATH = 'browser:Untitled'

export type ManifestRecord = {
  path: string
  manifest: ProjectManifest
}

export type AssetRecord = {
  key: string
  path: string
  assetId: string
  blob: Blob
  kind: ProjectAssetDescriptor['kind']
  width?: number
  height?: number
  mimeType?: string
}

/** Pluggable KV used by BrowserProjectStore (IndexedDB in prod, memory in tests). */
export type BrowserProjectPersistence = {
  getManifest(path: string): Promise<ManifestRecord | undefined>
  putManifest(record: ManifestRecord): Promise<void>
  getAsset(key: string): Promise<AssetRecord | undefined>
  putAsset(record: AssetRecord): Promise<void>
  deleteAsset(key: string): Promise<void>
  /** Atomic multi-write for save(). */
  commitSave(ops: {
    path: string
    manifest: ProjectManifest
    putAssets: AssetRecord[]
    removeAssetIds: string[]
  }): Promise<void>
}

function assetKey(path: string, assetId: string): string {
  return `${path}::${assetId}`
}

function normalizeBrowserPath(raw: string | null | undefined): string {
  const trimmed = raw?.trim()
  if (!trimmed) return DEFAULT_BROWSER_PATH
  if (trimmed.startsWith('browser:')) return trimmed
  return `browser:${trimmed.replace(/\.happyshop$/i, '') || 'Untitled'}`
}

function relativeForKind(
  kind: ProjectAssetDescriptor['kind'],
  id: string,
): string {
  const safe = assertSafeAssetId(id)
  if (kind === 'layer') return `layers/${safe}.png`
  if (kind === 'thumbnail') return `thumbnails/${safe}.webp`
  return `assets/${safe}.png`
}

async function revisionOfJson(value: unknown): Promise<ProjectRevision> {
  const payload = JSON.stringify(value)
  const data = new TextEncoder().encode(payload)
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-1', data)
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 12)
  }
  let hash = 2166136261
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i)!
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 12)
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(MANIFESTS)) {
        db.createObjectStore(MANIFESTS, { keyPath: 'path' })
      }
      if (!db.objectStoreNames.contains(ASSETS)) {
        const store = db.createObjectStore(ASSETS, { keyPath: 'key' })
        store.createIndex('byPath', 'path', { unique: false })
      }
    }
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB open failed'))
    request.onsuccess = () => resolve(request.result)
  })
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(storeName, mode).objectStore(storeName))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () =>
        reject(request.error ?? new Error('IndexedDB operation failed'))
    })
  } finally {
    db.close()
  }
}

export function createIndexedDbPersistence(): BrowserProjectPersistence {
  return {
    async getManifest(path) {
      return (await withStore<ManifestRecord | undefined>(
        MANIFESTS,
        'readonly',
        (store) => store.get(path),
      )) as ManifestRecord | undefined
    },
    async putManifest(record) {
      await withStore(MANIFESTS, 'readwrite', (store) => store.put(record))
    },
    async getAsset(key) {
      return (await withStore<AssetRecord | undefined>(
        ASSETS,
        'readonly',
        (store) => store.get(key),
      )) as AssetRecord | undefined
    },
    async putAsset(record) {
      await withStore(ASSETS, 'readwrite', (store) => store.put(record))
    },
    async deleteAsset(key) {
      await withStore(ASSETS, 'readwrite', (store) => store.delete(key))
    },
    async commitSave({ path, manifest, putAssets, removeAssetIds }) {
      const db = await openDatabase()
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction([MANIFESTS, ASSETS], 'readwrite')
          tx.oncomplete = () => resolve()
          tx.onerror = () =>
            reject(tx.error ?? new Error('IndexedDB transaction failed'))
          tx.onabort = () =>
            reject(tx.error ?? new Error('IndexedDB transaction aborted'))
          const manifests = tx.objectStore(MANIFESTS)
          const assets = tx.objectStore(ASSETS)
          for (const id of removeAssetIds) {
            assets.delete(assetKey(path, assertSafeAssetId(id)))
          }
          for (const row of putAssets) assets.put(row)
          manifests.put({ path, manifest } satisfies ManifestRecord)
        })
      } finally {
        db.close()
      }
    },
  }
}

/** In-memory persistence for unit tests (no IndexedDB required). */
export function createMemoryPersistence(): BrowserProjectPersistence {
  const manifests = new Map<string, ManifestRecord>()
  const assets = new Map<string, AssetRecord>()
  return {
    async getManifest(path) {
      const record = manifests.get(path)
      return record
        ? { path: record.path, manifest: structuredClone(record.manifest) }
        : undefined
    },
    async putManifest(record) {
      manifests.set(record.path, {
        path: record.path,
        manifest: structuredClone(record.manifest),
      })
    },
    async getAsset(key) {
      return assets.get(key)
    },
    async putAsset(record) {
      assets.set(record.key, record)
    },
    async deleteAsset(key) {
      assets.delete(key)
    },
    async commitSave({ path, manifest, putAssets, removeAssetIds }) {
      for (const id of removeAssetIds) {
        assets.delete(assetKey(path, assertSafeAssetId(id)))
      }
      for (const row of putAssets) assets.set(row.key, row)
      manifests.set(path, { path, manifest: structuredClone(manifest) })
    },
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Serverless ProjectStore for GitHub Pages / vite preview.
 * Manifests + PNG blobs live in IndexedDB; Recent list stays in localStorage.
 */
export class BrowserProjectStore implements ProjectStore {
  private locator: ProjectLocator | null = null
  private readonly db: BrowserProjectPersistence

  constructor(db: BrowserProjectPersistence = createIndexedDbPersistence()) {
    this.db = db
  }

  get openLocator(): ProjectLocator | null {
    return this.locator
  }

  async open(locator: ProjectLocator): Promise<ProjectSnapshot> {
    const path = normalizeBrowserPath(locator.path)
    let record = await this.db.getManifest(path)

    if (!record) {
      const document = createEmptyDocument({ name: 'Untitled' })
      const seed = createEmptyManifest(document, 'pending')
      const revision = await revisionOfJson({
        document: seed.document,
        assets: seed.assets,
      })
      const manifest = createEmptyManifest(document, revision)
      record = { path, manifest }
      await this.db.putManifest(record)
    } else {
      record = {
        path,
        manifest: parseManifest(record.manifest),
      }
    }

    this.locator = { kind: 'directory', path }
    return {
      locator: this.locator,
      revision: record.manifest.revision,
      document: record.manifest.document,
      assets: record.manifest.assets,
    }
  }

  async readAsset(id: AssetId, signal?: AbortSignal): Promise<Blob> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (!this.locator) throw new Error('no project open')
    const safe = assertSafeAssetId(id)
    const record = await this.db.getAsset(assetKey(this.locator.path, safe))
    if (!record?.blob) throw new Error('asset not found')
    return record.blob
  }

  async save(
    transaction: ProjectSaveTransaction,
    signal?: AbortSignal,
  ): Promise<ProjectRevision> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (!this.locator) throw new Error('no project open')
    const path = this.locator.path

    const existing = await this.db.getManifest(path)
    if (!existing) throw new Error('project not found — open first')

    const current = parseManifest(existing.manifest)
    if (
      transaction.expectedRevision != null &&
      transaction.expectedRevision !== current.revision
    ) {
      throw new ProjectConflictError(current.revision, current.document)
    }

    const nextAssets: ProjectManifest['assets'] = { ...current.assets }

    for (const id of transaction.removedAssetIds ?? []) {
      const safe = assertSafeAssetId(id)
      delete nextAssets[safe]
    }

    const putAssets: AssetRecord[] = []
    for (const asset of transaction.assets) {
      const safe = assertSafeAssetId(asset.id)
      nextAssets[safe] = {
        id: safe,
        relativePath: relativeForKind(asset.kind, safe),
        kind: asset.kind,
        width: asset.width,
        height: asset.height,
        mimeType: asset.mimeType ?? 'image/png',
      }
      putAssets.push({
        key: assetKey(path, safe),
        path,
        assetId: safe,
        blob: asset.blob,
        kind: asset.kind,
        width: asset.width,
        height: asset.height,
        mimeType: asset.mimeType ?? 'image/png',
      })
    }

    const draft: Omit<ProjectManifest, 'revision'> & { revision: string } = {
      schemaVersion: 1,
      revision: '',
      savedAt: new Date().toISOString(),
      document: transaction.document,
      assets: nextAssets,
    }
    const revision = await revisionOfJson({
      document: draft.document,
      assets: draft.assets,
      savedAt: draft.savedAt,
    })
    draft.revision = revision
    const manifest = parseManifest(draft)

    await this.db.commitSave({
      path,
      manifest,
      putAssets,
      removeAssetIds: transaction.removedAssetIds ?? [],
    })

    return revision
  }

  async exportFile(request: ExportRequest, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const base =
      request.destinationPath.split(/[/\\]/).pop()?.trim() ||
      `export.${request.format}`
    downloadBlob(request.blob, base)
  }
}

let singleton: BrowserProjectStore | null = null

export function getBrowserProjectStore(): BrowserProjectStore {
  if (!singleton) singleton = new BrowserProjectStore()
  return singleton
}

/** Test helper: drop in-memory singleton between cases. */
export function resetBrowserProjectStoreForTests(): void {
  singleton = null
}
