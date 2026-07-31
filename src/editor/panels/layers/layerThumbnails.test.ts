import { describe, expect, test } from 'bun:test'
import {
  asRasterAssetRef,
  createRasterLayer,
  createShapeLayer,
  type CssColor,
} from '../../../core/document'
import { layerThumbDirtyKey } from './layerThumbnails'

describe('layerThumbDirtyKey', () => {
  test('raster key includes pixels + epoch', () => {
    const layer = createRasterLayer({
      name: 'R',
      pixels: asRasterAssetRef('asset-a'),
    })
    const a = layerThumbDirtyKey(layer, 1)
    const b = layerThumbDirtyKey(layer, 2)
    expect(a).not.toBe(b)
    expect(a).toContain('asset-a')
  })

  test('shape key changes with fill color', () => {
    const layer = createShapeLayer({
      name: 'S',
      primitive: 'rect',
      bounds: { x: 0, y: 0, w: 10, h: 10 },
    })
    const before = layerThumbDirtyKey(layer, 0)
    const after = layerThumbDirtyKey(
      {
        ...layer,
        fill: { ...layer.fill, color: '#ff0000' as CssColor },
      },
      0,
    )
    expect(before).not.toBe(after)
  })
})
