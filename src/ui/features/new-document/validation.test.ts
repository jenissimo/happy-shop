import { describe, expect, test } from 'bun:test'
import {
  canSubmitNewDocument,
  clampDimension,
  createDefaultFormState,
  isOverSoftLimit,
  normalizeHexColor,
  resolveBackground,
} from './validation'

describe('clampDimension', () => {
  test('rounds and clamps to the 1..8192 range', () => {
    expect(clampDimension(100.6)).toBe(101)
    expect(clampDimension(0)).toBe(1)
    expect(clampDimension(-5)).toBe(1)
    expect(clampDimension(999999)).toBe(8192)
  })

  test('falls back to 1 for non-finite input', () => {
    expect(clampDimension(Number.NaN)).toBe(1)
    expect(clampDimension(Number.POSITIVE_INFINITY)).toBe(1)
  })
})

describe('isOverSoftLimit', () => {
  test('flags documents over 64 megapixels', () => {
    // Soft limit is exclusive at 64MP (8000×8000 === 64.0, not over).
    expect(isOverSoftLimit(8000, 8000)).toBe(false)
    expect(isOverSoftLimit(8001, 8000)).toBe(true)
    expect(isOverSoftLimit(1024, 768)).toBe(false)
  })
})

describe('normalizeHexColor', () => {
  test('passes through valid hex colors', () => {
    expect(normalizeHexColor('#ff0000')).toBe('#ff0000')
    expect(normalizeHexColor('#ff0000aa')).toBe('#ff0000aa')
  })

  test('falls back for invalid input', () => {
    expect(normalizeHexColor('red')).toBe('#ffffff')
    expect(normalizeHexColor('not-a-color', '#000000')).toBe('#000000')
  })
})

describe('resolveBackground', () => {
  test('maps each background option', () => {
    const base = createDefaultFormState()
    expect(resolveBackground({ ...base, background: 'transparent' })).toBe('transparent')
    expect(resolveBackground({ ...base, background: 'white' })).toEqual({ color: '#ffffff' })
    expect(resolveBackground({ ...base, background: 'black' })).toEqual({ color: '#000000' })
    expect(
      resolveBackground({ ...base, background: 'custom', customColor: '#123456' }),
    ).toEqual({ color: '#123456' })
  })

  test('falls back to white for an invalid custom color', () => {
    expect(
      resolveBackground({ ...createDefaultFormState(), background: 'custom', customColor: 'nope' }),
    ).toEqual({ color: '#ffffff' })
  })
})

describe('canSubmitNewDocument', () => {
  test('accepts a valid default form', () => {
    expect(canSubmitNewDocument(createDefaultFormState())).toBe(true)
  })

  test('rejects an empty name', () => {
    expect(canSubmitNewDocument({ ...createDefaultFormState(), name: '   ' })).toBe(false)
  })

  test('rejects non-positive or non-integer dimensions', () => {
    expect(canSubmitNewDocument({ ...createDefaultFormState(), width: 0 })).toBe(false)
    expect(canSubmitNewDocument({ ...createDefaultFormState(), height: 10.5 })).toBe(false)
  })

  test('rejects dimensions over the hard 8192px side limit', () => {
    expect(canSubmitNewDocument({ ...createDefaultFormState(), width: 9000 })).toBe(false)
  })

  test('rejects an invalid custom color', () => {
    expect(
      canSubmitNewDocument({
        ...createDefaultFormState(),
        background: 'custom',
        customColor: 'nope',
      }),
    ).toBe(false)
  })

  test('requires megapixel confirmation past the soft 64MP limit', () => {
    const over = { ...createDefaultFormState(), width: 8001, height: 8000 }
    expect(canSubmitNewDocument(over)).toBe(false)
    expect(canSubmitNewDocument({ ...over, megapixelConfirmed: true })).toBe(true)
  })
})
