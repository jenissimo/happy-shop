import type { GoogleFontLicense } from './catalogTypes'

export type CachedFontKey = {
  id: string
  weight: number
  style: 'normal' | 'italic'
  version: string
  /** Stable hash of sorted axis tag:value pairs for variable-font pins. */
  variationPin?: string
}

export type CachedFontRecord = CachedFontKey & {
  bytes: ArrayBuffer
  family: string
  license: GoogleFontLicense
  licenseText: string
  sourceUrl: string
  fetchedAt: number
  byteLength: number
  /** Axis snapshot used when registering/baking a variable pin. */
  pinnedAxes?: Record<string, number>
}

const DB_NAME = 'happy-shop-fonts'
const STORE = 'fonts'
const memory = new Map<string, CachedFontRecord>()

function keyOf(key: CachedFontKey): string {
  const pin = key.variationPin ? `__pin_${key.variationPin}` : ''
  return `${key.id}__${key.weight}__${key.style}__${key.version}${pin}`
}

function db(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(undefined)
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' })
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

export async function getCachedGoogleFont(key: CachedFontKey): Promise<CachedFontRecord | undefined> {
  const id = keyOf(key)
  const local = memory.get(id)
  if (local) return local
  const database = await db()
  if (!database) return undefined
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE).objectStore(STORE).get(id)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const value = request.result as (CachedFontRecord & { key: string }) | undefined
      if (value) {
        const { key: _key, ...record } = value
        memory.set(id, record)
        resolve(record)
      } else resolve(undefined)
    }
  })
}

export async function putCachedGoogleFont(record: CachedFontRecord): Promise<void> {
  const id = keyOf(record)
  memory.set(id, record)
  const database = await db()
  if (!database) return
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE, 'readwrite').objectStore(STORE).put({ ...record, key: id })
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
  if (typeof navigator !== 'undefined') void navigator.storage?.persist?.()
}

export async function deleteCachedGoogleFont(key: CachedFontKey): Promise<void> {
  const id = keyOf(key)
  memory.delete(id)
  const database = await db()
  if (!database) return
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE, 'readwrite').objectStore(STORE).delete(id)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function listCachedGoogleFonts(): Promise<CachedFontRecord[]> {
  const database = await db()
  if (!database) return [...memory.values()]
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE).objectStore(STORE).getAll()
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result.map(({ key: _key, ...record }) => record))
  })
}

export async function clearCachedGoogleFonts(): Promise<void> {
  memory.clear()
  const database = await db()
  if (!database) return
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE, 'readwrite').objectStore(STORE).clear()
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

/** Test-only escape hatch; production always reads IndexedDB. */
export function clearGoogleFontMemoryCacheForTests(): void {
  memory.clear()
}
