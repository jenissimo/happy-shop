import { describe, expect, test } from 'bun:test'
import { createDefaultEffect } from '../../../ui/features/layer-style/defaults'
import { layersFxEffectRows, toggleExpandedFx } from './layersFxTree'

describe('layersFxEffectRows', () => {
  test('mirrors Effects panel labels for multi-instance stacks', () => {
    const stroke1 = { ...createDefaultEffect('stroke'), id: 'stroke-1', enabled: true }
    const stroke2 = { ...createDefaultEffect('stroke'), id: 'stroke-2', enabled: false }
    const shadow = { ...createDefaultEffect('drop-shadow'), id: 'shadow-1', enabled: true }

    expect(layersFxEffectRows([stroke1, stroke2, shadow])).toEqual([
      { id: 'stroke-1', label: 'Stroke', enabled: true, blendSummary: 'normal' },
      { id: 'stroke-2', label: 'Stroke 2', enabled: false, blendSummary: 'normal' },
      { id: 'shadow-1', label: 'Drop Shadow', enabled: true, blendSummary: 'multiply' },
    ])
  })
})

describe('toggleExpandedFx', () => {
  test('adds and removes layer ids idempotently', () => {
    expect(toggleExpandedFx(new Set(), 'layer-a')).toEqual(new Set(['layer-a']))
    expect(toggleExpandedFx(new Set(['layer-a']), 'layer-a')).toEqual(new Set())
  })
})
