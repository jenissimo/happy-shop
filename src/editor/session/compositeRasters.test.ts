import { beforeEach, describe, expect, test } from 'bun:test'
import {
  addLayer,
  asRasterAssetRef,
  createEmptyDocument,
  createRasterLayer,
} from '../../core/document'
import {
  clearEditableSurfaces,
  clearRasterSurfaceStore,
} from '../../imaging'
import { TiledRasterSurface } from '../../imaging/surfaces/TiledRasterSurface'
import { setEditableSurface } from '../../imaging/surfaces/EditableSurfaceStore'
import {
  compositeRasterLayers,
  compositeRasterLayersSync,
  sampleMergedColorAt,
} from './compositeRasters'

describe('compositeRasters', () => {
  beforeEach(() => {
    clearRasterSurfaceStore()
    clearEditableSurfaces()
  })

  test('sampleMergedColorAt returns blended visible color', async () => {
    const bottom = createRasterLayer({
      name: 'Bottom',
      pixels: asRasterAssetRef('c-a'),
    })
    const top = createRasterLayer({
      name: 'Top',
      pixels: asRasterAssetRef('c-b'),
    })
    const a = new TiledRasterSurface('c-a', 8, 8)
    const b = new TiledRasterSurface('c-b', 8, 8)
    const red = new Uint8ClampedArray(8 * 8 * 4)
    const blue = new Uint8ClampedArray(8 * 8 * 4)
    for (let i = 0; i < 64; i++) {
      red[i * 4] = 255
      red[i * 4 + 3] = 255
      blue[i * 4 + 2] = 255
      blue[i * 4 + 3] = 255
    }
    a.writeRegion({ x: 0, y: 0, width: 8, height: 8 }, red)
    b.writeRegion({ x: 0, y: 0, width: 8, height: 8 }, blue)
    setEditableSurface(a)
    setEditableSurface(b)
    let doc = addLayer(createEmptyDocument({ width: 8, height: 8 }), bottom)
    doc = addLayer(doc, top)

    const rgb = await sampleMergedColorAt(doc, 3, 3)
    expect(rgb).toEqual({ r: 0, g: 0, b: 255 })
  })

  test('compositeRasterLayers respects applyLayerOpacity: false', async () => {
    const layer = createRasterLayer({
      name: 'Dim',
      pixels: asRasterAssetRef('c-dim'),
      opacity: 0.5,
    })
    const surface = new TiledRasterSurface('c-dim', 4, 4)
    const rgba = new Uint8ClampedArray(4 * 4 * 4)
    for (let i = 0; i < 16; i++) {
      rgba[i * 4] = 200
      rgba[i * 4 + 3] = 255
    }
    surface.writeRegion({ x: 0, y: 0, width: 4, height: 4 }, rgba)
    setEditableSurface(surface)

    const withOpacity = await compositeRasterLayers(
      [layer],
      { x: 0, y: 0, width: 4, height: 4 },
      { applyLayerOpacity: true },
    )
    const without = await compositeRasterLayers(
      [layer],
      { x: 0, y: 0, width: 4, height: 4 },
      { applyLayerOpacity: false },
    )
    expect(withOpacity!.rgba[3]).toBe(128)
    expect(without!.rgba[3]).toBe(255)
  })

  test('compositeRasterLayersSync matches async when surfaces are resident', async () => {
    const layer = createRasterLayer({
      name: 'Dim',
      pixels: asRasterAssetRef('c-sync'),
      opacity: 0.5,
    })
    const surface = new TiledRasterSurface('c-sync', 4, 4)
    const rgba = new Uint8ClampedArray(4 * 4 * 4)
    for (let i = 0; i < 16; i++) {
      rgba[i * 4] = 200
      rgba[i * 4 + 3] = 255
    }
    surface.writeRegion({ x: 0, y: 0, width: 4, height: 4 }, rgba)
    setEditableSurface(surface)

    const region = { x: 0, y: 0, width: 4, height: 4 }
    const sync = compositeRasterLayersSync([layer], region)
    const asyncResult = await compositeRasterLayers([layer], region)
    expect(sync!.rgba).toEqual(asyncResult!.rgba)
  })
})
