import { describe, expect, test } from 'bun:test'
import { createGaussianKernel } from './gaussian'

describe('createGaussianKernel', () => {
  test('small radius still yields a normalized kernel', () => {
    const kernel = createGaussianKernel(0.1)
    expect(kernel.radius).toBeGreaterThan(0)
    let total = 0
    for (let i = 0; i < kernel.weights.length; i++) total += kernel.weights[i]!
    expect(total).toBeCloseTo(1, 5)
  })

  test('weights are symmetric and normalized', () => {
    const kernel = createGaussianKernel(5)
    expect(kernel.radius).toBeGreaterThan(0)
    let total = 0
    for (let i = 0; i < kernel.weights.length; i++) {
      total += kernel.weights[i]!
      expect(kernel.weights[i]).toBe(kernel.weights[kernel.weights.length - 1 - i])
    }
    expect(total).toBeCloseTo(1, 5)
  })

  test('support grows with radius', () => {
    const small = createGaussianKernel(1)
    const large = createGaussianKernel(20)
    expect(large.weights.length).toBeGreaterThan(small.weights.length)
  })
})
