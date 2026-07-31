import { describe, expect, test } from 'bun:test'
import { LAYER_EDGE_PAD, createColorLayerTexture } from './layerTextures'

describe('createColorLayerTexture', () => {
  test('linear mode pads by 1px for soft preview edges', () => {
    const texture = createColorLayerTexture(420, 260, 'linear')
    expect(texture.width).toBe(420 + LAYER_EDGE_PAD * 2)
    expect(texture.height).toBe(260 + LAYER_EDGE_PAD * 2)
    expect(texture.source.scaleMode).toBe('linear')
    texture.destroy(true)
  })

  test('nearest mode matches logical size with no pad', () => {
    const texture = createColorLayerTexture(64, 32, 'nearest')
    expect(texture.width).toBe(64)
    expect(texture.height).toBe(32)
    expect(texture.source.scaleMode).toBe('nearest')
    texture.destroy(true)
  })
})
