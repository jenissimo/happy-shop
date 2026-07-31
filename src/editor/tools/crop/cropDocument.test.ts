import { describe, expect, test } from 'bun:test'
import {
  addLayer,
  asRasterAssetRef,
  createEmptyDocument,
  createRasterLayer,
} from '../../../core/document'
import { cropDocument } from './cropDocument'

describe('cropDocument', () => {
  test('shrinks canvas and shifts layer transforms', () => {
    let doc = createEmptyDocument({
      name: 'C',
      width: 100,
      height: 80,
    })
    const layer = createRasterLayer({
      name: 'L',
      pixels: asRasterAssetRef('a'),
      transform: {
        x: 20,
        y: 10,
        scaleX: 1,
        scaleY: 1,
        rotationDeg: 0,
        skewXDeg: 0,
        skewYDeg: 0,
        pivotX: 0,
        pivotY: 0,
      },
    })
    doc = addLayer(doc, layer)
    const cropped = cropDocument(doc, { x: 10, y: 5, width: 40, height: 30 })
    expect(cropped.canvas.width).toBe(40)
    expect(cropped.canvas.height).toBe(30)
    expect(cropped.layers[layer.id]?.transform.x).toBe(10)
    expect(cropped.layers[layer.id]?.transform.y).toBe(5)
  })
})
