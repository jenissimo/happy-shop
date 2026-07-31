import { describe, expect, test } from 'bun:test'
import { squareSideFromRadius, squareTipCoverage } from './dabKernel'
import { PENCIL_TIP_ID, PROCEDURAL_TIPS } from './presets/proc'
import { renderTipPreview } from './renderTipPreview'
import { TiledRasterSurface } from '../surfaces/TiledRasterSurface'

describe('squareSideFromRadius', () => {
  test('maps radius to integer diameter', () => {
    expect(squareSideFromRadius(0.5)).toBe(1)
    expect(squareSideFromRadius(1)).toBe(2)
    expect(squareSideFromRadius(10)).toBe(20)
  })
})

describe('squareTipCoverage', () => {
  test('is binary at hardness 1 with no fringe', () => {
    const dabX = 10.5
    const dabY = 10.5
    const side = 3
    const samples = [
      [9.5, 9.5],
      [10.5, 10.5],
      [11.5, 11.5],
      [8.5, 10.5],
      [12.5, 10.5],
    ] as const
    for (const [px, py] of samples) {
      const cover = squareTipCoverage(dabX, dabY, px, py, side, 1)
      expect(cover === 0 || cover === 1).toBe(true)
    }
    expect(squareTipCoverage(dabX, dabY, 10.5, 10.5, side, 1)).toBe(1)
    expect(squareTipCoverage(dabX, dabY, 8.5, 10.5, side, 1)).toBe(0)
  })
})

describe('proc.square-hard', () => {
  test('is registered as a square procedural tip', () => {
    const tip = PROCEDURAL_TIPS.find((entry) => entry.id === PENCIL_TIP_ID)
    expect(tip).toBeDefined()
    expect(tip!.shape).toBe('square')
    expect(tip!.hardness).toBe(1)
  })

  test('preview dab uses only full or empty alpha', () => {
    const tip = PROCEDURAL_TIPS.find((entry) => entry.id === PENCIL_TIP_ID)!
    const preview = renderTipPreview({
      tip,
      size: 5,
      hardness: 1,
      opacity: 1,
      flow: 1,
      spacing: 1,
      angle: 0,
      roundness: 1,
      color: '#ff0000',
      mode: 'paint',
      width: 32,
      height: 32,
      dpr: 1,
      sample: 'dab',
    })
    for (let i = 3; i < preview.data.length; i += 4) {
      const alpha = preview.data[i]!
      expect(alpha === 0 || alpha === 255).toBe(true)
    }
  })
})

describe('TiledRasterSurface.stampSquare', () => {
  test('size 1 paints a single pixel at full opacity', () => {
    const surface = new TiledRasterSurface('sq1', 16, 16)
    surface.stampSquare({
      x: 8.5,
      y: 8.5,
      size: 1,
      opacity: 1,
      color: { r: 255, g: 0, b: 0 },
      mode: 'paint',
    })
    const img = surface.toRgbaBuffer().data
    expect(img[(8 * 16 + 8) * 4 + 3]).toBe(255)
    expect(img[(8 * 16 + 7) * 4 + 3]).toBe(0)
    expect(img[(8 * 16 + 9) * 4 + 3]).toBe(0)
  })

  test('size N paints an N×N block without partial alpha', () => {
    const surface = new TiledRasterSurface('sqn', 32, 32)
    surface.stampSquare({
      x: 16.5,
      y: 16.5,
      size: 4,
      opacity: 1,
      color: { r: 0, g: 255, b: 0 },
      mode: 'paint',
    })
    const img = surface.toRgbaBuffer().data
    let painted = 0
    let partial = 0
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const alpha = img[(y * 32 + x) * 4 + 3]!
        if (alpha > 0) {
          painted++
          if (alpha !== 255) partial++
        }
      }
    }
    expect(painted).toBe(16)
    expect(partial).toBe(0)
  })

  test('stampTip routes proc.square-hard through stampSquare', () => {
    const surface = new TiledRasterSurface('route', 16, 16)
    surface.stampTip({
      x: 4.5,
      y: 4.5,
      radius: 0.5,
      angle: 0,
      roundness: 1,
      hardness: 1,
      opacity: 1,
      color: { r: 255, g: 255, b: 0 },
      mode: 'paint',
      alpha: null,
      tipId: PENCIL_TIP_ID,
    })
    const img = surface.toRgbaBuffer().data
    expect(img[(4 * 16 + 4) * 4 + 3]).toBe(255)
    expect(img[(4 * 16 + 5) * 4 + 3]).toBe(0)
  })
})
