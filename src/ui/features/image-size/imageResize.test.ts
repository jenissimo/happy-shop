import { describe, expect, test } from 'bun:test'
import {
  addLayer,
  asRasterAssetRef,
  createEmptyDocument,
  createRasterLayer,
} from '../../../core/document'
import {
  clampImageDimension,
  constrainedDimension,
  resizeDocumentMetadata,
} from './imageResize'

function docWithLayer(width: number, height: number) {
  let doc = createEmptyDocument({ name: 'Size', width, height })
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
      pivotX: 10,
      pivotY: 5,
    },
  })
  doc = addLayer(doc, layer)
  return { doc, layerId: layer.id }
}

describe('clampImageDimension', () => {
  test('rounds and clamps to 1..8192', () => {
    expect(clampImageDimension(100.4)).toBe(100)
    expect(clampImageDimension(0)).toBe(1)
    expect(clampImageDimension(99999)).toBe(8192)
    expect(clampImageDimension(Number.NaN)).toBe(1)
  })
})

describe('constrainedDimension', () => {
  test('preserves aspect ratio when one side changes', () => {
    expect(constrainedDimension(200, 100, 80)).toBe(160)
    expect(constrainedDimension(50, 80, 100)).toBe(63)
  })
})

describe('resizeDocumentMetadata', () => {
  test('no-op when dimensions unchanged', () => {
    const { doc } = docWithLayer(100, 80)
    expect(resizeDocumentMetadata(doc, 100, 80)).toBe(doc)
  })

  test('scales canvas and layer transforms proportionally', () => {
    const { doc, layerId } = docWithLayer(100, 80)
    const next = resizeDocumentMetadata(doc, 200, 160)
    expect(next.canvas.width).toBe(200)
    expect(next.canvas.height).toBe(160)
    const layer = next.layers[layerId]
    expect(layer?.transform.x).toBe(40)
    expect(layer?.transform.y).toBe(20)
    expect(layer?.transform.pivotX).toBe(20)
    expect(layer?.transform.pivotY).toBe(10)
  })
})
