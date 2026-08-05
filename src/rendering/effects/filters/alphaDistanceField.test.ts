import { describe, expect, it } from 'bun:test'
import { jumpFloodSteps } from './alphaDistanceField'

describe('jumpFloodSteps', () => {
  it('halves from the enclosing power of two down to one texel', () => {
    expect(jumpFloodSteps(4)).toEqual([4, 2, 1])
    expect(jumpFloodSteps(5)).toEqual([8, 4, 2, 1])
  })

  it('costs log2(radius) passes, not a radius-dependent tap count', () => {
    // The 24-tap ring this replaced fanned into discrete copies past ~20px.
    expect(jumpFloodSteps(166)).toHaveLength(9)
    expect(jumpFloodSteps(166)[0]).toBe(256)
    expect(jumpFloodSteps(1024)).toHaveLength(11)
  })

  it('always resolves down to a single texel so small radii stay smooth', () => {
    for (const radius of [0, 0.5, 1, 2, 3, 40, 166]) {
      const steps = jumpFloodSteps(radius)
      expect(steps.at(-1)).toBe(1)
      expect(steps[0]).toBeGreaterThanOrEqual(1)
    }
  })

  it('clamps a pathological radius to the widest pad the stack can request', () => {
    expect(jumpFloodSteps(1e6)[0]).toBe(1024)
  })
})
