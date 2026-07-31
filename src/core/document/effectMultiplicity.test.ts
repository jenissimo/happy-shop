import { describe, expect, test } from 'bun:test'
import {
  canAddEffectType,
  EFFECT_MULTIPLICITY,
  MAX_EFFECT_NODES_PER_LAYER,
  normalizeEffectStack,
} from './effectMultiplicity'
import { createLayerId } from './ids'
import type { LayerEffect } from './schema'

function stroke(partial?: Partial<Extract<LayerEffect, { type: 'stroke' }>>): LayerEffect {
  return {
    id: createLayerId(),
    type: 'stroke',
    enabled: true,
    blendMode: 'normal',
    color: '#000000',
    opacity: 1,
    overprint: false,
    size: 3,
    position: 'outside',
    fillType: 'color',
    ...partial,
  }
}

describe('EFFECT_MULTIPLICITY', () => {
  test('matches vision table for multi and singleton types', () => {
    expect(EFFECT_MULTIPLICITY.stroke).toBe(10)
    expect(EFFECT_MULTIPLICITY['drop-shadow']).toBe(10)
    expect(EFFECT_MULTIPLICITY['chroma-key']).toBe(4)
    expect(EFFECT_MULTIPLICITY['bevel-emboss']).toBe(1)
    expect(EFFECT_MULTIPLICITY.satin).toBe(1)
    expect(EFFECT_MULTIPLICITY['gaussian-blur']).toBe(8)
    expect(EFFECT_MULTIPLICITY.sharpen).toBe(8)
    expect(EFFECT_MULTIPLICITY.adjustment).toBe(8)
  })

  test('canAddEffectType respects per-type and hard caps', () => {
    const ten = Array.from({ length: 10 }, () => stroke())
    expect(canAddEffectType(ten, 'stroke')).toBe(false)
    expect(canAddEffectType(ten.slice(0, 9), 'stroke')).toBe(true)

    const many = Array.from({ length: MAX_EFFECT_NODES_PER_LAYER }, () =>
      stroke(),
    )
    expect(canAddEffectType(many, 'color-overlay')).toBe(false)
  })

  test('normalizeEffectStack truncates over-cap and regenerates duplicate ids', () => {
    const sharedId = createLayerId()
    const a = stroke({ id: sharedId, size: 1 })
    const b = stroke({ id: sharedId, size: 2 })
    const extras = Array.from({ length: 12 }, () => stroke())
    const { effects, repairs } = normalizeEffectStack([a, b, ...extras])
    expect(effects).toHaveLength(10)
    expect(new Set(effects.map((e) => e.id)).size).toBe(effects.length)
    expect(repairs.length).toBeGreaterThan(0)
  })
})
