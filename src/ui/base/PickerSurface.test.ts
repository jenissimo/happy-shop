import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readPinnedWindowPosition } from './PickerSurface'

describe('PickerSurface feasibility', () => {
  test('seeds the floating window from the popover host rect', () => {
    expect(readPinnedWindowPosition({ left: 120.6, top: 88.2, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) })).toEqual({
      x: 121,
      y: 88,
    })
    expect(readPinnedWindowPosition(null)).toBeUndefined()
  })

  test('swaps Popover and FloatingWindow without a scrim', () => {
    const source = readFileSync(join(import.meta.dirname, 'PickerSurface.tsx'), 'utf8')
    expect(source).toContain('FloatingWindow')
    expect(source).toContain('Popover')
    expect(source).toContain('PushPin')
    expect(source).toContain('pinToWindow')
    expect(source).not.toContain('backdrop')
  })

  test('resets pinned mode when the picker closes', () => {
    const source = readFileSync(join(import.meta.dirname, 'PickerSurface.tsx'), 'utf8')
    expect(source).toContain('if (!open) return')
    expect(source).toContain('setPinned(false)')
  })

  test('Popover exposes hostRef for pin handoff', () => {
    const source = readFileSync(join(import.meta.dirname, 'Popover.tsx'), 'utf8')
    expect(source).toContain('hostRef?: RefObject<HTMLDivElement | null>')
    expect(source).toContain('externalHostRef.current = element')
  })
})
