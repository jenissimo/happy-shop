import { describe, expect, test } from 'bun:test'
import {
  MAX_EFFECT_PAD,
  resolveEffectStack,
} from './resolveEffectStack'

describe('resolveEffectStack', () => {
  test('hoists chroma-key ahead of styles while preserving relative orders', () => {
    const resolved = resolveEffectStack([
      {
        type: 'stroke',
        enabled: true,
        size: 2,
        position: 'outside',
      },
      {
        type: 'chroma-key',
        enabled: true,
        edgeBlur: 0,
      },
      {
        type: 'drop-shadow',
        enabled: true,
        angle: 0,
        distance: 4,
        size: 2,
        spread: 0,
      },
    ])
    expect(resolved.nodes.map((n) => n.type)).toEqual([
      'chroma-key',
      'stroke',
      'drop-shadow',
    ])
  })

  test('accumulates outward padding instead of taking max', () => {
    const one = resolveEffectStack([
      {
        type: 'drop-shadow',
        enabled: true,
        angle: 0,
        distance: 10,
        size: 10,
        spread: 0,
      },
    ])
    const two = resolveEffectStack([
      {
        type: 'drop-shadow',
        enabled: true,
        angle: 0,
        distance: 10,
        size: 10,
        spread: 0,
      },
      {
        type: 'drop-shadow',
        enabled: true,
        angle: 180,
        distance: 10,
        size: 10,
        spread: 0,
      },
    ])
    expect(two.padding).toBeGreaterThan(one.padding)
    // Roughly ~2× for two identical outward shadows (before clamp).
    expect(two.padding).toBeGreaterThanOrEqual(one.padding * 1.5)
  })

  test('clamps accumulated padding to MAX_EFFECT_PAD', () => {
    const shadows = Array.from({ length: 10 }, () => ({
      type: 'drop-shadow' as const,
      enabled: true,
      angle: 0,
      distance: 40,
      size: 40,
      spread: 0,
    }))
    const resolved = resolveEffectStack(shadows)
    expect(resolved.padding).toBeLessThanOrEqual(MAX_EFFECT_PAD)
    expect(resolved.insets.top).toBeLessThanOrEqual(MAX_EFFECT_PAD)
  })

  test('ignores disabled nodes and reports outerHandlesFill', () => {
    const resolved = resolveEffectStack([
      {
        type: 'color-overlay',
        enabled: true,
      },
      {
        type: 'drop-shadow',
        enabled: false,
        angle: 0,
        distance: 4,
        size: 4,
        spread: 0,
      },
    ])
    expect(resolved.nodes).toHaveLength(1)
    expect(resolved.outerHandlesFill).toBe(false)

    const withOuter = resolveEffectStack([
      {
        type: 'stroke',
        enabled: true,
        size: 3,
        position: 'outside',
      },
    ])
    expect(withOuter.outerHandlesFill).toBe(true)
  })

  test('inside stroke does not accumulate as outward', () => {
    const inside = resolveEffectStack([
      { type: 'stroke', enabled: true, size: 8, position: 'inside' },
      { type: 'stroke', enabled: true, size: 8, position: 'inside' },
    ])
    const outside = resolveEffectStack([
      { type: 'stroke', enabled: true, size: 8, position: 'outside' },
      { type: 'stroke', enabled: true, size: 8, position: 'outside' },
    ])
    expect(outside.padding).toBeGreaterThan(inside.padding)
  })
})
