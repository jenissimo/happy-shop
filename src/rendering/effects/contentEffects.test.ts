import { describe, expect, test } from 'bun:test'
import { createDefaultEffect } from '../../ui/features/layer-style/defaults'
import { applyEffectStack } from './applyEffectStack'
import { resolveEffectStack } from './resolveEffectStack'
import type { RenderLayerEffect } from '../contracts/RenderDocumentView'

describe('content-phase effect stack', () => {
  test('resolveEffectStack orders key → content → style', () => {
    const resolved = resolveEffectStack([
      { type: 'drop-shadow', enabled: true, angle: 0, distance: 2, size: 2, spread: 0 },
      { type: 'gaussian-blur', enabled: true, radius: 3 },
      { type: 'chroma-key', enabled: true, edgeBlur: 0 },
      { type: 'stroke', enabled: true, size: 1, position: 'outside' },
    ])
    expect(resolved.nodes.map((n) => n.type)).toEqual([
      'chroma-key',
      'gaussian-blur',
      'drop-shadow',
      'stroke',
    ])
    expect(resolved.contentNodes.map((n) => n.type)).toEqual(['gaussian-blur'])
    expect(resolved.styleNodes.map((n) => n.type)).toEqual(['drop-shadow', 'stroke'])
  })

  test('applyEffectStack blurs RGB without changing alpha', () => {
    const width = 4
    const height = 4
    const rgba = new Uint8ClampedArray(width * height * 4)
    rgba[(1 * width + 1) * 4] = 255
    rgba[(1 * width + 1) * 4 + 3] = 200

    const effects: RenderLayerEffect[] = [
      {
        type: 'gaussian-blur',
        enabled: true,
        radius: 1,
      },
    ]
    const out = applyEffectStack(rgba, width, height, effects)
    expect(out[(1 * width + 1) * 4 + 3]).toBe(200)
    expect(out[(1 * width + 1) * 4]).toBeLessThan(255)
    expect(out[(1 * width + 1) * 4]).toBeGreaterThan(0)
  })

  test('applyEffectStack runs adjustment before style decoration', () => {
    const width = 2
    const height = 2
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 64
      rgba[i + 1] = 64
      rgba[i + 2] = 64
      rgba[i + 3] = 255
    }
    const effects: RenderLayerEffect[] = [
      {
        type: 'color-overlay',
        enabled: true,
        blendMode: 'normal',
        color: '#ff0000',
        opacity: 1,
      },
      {
        type: 'adjustment',
        enabled: true,
        adjustment: { type: 'brightness-contrast', brightness: 0.5, contrast: 0 },
      },
    ]
    const ordered = resolveEffectStack(effects)
    expect(ordered.nodes.map((n) => n.type)).toEqual(['adjustment', 'color-overlay'])
    const out = applyEffectStack(rgba, width, height, effects)
    expect(out[0]).toBeGreaterThan(64)
  })

  test('style-only outerHandlesFill ignores content nodes', () => {
    const resolved = resolveEffectStack([
      { type: 'gaussian-blur', enabled: true, radius: 4 },
      { type: 'color-overlay', enabled: true },
    ])
    expect(resolved.outerHandlesFill).toBe(false)
  })
})

describe('content effect multiplicity', () => {
  test('multiple gaussian-blur nodes accumulate padding', () => {
    const one = resolveEffectStack([
      { type: 'gaussian-blur', enabled: true, radius: 10 },
    ])
    const two = resolveEffectStack([
      { type: 'gaussian-blur', enabled: true, radius: 10 },
      { type: 'gaussian-blur', enabled: true, radius: 10 },
    ])
    expect(two.padding).toBeGreaterThan(one.padding)
  })
})
