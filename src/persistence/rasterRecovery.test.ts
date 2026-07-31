import { afterEach, describe, expect, test } from 'bun:test'
import {
  addLayer,
  asRasterAssetRef,
  createEmptyDocument,
  createRasterLayer,
} from '../core/document'
import {
  clearRasterSurfaceStore,
  registerRasterSurface,
} from '../imaging/RasterSurfaceStore'
import {
  canRecoverGeneration,
  RECOVERY_BUDGET_BYTES,
  type RecoveryGeneration,
} from './rasterRecovery'
import type { RecoveryJournalEntry } from './recoveryJournal'

const fakeBitmap = (width: number, height: number) => ({
  width,
  height,
  close() {},
}) as ImageBitmap

function fixture() {
  const assetId = 'raster-a'
  const layer = createRasterLayer({ pixels: asRasterAssetRef(assetId) })
  const document = addLayer(createEmptyDocument({ name: 'Saved' }), layer)
  registerRasterSurface({ assetId, width: 10, height: 20, bitmap: fakeBitmap(10, 20) })
  const generation: RecoveryGeneration = {
    id: 'generation-a',
    documentId: document.id,
    projectPath: 'C:/Saved.happyshop',
    revision: 'revision-a',
    createdAt: '2026-01-01T00:00:00.000Z',
    byteSize: 123,
    assets: [{
      assetId,
      width: 10,
      height: 20,
      digest: 'a'.repeat(64),
      blob: new Blob(['png'], { type: 'image/png' }),
    }],
  }
  const journal: RecoveryJournalEntry = {
    version: 2,
    savedAt: generation.createdAt,
    projectPath: generation.projectPath,
    revision: generation.revision,
    documentId: document.id,
    documentName: document.name,
    dirty: true,
    generationId: generation.id,
  }
  return { document, generation, journal }
}

describe('bounded raster recovery validation', () => {
  afterEach(() => clearRasterSurfaceStore())

  test('accepts only a matching durable project and raster dimensions', () => {
    const { document, generation, journal } = fixture()
    expect(canRecoverGeneration(generation, journal, document, {
      projectPath: 'C:/Saved.happyshop',
      revision: 'revision-a',
    })).toBe(true)
  })

  test('rejects a stale revision or dimension mismatch without replacing pixels', () => {
    const { document, generation, journal } = fixture()
    expect(canRecoverGeneration(generation, journal, document, {
      projectPath: 'C:/Saved.happyshop',
      revision: 'revision-b',
    })).toBe(false)

    registerRasterSurface({
      assetId: generation.assets[0]!.assetId,
      width: 10,
      height: 21,
      bitmap: fakeBitmap(10, 21),
    })
    expect(canRecoverGeneration(generation, journal, document, {
      projectPath: 'C:/Saved.happyshop',
      revision: 'revision-a',
    })).toBe(false)
  })

  test('keeps the profile budget at 32 MiB', () => {
    expect(RECOVERY_BUDGET_BYTES).toBe(32 * 1024 * 1024)
  })
})
