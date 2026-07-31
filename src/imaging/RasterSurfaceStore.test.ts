import { afterEach, describe, expect, test } from 'bun:test'
import {
  clearRasterSurfaceStore,
  getRasterSurface,
  listRasterSurfaceIds,
  registerRasterSurface,
  releaseRasterSurface,
} from './RasterSurfaceStore'

function fakeBitmap(): ImageBitmap {
  let closed = false
  return {
    close: () => {
      closed = true
    },
    get __closed() {
      return closed
    },
  } as unknown as ImageBitmap
}

afterEach(() => {
  clearRasterSurfaceStore()
})

describe('RasterSurfaceStore', () => {
  test('registers and retrieves an entry', () => {
    const bitmap = fakeBitmap()
    registerRasterSurface({ assetId: 'a1', width: 10, height: 20, bitmap })
    const entry = getRasterSurface('a1')
    expect(entry).toBeDefined()
    expect(entry?.width).toBe(10)
    expect(entry?.height).toBe(20)
    expect(entry?.bitmap).toBe(bitmap)
  })

  test('returns undefined for unknown ids', () => {
    expect(getRasterSurface('missing')).toBeUndefined()
  })

  test('lists all registered ids', () => {
    registerRasterSurface({ assetId: 'a1', width: 1, height: 1, bitmap: fakeBitmap() })
    registerRasterSurface({ assetId: 'a2', width: 1, height: 1, bitmap: fakeBitmap() })
    expect(listRasterSurfaceIds().sort()).toEqual(['a1', 'a2'])
  })

  test('release closes the bitmap and removes the entry', () => {
    const bitmap = fakeBitmap()
    registerRasterSurface({ assetId: 'a1', width: 1, height: 1, bitmap })
    releaseRasterSurface('a1')
    expect(getRasterSurface('a1')).toBeUndefined()
    expect((bitmap as unknown as { __closed: boolean }).__closed).toBe(true)
  })

  test('release on an unknown id is a no-op', () => {
    expect(() => releaseRasterSurface('missing')).not.toThrow()
  })

  test('re-registering the same id closes the previous bitmap', () => {
    const first = fakeBitmap()
    const second = fakeBitmap()
    registerRasterSurface({ assetId: 'a1', width: 1, height: 1, bitmap: first })
    registerRasterSurface({ assetId: 'a1', width: 2, height: 2, bitmap: second })
    expect((first as unknown as { __closed: boolean }).__closed).toBe(true)
    expect(getRasterSurface('a1')?.bitmap).toBe(second)
  })

  test('clearRasterSurfaceStore releases everything', () => {
    registerRasterSurface({ assetId: 'a1', width: 1, height: 1, bitmap: fakeBitmap() })
    registerRasterSurface({ assetId: 'a2', width: 1, height: 1, bitmap: fakeBitmap() })
    clearRasterSurfaceStore()
    expect(listRasterSurfaceIds()).toEqual([])
  })
})
