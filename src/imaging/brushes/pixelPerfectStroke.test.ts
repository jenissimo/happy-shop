import { describe, expect, test } from 'bun:test'
import {
  omitCornerDoubles,
  pixelStrokePath,
  walkPixelPerfectLine,
} from './pixelPerfectStroke'

describe('walkPixelPerfectLine', () => {
  test('walks a horizontal line without revisiting cells', () => {
    const cells: string[] = []
    walkPixelPerfectLine({ x: 0.5, y: 0.5 }, { x: 3.5, y: 0.5 }, true, (x, y) => {
      cells.push(`${x},${y}`)
    })
    expect(cells).toEqual(['1.5,0.5', '2.5,0.5', '3.5,0.5'])
  })

  test('45° diagonal stays one pixel wide for full segment length', () => {
    expect(pixelStrokePath(0, 0, 12, 12, true).length).toBe(13)
  })

  test('diagonal line omits double-thick corner pixels', () => {
    expect(
      pixelStrokePath(0, 0, 2, 2, true).map((p) => `${p.x},${p.y}`),
    ).toEqual(['0,0', '1,1', '2,2'])
  })

  test('omitCornerDoubles removes inner L corners', () => {
    expect(
      omitCornerDoubles([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ]).map((p) => `${p.x},${p.y}`),
    ).toEqual(['0,0', '1,1', '2,1'])
  })
})
