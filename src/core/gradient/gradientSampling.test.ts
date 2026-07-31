import { describe, expect, test } from 'bun:test'
import { interpolateGradientStop, sampleGradientStops } from './gradientSampling'

const THREE_STOP = [
  { offset: 0, color: '#000000', opacity: 0 },
  { offset: 0.5, color: '#ff0000', opacity: 0.5 },
  { offset: 1, color: '#ffffff', opacity: 1 },
] as const

describe('sampleGradientStops', () => {
  test('sorts unsorted stops before sampling', () => {
    const sample = sampleGradientStops(
      [
        { offset: 1, color: '#ffffff', opacity: 1 },
        { offset: 0, color: '#000000', opacity: 0 },
      ],
      0,
    )
    expect(sample.r).toBe(0)
    expect(sample.opacity).toBe(0)
  })

  test('clamps below the first stop', () => {
    const sample = sampleGradientStops(THREE_STOP, -0.25)
    expect(sample.r).toBe(0)
    expect(sample.opacity).toBe(0)
  })

  test('clamps above the last stop', () => {
    const sample = sampleGradientStops(THREE_STOP, 1.5)
    expect(sample.r).toBe(255)
    expect(sample.g).toBe(255)
    expect(sample.b).toBe(255)
    expect(sample.opacity).toBe(1)
  })

  test('interpolates color and opacity between mid stops', () => {
    const sample = sampleGradientStops(THREE_STOP, 0.75)
    expect(sample.r).toBeCloseTo(255)
    expect(sample.g).toBeCloseTo(127.5)
    expect(sample.b).toBeCloseTo(127.5)
    expect(sample.opacity).toBeCloseTo(0.75)
  })

  test('handles short hex colors', () => {
    const sample = sampleGradientStops(
      [
        { offset: 0, color: '#f00', opacity: 1 },
        { offset: 1, color: '#0f0', opacity: 1 },
      ],
      0.5,
    )
    expect(sample.r).toBeCloseTo(127.5)
    expect(sample.g).toBeCloseTo(127.5)
    expect(sample.b).toBe(0)
  })
})

describe('interpolateGradientStop', () => {
  test('returns a clamped stop sampled from the ramp', () => {
    const stop = interpolateGradientStop(THREE_STOP, 0.75)
    expect(stop.offset).toBe(0.75)
    expect(stop.color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(stop.opacity).toBeCloseTo(0.75)
  })
})
