import { beforeEach, describe, expect, test } from 'bun:test'
import { createRasterEntry } from '../../../core/history/rasterEntry'
import { TiledRasterSurface } from '../../../imaging/surfaces/TiledRasterSurface'
import { resetDocumentHistory, documentHistory } from '../../session/documentHistory'
import { captureSurfaceAtHistoryDepth } from './historySurfaceSnapshot'

function pixel(data: Uint8ClampedArray, width: number, x: number, y: number): number[] {
  const i = (y * width + x) * 4
  return [...data.slice(i, i + 4)]
}

function pushRetouchStep(surface: TiledRasterSurface, label: string): void {
  surface.beginStrokeCapture()
  surface.retouchDab({ kind: 'blur', x: 8, y: 8, radius: 1, strength: 1 })
  documentHistory.push(createRasterEntry({ label, patch: surface.endStrokeCapture() }))
}

describe('captureSurfaceAtHistoryDepth', () => {
  beforeEach(() => {
    resetDocumentHistory()
  })

  test('returns present pixels at current depth', () => {
    const surface = new TiledRasterSurface('layer', 16, 16)
    surface.writeRegion({ x: 4, y: 4, width: 1, height: 1 }, new Uint8ClampedArray([200, 30, 10, 255]))

    const snapshot = captureSurfaceAtHistoryDepth(surface, documentHistory.undoCount)
    expect(pixel(snapshot, 16, 4, 4)).toEqual([200, 30, 10, 255])
  })

  test('reconstructs an earlier raster state without jumping history', () => {
    const surface = new TiledRasterSurface('layer', 16, 16)
    surface.writeRegion({ x: 8, y: 8, width: 1, height: 1 }, new Uint8ClampedArray([200, 30, 10, 255]))
    const before = pixel(surface.toRgbaBuffer().data, 16, 8, 8)

    pushRetouchStep(surface, 'Blur dab')
    expect(documentHistory.undoCount).toBe(1)
    expect(pixel(surface.toRgbaBuffer().data, 16, 8, 8)).not.toEqual(before)

    const snapshot = captureSurfaceAtHistoryDepth(surface, 0)
    expect(pixel(snapshot, 16, 8, 8)).toEqual(before)
  })
})
