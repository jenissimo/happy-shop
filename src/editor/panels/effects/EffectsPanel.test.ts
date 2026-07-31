import { describe, expect, test } from 'bun:test'
import {
  addLayer,
  asRasterAssetRef,
  createEmptyDocument,
  createRasterLayer,
} from '../../../core/document'
import { createDefaultEffect } from '../../../ui/features/layer-style/defaults'
import { createDefaultContentEffect } from '../../../ui/features/content-filters/defaults'
import { effectPanelRows } from './EffectsPanel'
import { toRenderDocumentView } from '../../session/toRenderDocumentView'

describe('EffectsPanel stack rows', () => {
  test('stays synchronized with ordered, multi-instance effect state', () => {
    const stroke1 = { ...createDefaultEffect('stroke'), id: 'stroke-1', enabled: true }
    const stroke2 = { ...createDefaultEffect('stroke'), id: 'stroke-2', enabled: false }
    const shadow = { ...createDefaultEffect('drop-shadow'), id: 'shadow-1', enabled: true }

    expect(effectPanelRows([stroke1, stroke2, shadow])).toEqual([
      { id: 'stroke-1', label: 'Stroke', enabled: true, blendSummary: 'normal' },
      { id: 'stroke-2', label: 'Stroke 2', enabled: false, blendSummary: 'normal' },
      { id: 'shadow-1', label: 'Drop Shadow', enabled: true, blendSummary: 'multiply' },
    ])
    expect(effectPanelRows([shadow, stroke2, stroke1]).map((row) => row.id)).toEqual([
      'shadow-1',
      'stroke-2',
      'stroke-1',
    ])
  })

  test('shows bevel highlight/shadow blend summary', () => {
    const bevel = {
      ...createDefaultEffect('bevel-emboss'),
      id: 'bevel-1',
      highlightMode: 'screen' as const,
      shadowMode: 'multiply' as const,
    }
    expect(effectPanelRows([bevel])[0]?.blendSummary).toBe('screen / multiply')
  })

  test('labels content-phase noise nodes', () => {
    const noise = { ...createDefaultContentEffect('noise'), id: 'noise-1' }
    expect(effectPanelRows([noise])).toEqual([
      { id: 'noise-1', label: 'Noise', enabled: true, blendSummary: null },
    ])
  })

  test('labels content-phase adjustment nodes by subtype', () => {
    const blur = { ...createDefaultContentEffect('gaussian-blur'), id: 'blur-1' }
    const levels = {
      ...createDefaultContentEffect('adjustment', {
        adjustment: { type: 'levels', black: 0, white: 255, gamma: 1 },
      }),
      id: 'levels-1',
    }
    expect(effectPanelRows([blur, levels])).toEqual([
      { id: 'blur-1', label: 'Gaussian Blur', enabled: true, blendSummary: null },
      { id: 'levels-1', label: 'Levels', enabled: true, blendSummary: null },
    ])
  })
})

describe('toRenderDocumentView effect blend modes', () => {
  test('forwards per-effect blend modes to the render contract', () => {
    const px = asRasterAssetRef('px')
    let doc = createEmptyDocument({ width: 8, height: 8 })
    const layer = createRasterLayer({
      name: 'FX',
      pixels: px,
      effects: [
        {
          ...createDefaultEffect('color-overlay'),
          id: 'overlay-1',
          blendMode: 'hard-light',
        },
        {
          ...createDefaultEffect('bevel-emboss'),
          id: 'bevel-1',
          highlightMode: 'lighten',
          shadowMode: 'darken',
        },
      ],
    })
    doc = addLayer(doc, layer)

    const view = toRenderDocumentView(doc, {
      get: () => ({ assetId: px, width: 8, height: 8, bitmap: {} as ImageBitmap }),
    })

    const fxLayer = view.layers.find((entry) => entry.id === layer.id)
    const effects = fxLayer?.effects ?? []
    expect(effects[0]).toMatchObject({ type: 'color-overlay', blendMode: 'hard-light' })
    expect(effects[1]).toMatchObject({
      type: 'bevel-emboss',
      highlightMode: 'lighten',
      shadowMode: 'darken',
    })
  })
})
