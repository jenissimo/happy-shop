import { describe, expect, test } from 'bun:test'
import {
  addLayer,
  asRasterAssetRef,
  createEmptyDocument,
  createRasterLayer,
  setLayerEffects,
} from '../../core/document'
import { createDefaultEffect } from '../../ui/features/layer-style/defaults'
import {
  clearCopiedLayerEffects,
  copyLayerEffects,
  pasteCopiedLayerEffects,
} from './layerFxClipboard'

describe('layer FX clipboard', () => {
  test('copies a full stack and pastes detached node ids', () => {
    const source = createRasterLayer({ pixels: asRasterAssetRef('source') })
    const target = createRasterLayer({ pixels: asRasterAssetRef('target') })
    let document = addLayer(createEmptyDocument(), source)
    document = addLayer(document, target)
    const effects = [
      { ...createDefaultEffect('stroke'), enabled: true, size: 7 },
      { ...createDefaultEffect('drop-shadow'), enabled: false, distance: 12 },
    ]
    document = setLayerEffects(document, source.id, effects)

    copyLayerEffects(document.layers[source.id]!.effects)
    const pasted = pasteCopiedLayerEffects(document, [target.id])
    const targetEffects = pasted.layers[target.id]!.effects

    expect(targetEffects.map((effect) => effect.type)).toEqual(['stroke', 'drop-shadow'])
    expect(targetEffects.map((effect) => effect.enabled)).toEqual([true, false])
    expect(targetEffects.map((effect) => effect.id)).not.toEqual(
      document.layers[source.id]!.effects.map((effect) => effect.id),
    )
    expect(targetEffects[0]?.id).not.toBe(targetEffects[1]?.id)
    clearCopiedLayerEffects()
  })

  test('pastes independently to every selected target', () => {
    const source = createRasterLayer({ pixels: asRasterAssetRef('source') })
    const a = createRasterLayer({ pixels: asRasterAssetRef('a') })
    const b = createRasterLayer({ pixels: asRasterAssetRef('b') })
    let document = addLayer(createEmptyDocument(), source)
    document = addLayer(document, a)
    document = addLayer(document, b)
    copyLayerEffects([{ ...createDefaultEffect('color-overlay'), enabled: true }])

    const pasted = pasteCopiedLayerEffects(document, [a.id, b.id])
    const aEffect = pasted.layers[a.id]!.effects[0]!
    const bEffect = pasted.layers[b.id]!.effects[0]!
    expect(aEffect.type).toBe('color-overlay')
    expect(bEffect.type).toBe('color-overlay')
    expect(aEffect.id).not.toBe(bEffect.id)
    clearCopiedLayerEffects()
  })
})
