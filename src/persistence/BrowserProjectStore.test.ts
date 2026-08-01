import { describe, expect, test } from 'bun:test'
import { createEmptyDocument } from '../core/document'
import {
  BrowserProjectStore,
  createMemoryPersistence,
} from './BrowserProjectStore'
import { ProjectConflictError } from './BridgeProjectStore'

describe('BrowserProjectStore', () => {
  test('open/save/readAsset round-trip and revision conflict', async () => {
    const db = createMemoryPersistence()
    const store = new BrowserProjectStore(db)

    const opened = await store.open({ kind: 'directory', path: '' })
    expect(opened.locator.path).toBe('browser:Untitled')
    expect(opened.document.name).toBe('Untitled')
    expect(store.openLocator?.path).toBe('browser:Untitled')

    const document = createEmptyDocument({
      name: 'Demo',
      width: 64,
      height: 48,
    })
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], {
      type: 'image/png',
    })
    const assetId = 'layer.demo1'

    const revision = await store.save({
      expectedRevision: opened.revision,
      document,
      assets: [
        {
          id: assetId,
          kind: 'layer',
          blob,
          width: 64,
          height: 48,
          mimeType: 'image/png',
        },
      ],
    })
    expect(revision).toBeTruthy()
    expect(revision).not.toBe(opened.revision)

    const read = await store.readAsset(assetId)
    expect(await read.arrayBuffer()).toEqual(await blob.arrayBuffer())

    await expect(
      store.save({
        expectedRevision: opened.revision,
        document,
        assets: [],
      }),
    ).rejects.toBeInstanceOf(ProjectConflictError)

    const reopened = await new BrowserProjectStore(db).open({
      kind: 'directory',
      path: 'browser:Untitled',
    })
    expect(reopened.revision).toBe(revision)
    expect(reopened.document.name).toBe('Demo')
    expect(reopened.assets[assetId]?.kind).toBe('layer')
  })

  test('normalizes custom browser paths and removes assets', async () => {
    const db = createMemoryPersistence()
    const store = new BrowserProjectStore(db)
    const opened = await store.open({
      kind: 'directory',
      path: 'MySketch.happyshop',
    })
    expect(opened.locator.path).toBe('browser:MySketch')

    const document = createEmptyDocument({ name: 'Sketch' })
    const assetId = 'layer.temp'
    await store.save({
      expectedRevision: opened.revision,
      document,
      assets: [
        {
          id: assetId,
          kind: 'layer',
          blob: new Blob([new Uint8Array([9])], { type: 'image/png' }),
        },
      ],
    })

    const afterAdd = await store.open({
      kind: 'directory',
      path: 'browser:MySketch',
    })
    const nextRev = await store.save({
      expectedRevision: afterAdd.revision,
      document,
      assets: [],
      removedAssetIds: [assetId],
    })
    expect(nextRev).toBeTruthy()

    await expect(store.readAsset(assetId)).rejects.toThrow('asset not found')

    const other = new BrowserProjectStore(db)
    const restored = await other.open({
      kind: 'directory',
      path: 'browser:MySketch',
    })
    expect(restored.document.name).toBe('Sketch')
    expect(restored.assets[assetId]).toBeUndefined()
  })

  test('createIndexedDbPersistence fails clearly without IndexedDB', async () => {
    if (typeof indexedDB !== 'undefined') return
    const store = new BrowserProjectStore()
    await expect(
      store.open({ kind: 'directory', path: '' }),
    ).rejects.toThrow('IndexedDB is unavailable')
  })
})
