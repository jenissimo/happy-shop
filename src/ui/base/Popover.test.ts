import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isPointWithinRect, positionPopover } from './Popover'

describe('Popover', () => {
  test('clamps every placement into the padded viewport', () => {
    const position = positionPopover(
      { left: 490, right: 510, top: 490, bottom: 510 },
      { width: 180, height: 120 },
      { width: 500, height: 500 },
      'below-start',
    )
    expect(position).toEqual({ left: 312, top: 372 })
  })

  test('positions above and end-aligned anchors before clamping', () => {
    const anchor = { left: 100, right: 200, top: 150, bottom: 180 }
    const popover = { width: 80, height: 50 }
    const viewport = { width: 500, height: 500 }
    expect(positionPopover(anchor, popover, viewport, 'above-start')).toEqual({
      left: 100,
      top: 100,
    })
    expect(positionPopover(anchor, popover, viewport, 'below-end')).toEqual({
      left: 120,
      top: 180,
    })
  })

  test('treats the complete popover bounds as inside', () => {
    const rect = { left: 40, right: 300, top: 60, bottom: 320 }

    // A native scrollbar may target the document rather than its element.
    expect(isPointWithinRect({ clientX: 299, clientY: 120 }, rect)).toBe(true)
    expect(isPointWithinRect({ clientX: 301, clientY: 120 }, rect)).toBe(false)
  })

  test('is portaled and non-modal, with Esc and outside pointer dismissal', () => {
    const source = readFileSync(join(import.meta.dirname, 'Popover.tsx'), 'utf8')
    expect(source).toContain('createPortal')
    expect(source).toContain('document.body')
    expect(source).toContain('aria-modal="false"')
    expect(source).toContain("event.key !== 'Escape'")
    expect(source).toContain("document.addEventListener('pointerdown'")
    expect(source).toContain('isPointWithinRect(event, hostRef.current.getBoundingClientRect())')
    expect(source).toContain("window.addEventListener('scroll', onScroll, true)")
    expect(source).not.toContain('backdrop')
  })
})
