import { describe, expect, test } from 'bun:test'
import { extractSimpleSvgPath, parseSimpleSvgPath, shapePath } from './shapeGeometry'

describe('simple SVG shape geometry', () => {
  test('parses editable relative path data', () => {
    expect(parseSimpleSvgPath('M 2 3 l 8 0 v 5 h -8 z')).toEqual({
      closed: true,
      points: [{ x: 2, y: 3 }, { x: 10, y: 3 }, { x: 10, y: 8 }, { x: 2, y: 8 }],
    })
  })

  test('tessellates cubic path data for rendering', () => {
    const path = parseSimpleSvgPath('M 0 0 C 20 0 40 20 60 20 L 60 60 Z')
    expect(path?.closed).toBe(true)
    expect(path?.points.length).toBeGreaterThan(4)
  })

  test('imports the first simple polygon from SVG markup', () => {
    expect(extractSimpleSvgPath('<svg><polygon points="0,0 10,0 5,10"/></svg>')).toEqual({
      closed: true,
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }],
    })
  })

  test('constructs star points from its editable parameters', () => {
    const path = shapePath({
      primitive: 'star',
      bounds: { x: 0, y: 0, w: 40, h: 40 },
      starPoints: 5,
      starInset: 0.4,
    })
    expect(path?.closed).toBe(true)
    expect(path?.points).toHaveLength(10)
  })
})
