import { describe, expect, test } from 'bun:test'
import { checkDecodeLimits } from './decodeLimits'

describe('checkDecodeLimits', () => {
  test('accepts an image within both limits', () => {
    const result = checkDecodeLimits(800, 600, {
      maxSide: 8192,
      softMegapixelLimit: 64,
    })
    expect(result).toEqual({ ok: true, overSoftLimit: false })
  })

  test('rejects an image exceeding the hard per-side limit', () => {
    const result = checkDecodeLimits(9000, 600, { maxSide: 8192 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('dimension-limit-exceeded')
      expect(result.message).toContain('9000x600')
    }
  })

  test('rejects when height exceeds the hard per-side limit', () => {
    const result = checkDecodeLimits(600, 9000, { maxSide: 8192 })
    expect(result.ok).toBe(false)
  })

  test('flags overSoftLimit without failing when megapixels exceed the soft budget', () => {
    const result = checkDecodeLimits(9000, 9000, {
      maxSide: 20000,
      softMegapixelLimit: 64,
    })
    expect(result).toEqual({ ok: true, overSoftLimit: true })
  })

  test('does not flag overSoftLimit when no soft limit is provided', () => {
    const result = checkDecodeLimits(9000, 9000, { maxSide: 20000 })
    expect(result).toEqual({ ok: true, overSoftLimit: false })
  })

  test('boundary: exactly at the soft limit is not over', () => {
    // 8000 x 8000 = 64,000,000 px = 64 megapixels exactly.
    const result = checkDecodeLimits(8000, 8000, {
      maxSide: 8192,
      softMegapixelLimit: 64,
    })
    expect(result).toEqual({ ok: true, overSoftLimit: false })
  })
})
