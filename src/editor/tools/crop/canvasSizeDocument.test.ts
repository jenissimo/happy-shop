import { describe, expect, test } from 'bun:test'
import {
  addLayer,
  asRasterAssetRef,
  createEmptyDocument,
  createRasterLayer,
} from '../../../core/document'
import {
  CANVAS_ANCHOR_CENTER,
  canvasSizeDocument,
  canvasSizeOriginOffset,
} from './canvasSizeDocument'

function docWithLayer(
  width: number,
  height: number,
  transform: { x: number; y: number },
) {
  let doc = createEmptyDocument({ name: 'C', width, height })
  const layer = createRasterLayer({
    name: 'L',
    pixels: asRasterAssetRef('a'),
    transform: {
      x: transform.x,
      y: transform.y,
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
  return { doc, layerId: layer.id }
}

describe('canvasSizeOriginOffset', () => {
  test('left/top grow leaves origin unshifted', () => {
    expect(
      canvasSizeOriginOffset(100, 80, 140, 100, { x: 0, y: 0 }),
    ).toEqual({ x: 0, y: 0 })
  })

  test('right/bottom grow shifts content into the new space', () => {
    expect(
      canvasSizeOriginOffset(100, 80, 140, 100, { x: 1, y: 1 }),
    ).toEqual({ x: 40, y: 20 })
  })

  test('center shrink crops evenly', () => {
    expect(
      canvasSizeOriginOffset(100, 80, 60, 40, CANVAS_ANCHOR_CENTER),
    ).toEqual({ x: -20, y: -20 })
  })
})

describe('canvasSizeDocument', () => {
  test('no-op when size unchanged', () => {
    const { doc } = docWithLayer(100, 80, { x: 10, y: 5 })
    expect(canvasSizeDocument(doc, { width: 100, height: 80 })).toBe(doc)
  })

  test('grows with left/top anchor without moving layers', () => {
    const { doc, layerId } = docWithLayer(100, 80, { x: 10, y: 5 })
    const next = canvasSizeDocument(doc, {
      width: 140,
      height: 100,
      anchor: { x: 0, y: 0 },
    })
    expect(next.canvas.width).toBe(140)
    expect(next.canvas.height).toBe(100)
    expect(next.layers[layerId]?.transform.x).toBe(10)
    expect(next.layers[layerId]?.transform.y).toBe(5)
  })

  test('grows with right/bottom anchor and shifts layers', () => {
    const { doc, layerId } = docWithLayer(100, 80, { x: 10, y: 5 })
    const next = canvasSizeDocument(doc, {
      width: 140,
      height: 100,
      anchor: { x: 1, y: 1 },
    })
    expect(next.layers[layerId]?.transform.x).toBe(50)
    expect(next.layers[layerId]?.transform.y).toBe(25)
  })

  test('center resize shifts layers by half the delta', () => {
    const { doc, layerId } = docWithLayer(100, 80, { x: 20, y: 10 })
    const next = canvasSizeDocument(doc, {
      width: 200,
      height: 120,
      anchor: CANVAS_ANCHOR_CENTER,
    })
    expect(next.layers[layerId]?.transform.x).toBe(70)
    expect(next.layers[layerId]?.transform.y).toBe(30)
  })

  test('clamps sides to 1..MAX', () => {
    const { doc } = docWithLayer(100, 80, { x: 0, y: 0 })
    const next = canvasSizeDocument(doc, { width: 0, height: 99999 })
    expect(next.canvas.width).toBe(1)
    expect(next.canvas.height).toBe(8192)
  })
})
