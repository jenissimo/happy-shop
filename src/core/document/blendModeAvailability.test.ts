import { describe, expect, test } from 'bun:test'
import { BLEND_MODES } from './schemaPrimitives'
import {
  coerceBlendMode,
  defaultBlendMode,
  selectableBlendModes,
} from './blendModeAvailability'
import { createGroupLayer, createRasterLayer } from './factories'
import { asRasterAssetRef } from './ids'

describe('selectableBlendModes', () => {
  test('offers pass-through only on groups', () => {
    expect(selectableBlendModes('group')).toContain('pass-through')
    for (const type of ['raster', 'text', 'shape', 'adjustment']) {
      expect(selectableBlendModes(type)).not.toContain('pass-through')
    }
  })

  test('keeps every other mode for leaf layers', () => {
    const leaf = selectableBlendModes('raster')
    expect(leaf).toHaveLength(BLEND_MODES.length - 1)
    expect(leaf).toContain('dissolve')
    expect(leaf).toContain('luminosity')
  })
})

describe('defaultBlendMode', () => {
  test('new groups are pass-through, leaves are normal', () => {
    expect(defaultBlendMode('group')).toBe('pass-through')
    expect(defaultBlendMode('raster')).toBe('normal')
    expect(createGroupLayer().blendMode).toBe('pass-through')
    expect(createRasterLayer({ pixels: asRasterAssetRef('a') }).blendMode).toBe('normal')
  })
})

describe('coerceBlendMode', () => {
  test('rewrites group-only modes for leaf layers and leaves the rest alone', () => {
    expect(coerceBlendMode('pass-through', 'raster')).toBe('normal')
    expect(coerceBlendMode('pass-through', 'group')).toBe('pass-through')
    expect(coerceBlendMode('multiply', 'raster')).toBe('multiply')
  })
})
