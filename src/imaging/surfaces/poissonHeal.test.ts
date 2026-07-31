import { describe, expect, test } from 'bun:test'
import { solvePoissonHealLite } from './poissonHeal'

describe('solvePoissonHealLite', () => {
  test('matches destination on a flat field with no source detail', () => {
    const region = { x: 4, y: 4, width: 5, height: 5 }
    const dest = () => [120, 80, 40] as [number, number, number]
    const rgb = solvePoissonHealLite({
      region,
      centerX: 6.5,
      centerY: 6.5,
      radius: 2,
      destSample: dest,
      sourceSample: dest,
      iterations: 24,
    })
    const center = (2 * region.width + 2) * 3
    expect(rgb[center]).toBeCloseTo(120, 0)
    expect(rgb[center + 1]).toBeCloseTo(80, 0)
    expect(rgb[center + 2]).toBeCloseTo(40, 0)
  })

  test('transplants source detail while respecting warm destination boundary', () => {
    const region = { x: 0, y: 0, width: 11, height: 11 }
    const warm: [number, number, number] = [180, 130, 80]
    const cool: [number, number, number] = [20, 70, 180]
    const destSample = (_x: number, _y: number): [number, number, number] => warm
    const sourceSample = (x: number, y: number): [number, number, number] => {
      const px = Math.floor(x)
      const py = Math.floor(y)
      if (px === 5 && py === 5) return [255, 70, 180]
      return cool
    }
    const rgb = solvePoissonHealLite({
      region,
      centerX: 5.5,
      centerY: 5.5,
      radius: 3,
      destSample,
      sourceSample,
      iterations: 24,
    })
    const center = (5 * region.width + 5) * 3
    expect(rgb[center]!).toBeGreaterThan(warm[0])
    expect(rgb[center + 1]!).toBeCloseTo(warm[1], -1)
    expect(rgb[center + 2]!).toBeCloseTo(warm[2], -1)
  })
})
