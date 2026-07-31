import { describe, expect, test } from 'bun:test'
import { applyNoiseContent, sampleNoiseDelta } from './noiseContent'
import { applyEffectStack } from './applyEffectStack'
import type { RenderLayerEffect } from '../contracts/RenderDocumentView'

describe('noiseContent', () => {
  test('sampleNoiseDelta is deterministic per pixel', () => {
    expect(sampleNoiseDelta(2, 3, 0, 'uniform')).toBe(
      sampleNoiseDelta(2, 3, 0, 'uniform'),
    )
    expect(sampleNoiseDelta(2, 3, 1, 'gaussian')).toBe(
      sampleNoiseDelta(2, 3, 1, 'gaussian'),
    )
  })

  test('applyNoiseContent changes RGB but not alpha', () => {
    const width = 3
    const height = 3
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 128
      rgba[i + 1] = 128
      rgba[i + 2] = 128
      rgba[i + 3] = 200
    }

    applyNoiseContent(rgba, width, height, 0.5, 'uniform', true)
    expect(rgba[3]).toBe(200)
    expect(rgba[0]).not.toBe(128)
    expect(rgba[1]).toBe(rgba[0])
    expect(rgba[2]).toBe(rgba[0])
  })

  test('applyEffectStack applies noise in content phase', () => {
    const width = 2
    const height = 2
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 100
      rgba[i + 1] = 100
      rgba[i + 2] = 100
      rgba[i + 3] = 255
    }
    const effects: RenderLayerEffect[] = [
      {
        type: 'noise',
        enabled: true,
        amount: 0.25,
        distribution: 'uniform',
        monochromatic: false,
      },
    ]
    const out = applyEffectStack(rgba, width, height, effects)
    expect(out[3]).toBe(255)
    expect(out[0]).not.toBe(100)
  })
})
