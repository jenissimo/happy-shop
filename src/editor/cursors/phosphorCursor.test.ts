import { describe, expect, test } from 'bun:test'
import eyedropperSvg from '@phosphor-icons/core/regular/eyedropper.svg?raw'
import {
  cssCursorFromPhosphor,
  phosphorCursorDataUrl,
  phosphorPathD,
} from './phosphorCursor'

describe('phosphorCursor', () => {
  test('extracts path d from Phosphor SVG', () => {
    const d = phosphorPathD(eyedropperSvg)
    expect(d.length).toBeGreaterThan(20)
    expect(d.startsWith('M')).toBe(true)
  })

  test('builds dual-tone data URL cursor css', () => {
    const css = cssCursorFromPhosphor(eyedropperSvg, {
      x: 2,
      y: 22,
      fallback: 'cell',
    })
    expect(css.startsWith('url("data:image/svg+xml,')).toBe(true)
    expect(css.endsWith(', cell')).toBe(true)
    expect(css).toContain('2 22')
    const url = phosphorCursorDataUrl(phosphorPathD(eyedropperSvg))
    expect(decodeURIComponent(url)).toContain('stroke="#fff"')
    expect(decodeURIComponent(url)).toContain('fill="#111"')
  })
})
