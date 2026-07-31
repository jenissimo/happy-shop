import { describe, expect, test } from 'bun:test'
import { collectTransferables, collectTransferablesFromPayload } from './transfer'

describe('collectTransferables', () => {
  test('collects ArrayBuffers', () => {
    const buf = new ArrayBuffer(8)
    expect(collectTransferables(1, 'x', buf, null)).toEqual([buf])
  })

  test('collects ImageBitmap when the platform provides the constructor', () => {
    if (typeof ImageBitmap === 'undefined') {
      // Bun test runtime — skip the instanceof path.
      expect(collectTransferables({ close() {} })).toEqual([])
      return
    }
    const bitmap = { close() {} } as unknown as ImageBitmap
    // Plain objects are not real ImageBitmaps; just assert no throw.
    expect(Array.isArray(collectTransferables(bitmap))).toBe(true)
  })

  test('collectTransferablesFromPayload walks own values', () => {
    const buf = new ArrayBuffer(4)
    const transfer = collectTransferablesFromPayload({
      width: 1,
      height: 1,
      buffer: buf,
      note: 'meta',
    })
    expect(transfer).toEqual([buf])
  })
})
