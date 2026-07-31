import { describe, expect, test } from 'bun:test'
import { createShapeLayer } from '../../../core/document'
import { bakeShapeLayer } from './shapeRasterize'

describe('bakeShapeLayer', () => {
  test('bakes opaque filled rect', () => {
    const layer = createShapeLayer({
      primitive: 'rect',
      bounds: { x: 0, y: 0, w: 8, h: 6 },
      fill: { enabled: true, color: '#ff0000', opacity: 1 },
      stroke: { enabled: false, color: '#000000', opacity: 1, width: 0 },
    })
    const baked = bakeShapeLayer(layer)
    expect(baked.width).toBe(8)
    expect(baked.height).toBe(6)
    // Center pixel should be red opaque.
    const i = (3 * baked.width + 4) * 4
    expect(baked.rgba[i]).toBe(255)
    expect(baked.rgba[i + 1]).toBe(0)
    expect(baked.rgba[i + 2]).toBe(0)
    expect(baked.rgba[i + 3]).toBe(255)
  })

  test('ellipse leaves corner transparent', () => {
    const layer = createShapeLayer({
      primitive: 'ellipse',
      bounds: { x: 0, y: 0, w: 20, h: 20 },
      fill: { enabled: true, color: '#00ff00', opacity: 1 },
      stroke: { enabled: false, color: '#000000', opacity: 1, width: 0 },
    })
    const baked = bakeShapeLayer(layer)
    // Corner of bbox should be outside ellipse.
    expect(baked.rgba[3]).toBe(0)
    // Center opaque.
    const cx = Math.floor(baked.width / 2)
    const cy = Math.floor(baked.height / 2)
    const i = (cy * baked.width + cx) * 4
    expect(baked.rgba[i + 3]).toBe(255)
  })

  test('bakes a rounded rectangle with transparent corners', () => {
    const layer = createShapeLayer({
      primitive: 'rect',
      bounds: { x: 0, y: 0, w: 20, h: 20 },
      cornerRadius: 6,
      fill: { enabled: true, color: '#ffffff', opacity: 1 },
      stroke: { enabled: false, color: '#000000', opacity: 1, width: 0 },
    })
    const baked = bakeShapeLayer(layer)
    expect(baked.rgba[3]).toBe(0)
    expect(baked.rgba[(10 * baked.width + 10) * 4 + 3]).toBe(255)
  })

  test('bakes a polygon with transparent bounding-box corner', () => {
    const layer = createShapeLayer({
      primitive: 'polygon',
      bounds: { x: 0, y: 0, w: 20, h: 20 },
      sides: 5,
      fill: { enabled: true, color: '#ffffff', opacity: 1 },
      stroke: { enabled: false, color: '#000000', opacity: 1, width: 0 },
    })
    const baked = bakeShapeLayer(layer)
    expect(baked.rgba[3]).toBe(0)
    expect(baked.rgba[(10 * baked.width + 10) * 4 + 3]).toBe(255)
  })
})
