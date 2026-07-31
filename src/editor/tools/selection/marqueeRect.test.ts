import { describe, expect, test } from 'bun:test'
import {
  marqueeStyleIgnoresMinDrag,
  resolveMarqueeRect,
} from './marqueeRect'
import { NO_MODIFIERS } from '../toolModifiers'

describe('resolveMarqueeRect', () => {
  const canvas = { width: 100, height: 80 }

  test('single pixel selects one document pixel', () => {
    const rect = resolveMarqueeRect({
      start: { x: 12.7, y: 8.2 },
      end: { x: 12.7, y: 8.2 },
      mods: NO_MODIFIERS,
      modifiersAtDown: NO_MODIFIERS,
      style: 'singlePixel',
      fixedSize: { width: 64, height: 64 },
      canvas,
    })
    expect(rect).toEqual({ x: 12, y: 8, width: 1, height: 1 })
  })

  test('single row forces 1px height', () => {
    const rect = resolveMarqueeRect({
      start: { x: 10, y: 20 },
      end: { x: 40, y: 35 },
      mods: NO_MODIFIERS,
      modifiersAtDown: NO_MODIFIERS,
      style: 'singleRow',
      fixedSize: { width: 64, height: 64 },
      canvas,
    })
    expect(rect.height).toBe(1)
    expect(rect.width).toBe(30)
  })

  test('single column forces 1px width', () => {
    const rect = resolveMarqueeRect({
      start: { x: 10, y: 20 },
      end: { x: 25, y: 50 },
      mods: NO_MODIFIERS,
      modifiersAtDown: NO_MODIFIERS,
      style: 'singleColumn',
      fixedSize: { width: 64, height: 64 },
      canvas,
    })
    expect(rect.width).toBe(1)
    expect(rect.height).toBe(30)
  })

  test('fixed size uses configured dimensions centered on click', () => {
    const rect = resolveMarqueeRect({
      start: { x: 50, y: 40 },
      end: { x: 50, y: 40 },
      mods: NO_MODIFIERS,
      modifiersAtDown: NO_MODIFIERS,
      style: 'fixedSize',
      fixedSize: { width: 20, height: 10 },
      canvas,
    })
    expect(rect).toEqual({ x: 40, y: 35, width: 20, height: 10 })
  })

  test('fixed size and single pixel ignore min drag threshold', () => {
    expect(marqueeStyleIgnoresMinDrag('fixedSize')).toBe(true)
    expect(marqueeStyleIgnoresMinDrag('singlePixel')).toBe(true)
    expect(marqueeStyleIgnoresMinDrag('normal')).toBe(false)
  })
})
