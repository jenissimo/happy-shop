import { describe, expect, test } from 'bun:test'
import {
  addLayer,
  createEmptyDocument,
  createShapeLayer,
} from '../../core/document'
import { toRenderDocumentView } from './toRenderDocumentView'

describe('toRenderDocumentView shape layers', () => {
  test('maps shape layers into the render view for Pixi Graphics', () => {
    const layer = createShapeLayer({
      primitive: 'ellipse',
      bounds: { x: 0, y: 0, w: 120, h: 80 },
      fill: { color: '#ff0000', opacity: 0.8 },
      stroke: { enabled: true, width: 3, color: '#00ff00' },
      transform: { x: 40, y: 20 },
    })
    const doc = addLayer(createEmptyDocument({ width: 400, height: 300 }), layer)
    const view = toRenderDocumentView(doc, { get: () => undefined })
    expect(view.layers).toHaveLength(1)
    const rendered = view.layers[0]!
    expect(rendered.kind).toBe('shape')
    if (rendered.kind === 'shape') {
      expect(rendered.primitive).toBe('ellipse')
      expect(rendered.bounds).toEqual({ x: 0, y: 0, w: 120, h: 80 })
      expect(rendered.fill.color).toBe('#ff0000')
      expect(rendered.fill.opacity).toBe(0.8)
      expect(rendered.stroke.width).toBe(3)
      expect(rendered.transform.x).toBe(40)
      expect(rendered.transform.y).toBe(20)
    }
  })

  test('preserves expanded vector parameters for live rendering', () => {
    const layer = createShapeLayer({
      primitive: 'star',
      bounds: { x: 0, y: 0, w: 120, h: 80 },
      starPoints: 7,
      starInset: 0.35,
    })
    const doc = addLayer(createEmptyDocument(), layer)
    const rendered = toRenderDocumentView(doc, { get: () => undefined }).layers[0]
    expect(rendered?.kind).toBe('shape')
    if (rendered?.kind === 'shape') {
      expect(rendered.starPoints).toBe(7)
      expect(rendered.starInset).toBe(0.35)
    }
  })
})
