import { describe, expect, test } from 'bun:test'
import { positionTooltip, tooltipShowDelayMs, markTooltipShown } from './Tooltip'

describe('tooltipShowDelayMs', () => {
  test('uses the normal delay when nothing was shown recently', () => {
    markTooltipShown(0)
    expect(tooltipShowDelayMs(10_000)).toBe(200)
  })

  test('shows instantly within the sibling-hover window', () => {
    markTooltipShown(1000)
    expect(tooltipShowDelayMs(1100)).toBe(0)
  })
})

describe('positionTooltip', () => {
  const viewport = { width: 800, height: 600 }
  const tip = { width: 80, height: 20 }
  const anchor = { left: 40, right: 64, top: 100, bottom: 124, width: 24, height: 24 }

  test('places to the right of the anchor', () => {
    expect(positionTooltip(anchor, tip, viewport, 'right')).toEqual({
      left: 70,
      top: 102,
    })
  })

  test('places below the anchor', () => {
    expect(positionTooltip(anchor, tip, viewport, 'bottom')).toEqual({
      left: 12,
      top: 130,
    })
  })
})
