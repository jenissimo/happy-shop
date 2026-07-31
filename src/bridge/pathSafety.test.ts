import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { assertSafeAssetId, resolveUnderRoot } from './pathSafety'

describe('bridge pathSafety', () => {
  const root = join(process.cwd(), 'projects', 'Demo.happyshop')

  test('resolves nested relative paths', () => {
    const abs = resolveUnderRoot(root, 'layers/a.png')
    expect(abs.replace(/\\/g, '/')).toContain('/layers/a.png')
  })

  test('rejects parent traversal', () => {
    expect(() => resolveUnderRoot(root, '../escape.txt')).toThrow()
    expect(() => resolveUnderRoot(root, 'layers/../../escape.txt')).toThrow()
  })

  test('rejects absolute candidates', () => {
    expect(() =>
      resolveUnderRoot(root, join(process.cwd(), 'outside.png')),
    ).toThrow()
  })

  test('assertSafeAssetId', () => {
    expect(assertSafeAssetId('layer_1-abc')).toBe('layer_1-abc')
    expect(() => assertSafeAssetId('../x')).toThrow()
    expect(() => assertSafeAssetId('a/b')).toThrow()
  })
})
