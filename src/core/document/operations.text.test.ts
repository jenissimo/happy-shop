import { describe, expect, test } from 'bun:test'
import { createEmptyDocument, createTextLayer } from './factories'
import { addLayer, replaceLayer, updateTextLayer } from './operations'
import { createRasterLayer } from './factories'
import { asRasterAssetRef } from './ids'

describe('updateTextLayer', () => {
  test('patches text props', () => {
    const layer = createTextLayer({ content: 'A' })
    let doc = addLayer(createEmptyDocument(), layer)
    doc = updateTextLayer(doc, layer.id, {
      content: 'Hello',
      fontSize: 72,
      align: 'center',
      italic: true,
    })
    const next = doc.layers[layer.id]
    expect(next?.type).toBe('text')
    if (next?.type === 'text') {
      expect(next.content).toBe('Hello')
      expect(next.fontSize).toBe(72)
      expect(next.align).toBe('center')
      expect(next.italic).toBe(true)
    }
  })

  test('no-ops for non-text layers', () => {
    const layer = createRasterLayer({ pixels: asRasterAssetRef('x') })
    const doc = addLayer(createEmptyDocument(), layer)
    const after = updateTextLayer(doc, layer.id, { content: 'nope' })
    expect(after).toBe(doc)
  })
})

describe('replaceLayer', () => {
  test('swaps text for raster in place', () => {
    const text = createTextLayer({ content: 'Bake' })
    let doc = addLayer(createEmptyDocument(), text)
    const raster = createRasterLayer({
      id: text.id,
      pixels: asRasterAssetRef('baked'),
      name: text.name,
    })
    doc = replaceLayer(doc, raster)
    expect(doc.rootChildren).toContain(text.id)
    expect(doc.layers[text.id]?.type).toBe('raster')
  })
})
