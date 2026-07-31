import { describe, expect, test } from 'bun:test'
import { createDefaultEffect } from '../../ui/features/layer-style/defaults'
import { effectBlendSummary, effectGpuBlendModes } from './effectBlendModes'
import { blendModeToUniform } from './filters/shaderCommon'
import type { RenderLayerEffect } from '../contracts/RenderDocumentView'

describe('effectBlendSummary', () => {
  test('returns blend mode for style effects', () => {
    const stroke = { ...createDefaultEffect('stroke'), blendMode: 'multiply' as const }
    expect(effectBlendSummary(stroke)).toBe('multiply')
  })

  test('summarizes bevel highlight and shadow modes', () => {
    const bevel = {
      ...createDefaultEffect('bevel-emboss'),
      highlightMode: 'screen' as const,
      shadowMode: 'multiply' as const,
    }
    expect(effectBlendSummary(bevel)).toBe('screen / multiply')
  })

  test('deduplicates identical bevel modes', () => {
    const bevel = {
      ...createDefaultEffect('bevel-emboss'),
      highlightMode: 'overlay' as const,
      shadowMode: 'overlay' as const,
    }
    expect(effectBlendSummary(bevel)).toBe('overlay')
  })

  test('returns null for chroma key', () => {
    expect(effectBlendSummary(createDefaultEffect('chroma-key'))).toBeNull()
  })
})

describe('effectGpuBlendModes', () => {
  test('maps every style effect to a non-normal GPU uniform when configured', () => {
    const effect: RenderLayerEffect = {
      type: 'color-overlay',
      enabled: true,
      blendMode: 'difference',
      color: '#ffffff',
      opacity: 1,
    }
    expect(effectGpuBlendModes(effect).map(blendModeToUniform)).toEqual([10])
  })

  test('maps bevel highlight and shadow modes separately', () => {
    const effect: RenderLayerEffect = {
      type: 'bevel-emboss',
      enabled: true,
      style: 'inner-bevel',
      technique: 'smooth',
      depth: 100,
      direction: 'up',
      size: 5,
      soften: 0,
      angle: 120,
      altitude: 30,
      highlightColor: '#ffffff',
      highlightOpacity: 0.75,
      highlightMode: 'screen',
      shadowColor: '#000000',
      shadowOpacity: 0.75,
      shadowMode: 'color-burn',
      contourEnabled: false,
      contour: 'linear',
      contourRange: 50,
      contourAntiAliased: true,
      textureEnabled: false,
      texturePattern: 'checker',
      textureScale: 100,
      textureDepth: 100,
      textureInvert: false,
      textureAlignWithLayer: true,
    }
    expect(effectGpuBlendModes(effect).map(blendModeToUniform)).toEqual([2, 7])
  })
})
