import { describe, expect, test } from 'bun:test'
import {
  createEmptyDocument,
  createRasterLayer,
} from './factories'
import { asRasterAssetRef, createLayerId } from './ids'
import {
  DropShadowEffectSchema,
  HappyDocumentSchema,
  LayerEffectSchema,
  StrokeEffectSchema,
} from './schema'
import { CurvesAdjustmentSchema } from './adjustmentSchema'
import { BLEND_MODES } from './schemaPrimitives'

describe('LayerEffectSchema', () => {
  test('discriminates stroke vs color-overlay by type', () => {
    const stroke = LayerEffectSchema.safeParse({
      id: 'fx2',
      type: 'stroke',
      enabled: true,
      blendMode: 'normal',
      color: '#ffffff',
      opacity: 1,
      overprint: false,
      size: 2,
      position: 'outside',
      fillType: 'color',
    })
    expect(stroke.success).toBe(true)

    const overlay = LayerEffectSchema.safeParse({
      id: 'fx3',
      type: 'color-overlay',
      enabled: true,
      color: '#ff0000',
      opacity: 1,
      blendMode: 'normal',
    })
    expect(overlay.success).toBe(true)
  })

  test('rejects an effect opacity outside 0..1', () => {
    const result = DropShadowEffectSchema.safeParse({
      id: 'fx4',
      type: 'drop-shadow',
      enabled: true,
      blendMode: 'multiply',
      color: '#000000',
      opacity: 1.5,
      angle: 120,
      useGlobalLight: true,
      distance: 0,
      spread: 0,
      size: 0,
      contour: 'linear',
      noise: 0,
      layerKnocksOutDropShadow: true,
    })
    expect(result.success).toBe(false)
  })

  test('rejects a malformed color string', () => {
    const result = StrokeEffectSchema.safeParse({
      id: 'fx5',
      type: 'stroke',
      enabled: true,
      blendMode: 'normal',
      color: 'red',
      opacity: 1,
      overprint: false,
      size: 1,
      position: 'outside',
      fillType: 'color',
    })
    expect(result.success).toBe(false)
  })

  test('parses content-phase gaussian-blur, sharpen, and adjustment nodes', () => {
    expect(LayerEffectSchema.safeParse({
      id: 'blur1',
      type: 'gaussian-blur',
      enabled: true,
      radius: 4,
    }).success).toBe(true)

    expect(LayerEffectSchema.safeParse({
      id: 'sharp1',
      type: 'sharpen',
      enabled: true,
      amount: 1,
      radius: 1,
    }).success).toBe(true)

    expect(LayerEffectSchema.safeParse({
      id: 'adj1',
      type: 'adjustment',
      enabled: true,
      adjustment: { type: 'brightness-contrast', brightness: 0.1, contrast: 0.2 },
    }).success).toBe(true)

    expect(LayerEffectSchema.safeParse({
      id: 'noise1',
      type: 'noise',
      enabled: true,
      amount: 0.12,
      distribution: 'uniform',
      monochromatic: true,
    }).success).toBe(true)
  })

  test('parses bevel-emboss with nested contour/texture', () => {
    const result = LayerEffectSchema.safeParse({
      id: 'fx-bevel',
      type: 'bevel-emboss',
      enabled: true,
      style: 'inner-bevel',
      technique: 'smooth',
      depth: 100,
      direction: 'up',
      size: 5,
      soften: 0,
      angle: 120,
      useGlobalLight: true,
      altitude: 30,
      glossContour: 'linear',
      highlightMode: 'screen',
      highlightColor: '#ffffff',
      highlightOpacity: 0.75,
      shadowMode: 'multiply',
      shadowColor: '#000000',
      shadowOpacity: 0.75,
      contour: {
        enabled: false,
        contour: 'linear',
        range: 50,
        antiAliased: false,
      },
      texture: {
        enabled: false,
        pattern: 'checker',
        scale: 100,
        depth: 100,
        invert: false,
        alignWithLayer: true,
      },
    })
    expect(result.success).toBe(true)
  })
})

describe('HappyDocumentSchema', () => {
  test('accepts Photoshop blend modes and curves control points', () => {
    expect(BLEND_MODES).toEqual(expect.arrayContaining([
      'hue', 'color', 'luminosity', 'linear-burn', 'linear-dodge',
      'vivid-light', 'linear-light', 'pin-light', 'hard-mix',
      'subtract', 'divide', 'pass-through',
    ]))
    expect(CurvesAdjustmentSchema.safeParse({
      type: 'curves',
      master: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    }).success).toBe(true)
  })

  test('round-trips a document created via the factories', () => {
    const layerId = createLayerId()
    const layer = createRasterLayer({
      id: layerId,
      pixels: asRasterAssetRef('asset-1'),
    })
    const doc = createEmptyDocument({ name: 'Photo' })
    const withLayer = {
      ...doc,
      rootChildren: [layerId],
      layers: { [layerId]: layer },
    }
    const result = HappyDocumentSchema.safeParse(withLayer)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.layers[layerId]?.fillOpacity).toBe(1)
    }
  })

  test('rejects an unsupported schemaVersion', () => {
    const doc = createEmptyDocument()
    const result = HappyDocumentSchema.safeParse({ ...doc, schemaVersion: 5 })
    expect(result.success).toBe(false)
  })

  test('rejects a layer opacity outside 0..1', () => {
    const layerId = createLayerId()
    const layer = createRasterLayer({
      id: layerId,
      pixels: asRasterAssetRef('asset-1'),
      opacity: 2 as unknown as number,
    })
    // Factory clamps? — build invalid manually
    const doc = {
      ...createEmptyDocument(),
      rootChildren: [layerId],
      layers: {
        [layerId]: { ...layer, opacity: 2 },
      },
    }
    const result = HappyDocumentSchema.safeParse(doc)
    expect(result.success).toBe(false)
  })
})
