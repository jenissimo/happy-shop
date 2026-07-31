import { describe, expect, test } from 'bun:test'
import { createRasterLayer } from '../../core/document'
import { TiledRasterSurface } from '../../imaging/surfaces/TiledRasterSurface'
import { buildPaintClip } from './paintClip'

describe('buildPaintClip', () => {
  test('transparent-pixels lock clips to existing alpha', () => {
    const surface = new TiledRasterSurface('clip-test', 8, 8)
    surface.stampBrush({
      x: 3,
      y: 3,
      radius: 1,
      hardness: 1,
      opacity: 1,
      color: { r: 255, g: 0, b: 0 },
      mode: 'paint',
    })
    const layer = createRasterLayer({
      lockFlags: { transparentPixels: true, imagePixels: false, position: false },
    })
    const clip = buildPaintClip(layer, surface)
    expect(clip?.(3, 3)).toBe(1)
    expect(clip?.(0.5, 0.5)).toBe(0)
  })
})
