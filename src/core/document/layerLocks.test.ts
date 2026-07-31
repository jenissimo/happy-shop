import { describe, expect, test } from 'bun:test'
import { createRasterLayer } from './factories'
import {
  isLayerFullyLocked,
  isLayerImageLocked,
  isLayerPositionLocked,
  isLayerTransparentPixelsLocked,
} from './layerLocks'

describe('layer lock helpers', () => {
  test('full lock blocks every granular check', () => {
    const layer = createRasterLayer({
      locked: true,
      lockFlags: {
        transparentPixels: false,
        imagePixels: false,
        position: false,
      },
    })
    expect(isLayerFullyLocked(layer)).toBe(true)
    expect(isLayerPositionLocked(layer)).toBe(true)
    expect(isLayerImageLocked(layer)).toBe(true)
    expect(isLayerTransparentPixelsLocked(layer)).toBe(true)
  })

  test('granular flags are independent when not fully locked', () => {
    const layer = createRasterLayer({
      lockFlags: {
        transparentPixels: true,
        imagePixels: false,
        position: true,
      },
    })
    expect(isLayerFullyLocked(layer)).toBe(false)
    expect(isLayerTransparentPixelsLocked(layer)).toBe(true)
    expect(isLayerImageLocked(layer)).toBe(false)
    expect(isLayerPositionLocked(layer)).toBe(true)
  })
})
