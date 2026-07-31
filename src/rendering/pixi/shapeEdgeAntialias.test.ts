import { describe, expect, test } from 'bun:test'
import type { Filter } from 'pixi.js'
import {
  SHAPE_AA_PADDING,
  applyShapeEdgeAntialiasFlags,
  shapeFiltersHaveEdgeAntialias,
  withShapeEdgeAntialias,
} from './shapeEdgeAntialias'

function mockFilter(
  antialias: Filter['antialias'] = 'off',
  padding = 0,
): Filter {
  return { antialias, padding } as Filter
}

describe('withShapeEdgeAntialias', () => {
  test('adds passthrough MSAA filter when none present', () => {
    const passthrough = mockFilter('off', 0)
    const filters = withShapeEdgeAntialias(null, () => passthrough)
    expect(filters).toHaveLength(1)
    expect(filters[0]).toBe(passthrough)
    expect(filters[0]!.antialias).toBe('on')
    expect(filters[0]!.padding).toBeGreaterThanOrEqual(SHAPE_AA_PADDING)
    expect(shapeFiltersHaveEdgeAntialias(filters)).toBe(true)
  })

  test('enables MSAA on every filter in an existing chain', () => {
    const a = mockFilter('off', 8)
    const b = mockFilter('inherit', 0)
    const filters = withShapeEdgeAntialias([a, b])
    expect(filters).toHaveLength(2)
    expect(filters[0]!.antialias).toBe('on')
    expect(filters[1]!.antialias).toBe('on')
    expect(filters[0]!.padding).toBeGreaterThanOrEqual(8)
    expect(shapeFiltersHaveEdgeAntialias(filters)).toBe(true)
  })

  test('empty array still installs a passthrough AA pass', () => {
    const filters = withShapeEdgeAntialias([], () => mockFilter())
    expect(filters).toHaveLength(1)
    expect(shapeFiltersHaveEdgeAntialias(filters)).toBe(true)
  })
})

describe('applyShapeEdgeAntialiasFlags', () => {
  test('forces on + pads first filter', () => {
    const filters = [mockFilter('off', 0), mockFilter('off', 2)]
    applyShapeEdgeAntialiasFlags(filters)
    expect(filters[0]!.antialias).toBe('on')
    expect(filters[1]!.antialias).toBe('on')
    expect(filters[0]!.padding).toBe(SHAPE_AA_PADDING)
    expect(filters[1]!.padding).toBe(2)
  })
})
