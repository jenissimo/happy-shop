import type { ImportedUserTip } from './abrImport'
import type { BrushTipDescriptor } from './tipDescriptor'
import type { TipAlpha } from './tipRegistry'

const DB_NAME = 'happy-shop-user-brushes'
const STORE = 'tips'

type StoredUserTip = {
  descriptor: BrushTipDescriptor
  alpha?: TipAlpha
}

function openDatabase(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(undefined)
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'descriptor.id' })
    request.onerror = () => reject(request.error ?? new Error('Could not open user brush storage'))
    request.onsuccess = () => resolve(request.result)
  })
}

export async function listUserTipDescriptors(): Promise<BrushTipDescriptor[]> {
  const database = await openDatabase()
  if (!database) return []
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE).objectStore(STORE).getAll()
    request.onerror = () => reject(request.error ?? new Error('Could not read user brushes'))
    request.onsuccess = () =>
      resolve(
        (request.result as StoredUserTip[])
          .map(({ descriptor }) => descriptor)
          .filter((descriptor) => descriptor.pack === 'user'),
      )
  })
}

export async function saveUserTips(tips: ImportedUserTip[]): Promise<void> {
  if (tips.length === 0) return
  const database = await openDatabase()
  if (!database) throw new Error('IndexedDB is unavailable; imported brushes cannot be saved')
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite')
    for (const tip of tips) transaction.objectStore(STORE).put(tip)
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save imported brushes'))
    transaction.oncomplete = () => resolve()
  })
  if (typeof navigator !== 'undefined') void navigator.storage?.persist?.()
}

export async function loadUserTipAlpha(id: string): Promise<TipAlpha | undefined> {
  const database = await openDatabase()
  if (!database) return undefined
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE).objectStore(STORE).get(id)
    request.onerror = () => reject(request.error ?? new Error('Could not read imported brush'))
    request.onsuccess = () => resolve((request.result as StoredUserTip | undefined)?.alpha)
  })
}
