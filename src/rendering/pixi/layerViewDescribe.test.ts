import { describe, expect, test } from 'bun:test'
import {
  describeEffectsParams,
  describeEffectsStructure,
} from './layerViewDescribe'
import type { RenderLayerEffect } from '../contracts/RenderDocumentView'

const dropShadow = (id: string, size: number): RenderLayerEffect => ({
  id,
  type: 'drop-shadow',
  enabled: true,
  blendMode: 'normal',
  color: '#000000',
  opacity: 0.5,
  angle: 120,
  distance: 4,
  spread: 0,
  size,
  contour: 'linear',
  noise: 0,
  layerKnocksOutDropShadow: true,
})

describe('describeEffectsStructure', () => {
  test('stable when only params change', () => {
    const before = describeEffectsStructure([dropShadow('a', 8)])
    const after = describeEffectsStructure([dropShadow('a', 24)])
    expect(before).toBe(after)
  })

  test('changes on reorder with distinct ids', () => {
    const first = describeEffectsStructure([dropShadow('a', 8), dropShadow('b', 8)])
    const second = describeEffectsStructure([dropShadow('b', 8), dropShadow('a', 8)])
    expect(first).not.toBe(second)
  })
})

describe('describeEffectsParams', () => {
  test('changes when a param scrubs', () => {
    const before = describeEffectsParams([dropShadow('a', 8)], 1)
    const after = describeEffectsParams([dropShadow('a', 24)], 1)
    expect(before).not.toBe(after)
  })

  test('changes when fill opacity changes', () => {
    const effects = [dropShadow('a', 8)]
    expect(describeEffectsParams(effects, 1)).not.toBe(describeEffectsParams(effects, 0.5))
  })
})
