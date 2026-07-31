import { describe, expect, test } from 'bun:test'
import {
  persistSelectionToolPrefs,
  readSelectionToolPrefs,
} from './selectionToolPrefs'

function memoryStorage() {
  const entries = new Map<string, string>()
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  }
}

describe('selection tool variant preferences', () => {
  test('persists selection variants and edge options independently', () => {
    const storage = memoryStorage()
    persistSelectionToolPrefs({ marqueeShape: 'ellipse' }, storage)
    persistSelectionToolPrefs({ marqueeStyle: 'fixedSize' }, storage)
    persistSelectionToolPrefs({ fixedMarqueeWidth: 128, fixedMarqueeHeight: 64 }, storage)
    persistSelectionToolPrefs({ lassoMode: 'magnetic' }, storage)
    persistSelectionToolPrefs({ featherRadius: 12.5, antiAlias: true }, storage)

    expect(readSelectionToolPrefs(storage)).toEqual({
      marqueeShape: 'ellipse',
      marqueeStyle: 'fixedSize',
      fixedMarqueeWidth: 128,
      fixedMarqueeHeight: 64,
      lassoMode: 'magnetic',
      featherRadius: 12.5,
      antiAlias: true,
    })
  })

  test('discards malformed persisted variants', () => {
    const storage = memoryStorage()
    storage.setItem(
      'happy-shop.selection-tool-variants',
      JSON.stringify({
        marqueeShape: 'row',
        lassoMode: 'invalid',
        featherRadius: -1,
        antiAlias: 'yes',
      }),
    )

    expect(readSelectionToolPrefs(storage)).toEqual({})
  })
})
