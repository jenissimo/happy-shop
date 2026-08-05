import { describe, expect, test } from 'bun:test'
import { blurTapPlan, MAX_BLUR_STEPS } from './separableGaussian'

/** Texels the kernel actually spans, per side. */
function reachOf(sigma: number): number {
  const plan = blurTapPlan(sigma)
  return plan.steps * 2 * plan.unit
}

describe('blurTapPlan', () => {
  test('a degenerate sigma collapses to a passthrough copy', () => {
    expect(blurTapPlan(0)).toEqual({ steps: 0, unit: 1 })
  })

  test('the kernel always spans 3 sigma', () => {
    for (const sigma of [1, 2, 13.3, 40, 80, 200, 1000]) {
      expect(reachOf(sigma)).toBeGreaterThanOrEqual(sigma * 3)
    }
  })

  test('taps grow with the radius instead of stretching apart', () => {
    // The defect this replaces: a fixed budget spread over a growing radius.
    for (const sigma of [1, 4, 13.3, 40, 64]) {
      expect(blurTapPlan(sigma).unit).toBe(1)
    }
    expect(blurTapPlan(4).steps).toBeLessThan(blurTapPlan(40).steps)
  })

  test('cost stays bounded once the exact kernel would exceed the budget', () => {
    for (const sigma of [1, 40, 64, 200, 5000]) {
      expect(blurTapPlan(sigma).steps).toBeLessThanOrEqual(MAX_BLUR_STEPS)
    }
    expect(blurTapPlan(5000).unit).toBeGreaterThan(1)
  })
})
