import { describe, expect, test } from 'bun:test'
import {
  bevelHeightSteps,
  sampleBevelHeight,
  bevelTechniqueToUniform,
} from './bevelTechnique'

describe('bevelTechnique', () => {
  test('smooth passes alpha through', () => {
    expect(sampleBevelHeight(0.37, 'smooth', 8)).toBeCloseTo(0.37)
  })

  test('chisel-hard posterizes into bands', () => {
    const steps = bevelHeightSteps(8)
    expect(sampleBevelHeight(0.37, 'chisel-hard', 8)).toBeCloseTo(
      Math.floor(0.37 * steps) / steps,
    )
    expect(sampleBevelHeight(0.37, 'chisel-hard', 8)).toBeLessThan(0.37)
  })

  test('chisel-soft eases within bands', () => {
    const hard = sampleBevelHeight(0.37, 'chisel-hard', 8)
    const soft = sampleBevelHeight(0.37, 'chisel-soft', 8)
    expect(soft).toBeGreaterThan(hard)
    expect(soft).toBeLessThanOrEqual(hard + 1 / bevelHeightSteps(8) + 1e-6)
  })

  test('technique uniform mapping', () => {
    expect(bevelTechniqueToUniform('smooth')).toBe(0)
    expect(bevelTechniqueToUniform('chisel-hard')).toBe(1)
    expect(bevelTechniqueToUniform('chisel-soft')).toBe(2)
  })
})
