import { describe, expect, test } from 'bun:test'
import type { Filter } from 'pixi.js'
import type { RenderLayerEffect } from '../../contracts/RenderDocumentView'
import { expectedLayerFilterCount, syncLayerFilters } from './syncLayerFilters'

const stroke = (size: number): RenderLayerEffect => ({
  id: 'stroke-1',
  type: 'stroke',
  enabled: true,
  blendMode: 'normal',
  color: '#ffffff',
  opacity: 1,
  size,
  position: 'outside',
})

describe('expectedLayerFilterCount', () => {
  test('matches empty stack with opaque fill', () => {
    expect(expectedLayerFilterCount(undefined, { fillOpacity: 1 })).toBe(0)
  })

  test('counts fill-opacity pass when styles do not handle fill', () => {
    expect(
      expectedLayerFilterCount(
        [
          {
            id: 'overlay-1',
            type: 'color-overlay',
            enabled: true,
            blendMode: 'normal',
            color: '#ff0000',
            opacity: 1,
          },
        ],
        { fillOpacity: 0.5 },
      ),
    ).toBe(2)
  })
})

describe('syncLayerFilters', () => {
  test('returns false when filter count mismatches', () => {
    const filters: Filter[] = []
    expect(syncLayerFilters(filters, [stroke(2)], { fillOpacity: 1 })).toBe(false)
  })
})
