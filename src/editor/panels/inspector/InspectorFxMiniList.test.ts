import { describe, expect, test } from 'bun:test'
import {
  addLayer,
  createEmptyDocument,
  createRasterLayer,
  reorderEffect,
} from '../../../core/document'
import { createDefaultEffect } from '../../../ui/features/layer-style/defaults'
import { createDefaultContentEffect } from '../../../ui/features/content-filters/defaults'
import { inspectorFxRows } from './InspectorFxMiniList'

describe('inspectorFxRows', () => {
  test('mirrors Effects panel labels for ordered multi-instance stacks', () => {
    const stroke1 = { ...createDefaultEffect('stroke'), id: 'stroke-1', enabled: true }
    const stroke2 = { ...createDefaultEffect('stroke'), id: 'stroke-2', enabled: false }
    const shadow = { ...createDefaultEffect('drop-shadow'), id: 'shadow-1', enabled: true }

    expect(inspectorFxRows([stroke1, stroke2, shadow])).toEqual([
      { id: 'stroke-1', label: 'Stroke', enabled: true, blendSummary: 'normal' },
      { id: 'stroke-2', label: 'Stroke 2', enabled: false, blendSummary: 'normal' },
      { id: 'shadow-1', label: 'Drop Shadow', enabled: true, blendSummary: 'multiply' },
    ])
    expect(inspectorFxRows([shadow, stroke2, stroke1]).map((row) => row.id)).toEqual([
      'shadow-1',
      'stroke-2',
      'stroke-1',
    ])
  })

  test('labels content-phase nodes by subtype', () => {
    const blur = { ...createDefaultContentEffect('gaussian-blur'), id: 'blur-1' }
    const levels = {
      ...createDefaultContentEffect('adjustment', {
        adjustment: { type: 'levels', black: 0, white: 255, gamma: 1 },
      }),
      id: 'levels-1',
    }
    expect(inspectorFxRows([blur, levels])).toEqual([
      { id: 'blur-1', label: 'Gaussian Blur', enabled: true, blendSummary: null },
      { id: 'levels-1', label: 'Levels', enabled: true, blendSummary: null },
    ])
  })
})

describe('Inspector FX reorder commit path', () => {
  test('reorderEffect swaps indices within the same phase', () => {
    const stroke1 = { ...createDefaultEffect('stroke'), id: 'stroke-1' }
    const stroke2 = { ...createDefaultEffect('stroke'), id: 'stroke-2' }
    let doc = createEmptyDocument({ width: 8, height: 8 })
    const layer = createRasterLayer({ name: 'FX', effects: [stroke1, stroke2] })
    doc = addLayer(doc, layer)

    const after = reorderEffect(doc, layer.id, 0, 1)
    expect(after.layers[layer.id]?.effects.map((effect) => effect.id)).toEqual([
      'stroke-2',
      'stroke-1',
    ])
  })

  test('reorderEffect refuses key/style phase crossing', () => {
    const chroma = { ...createDefaultEffect('chroma-key'), id: 'key-1' }
    const stroke = { ...createDefaultEffect('stroke'), id: 'stroke-1' }
    let doc = createEmptyDocument({ width: 8, height: 8 })
    const layer = createRasterLayer({ name: 'FX', effects: [chroma, stroke] })
    doc = addLayer(doc, layer)

    const after = reorderEffect(doc, layer.id, 0, 1)
    expect(after).toBe(doc)
    expect(after.layers[layer.id]?.effects.map((effect) => effect.id)).toEqual([
      'key-1',
      'stroke-1',
    ])
  })
})
