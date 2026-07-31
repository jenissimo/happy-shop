import { describe, expect, test } from 'bun:test'
import {
  addLayer,
  asRasterAssetRef,
  asRasterMaskRef,
  createEmptyDocument,
  createRasterLayer,
  setMask,
  setMaskHidesEffects,
} from './index'
import { toRenderDocumentView } from '../../editor/session/toRenderDocumentView'

describe('maskHidesEffects render contract', () => {
  test('forwards maskHidesEffects when enabled on a masked layer', () => {
    const px = asRasterAssetRef('px')
    const mask = asRasterMaskRef('mask')
    let doc = createEmptyDocument({ width: 8, height: 8 })
    const layer = createRasterLayer({ name: 'Masked', pixels: px })
    doc = addLayer(doc, layer)
    doc = setMask(doc, layer.id, mask)
    doc = setMaskHidesEffects(doc, layer.id, true)

    const view = toRenderDocumentView(doc, {
      get: (id) => {
        if (id === px) return { assetId: px, width: 8, height: 8, bitmap: {} as ImageBitmap }
        if (id === mask) return { assetId: mask, width: 8, height: 8, bitmap: {} as ImageBitmap }
        return undefined
      },
    })

    const mapped = view.layers.find((entry) => entry.id === layer.id)
    expect(mapped).toMatchObject({ maskHidesEffects: true })
  })

  test('omits maskHidesEffects when false (default pre-FX mask)', () => {
    const px = asRasterAssetRef('px')
    const mask = asRasterMaskRef('mask')
    let doc = createEmptyDocument({ width: 8, height: 8 })
    const layer = createRasterLayer({ name: 'Masked', pixels: px })
    doc = addLayer(doc, layer)
    doc = setMask(doc, layer.id, mask)

    const view = toRenderDocumentView(doc, {
      get: (id) => {
        if (id === px) return { assetId: px, width: 8, height: 8, bitmap: {} as ImageBitmap }
        if (id === mask) return { assetId: mask, width: 8, height: 8, bitmap: {} as ImageBitmap }
        return undefined
      },
    })

    const mapped = view.layers.find((entry) => entry.id === layer.id)
    expect(mapped?.mask).toBeDefined()
    expect(mapped?.maskHidesEffects).toBeUndefined()
  })
})

describe('setMaskHidesEffects', () => {
  test('no-ops without a mask and clears the flag when disabled', () => {
    let doc = createEmptyDocument({ width: 4, height: 4 })
    const layer = createRasterLayer({ name: 'Plain', pixels: asRasterAssetRef('px') })
    doc = addLayer(doc, layer)

    expect(setMaskHidesEffects(doc, layer.id, true)).toBe(doc)

    doc = setMask(doc, layer.id, asRasterMaskRef('mask'))
    doc = setMaskHidesEffects(doc, layer.id, true)
    expect(doc.layers[layer.id]?.maskHidesEffects).toBe(true)

    doc = setMaskHidesEffects(doc, layer.id, false)
    expect(doc.layers[layer.id]?.maskHidesEffects).toBeUndefined()
  })
})
