import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { GOOGLE_FONTS_MODE_KEY, readGoogleFontsModePref } from './prefs'

function installMemoryLocalStorage() {
  const entries = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value)
      },
      removeItem: (key: string) => {
        entries.delete(key)
      },
      clear: () => entries.clear(),
    },
  })
}

describe('readGoogleFontsModePref', () => {
  let originalStorage: Storage | undefined

  beforeEach(() => {
    originalStorage = globalThis.localStorage
    installMemoryLocalStorage()
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalStorage,
    })
  })

  test('defaults to live-preview when unset', () => {
    expect(readGoogleFontsModePref()).toBe('live-preview')
  })

  test('honors an explicit off preference', () => {
    localStorage.setItem(GOOGLE_FONTS_MODE_KEY, 'off')
    expect(readGoogleFontsModePref()).toBe('off')
  })
})
