import { describe, expect, test } from 'bun:test'
import {
  addLayer,
  createEmptyDocument,
  createTextLayer,
} from '../../core/document'
import { toRenderDocumentView } from './toRenderDocumentView'

describe('toRenderDocumentView text layers', () => {
  test('maps text layers into the render view', () => {
    const layer = createTextLayer({
      content: 'Shop',
      fontSize: 36,
      color: '#112233',
      textMode: 'box',
      bounds: { x: 0, y: 0, w: 200, h: 80 },
    })
    const doc = addLayer(createEmptyDocument({ width: 400, height: 300 }), layer)
    const view = toRenderDocumentView(doc, { get: () => undefined })
    expect(view.layers).toHaveLength(1)
    const rendered = view.layers[0]!
    expect(rendered.kind).toBe('text')
    if (rendered.kind === 'text') {
      expect(rendered.content).toBe('Shop')
      expect(rendered.fontSize).toBe(36)
      expect(rendered.color).toBe('#112233')
      expect(rendered.textMode).toBe('box')
      expect(rendered.bounds).toEqual({ w: 200, h: 80 })
    }
  })
})
