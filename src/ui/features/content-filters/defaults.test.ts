import { describe, expect, test } from 'bun:test'
import { LayerEffectSchema } from '../../../core/document/schema'
import { effectPhase } from '../../../core/document/effectStackOrder'
import { createDefaultContentEffect, effectStackLabel } from './defaults'
import { createDefaultEffect } from '../layer-style/defaults'

describe('content effect defaults', () => {
  test('createDefaultContentEffect validates against LayerEffectSchema', () => {
    for (const type of ['gaussian-blur', 'sharpen', 'noise', 'adjustment'] as const) {
      const effect = createDefaultContentEffect(type)
      expect(LayerEffectSchema.safeParse(effect).success).toBe(true)
      expect(effectPhase(effect.type)).toBe('content')
    }
  })

  test('gaussian-blur accepts radius override', () => {
    const effect = createDefaultContentEffect('gaussian-blur', { radius: 12 })
    expect(effect.type).toBe('gaussian-blur')
    if (effect.type === 'gaussian-blur') expect(effect.radius).toBe(12)
  })

  test('effectStackLabel names adjustment subtypes', () => {
    const bc = createDefaultContentEffect('adjustment', {
      adjustment: { type: 'brightness-contrast', brightness: 0, contrast: 0 },
    })
    const stroke = createDefaultEffect('stroke')
    expect(effectStackLabel(bc, [bc, stroke])).toBe('Brightness/Contrast')
  })
})
