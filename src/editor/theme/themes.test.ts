import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_THEME,
  isThemeId,
  normalizeStoredTheme,
  THEME_IDS,
  THEMES,
} from './themes'

describe('themes', () => {
  test('registers vapor and crystal glass themes', () => {
    expect(THEME_IDS).toContain('vapor')
    expect(THEME_IDS).toContain('crystal')
    expect(isThemeId('vapor')).toBe(true)
    expect(isThemeId('crystal')).toBe(true)
  })

  test('uses Graphite as the first-run default', () => {
    expect(DEFAULT_THEME).toBe('graphite')
    expect(isThemeId('graphite')).toBe(true)
  })

  test('migrates the pre-release Photoshop theme id to Graphite', () => {
    expect(isThemeId('photoshop')).toBe(false)
    expect(normalizeStoredTheme('photoshop')).toBe('graphite')
    expect(normalizeStoredTheme('unknown')).toBe(DEFAULT_THEME)
  })

  test('rejects unknown theme ids', () => {
    expect(isThemeId('not-a-theme')).toBe(false)
    expect(isThemeId(null)).toBe(false)
  })

  test('every theme id has a catalog entry with preview swatches', () => {
    expect(THEMES.map((t) => t.id).sort()).toEqual([...THEME_IDS].sort())
    for (const theme of THEMES) {
      expect(theme.preview.bg).toBeTruthy()
      expect(theme.preview.panel).toBeTruthy()
      expect(theme.preview.raised).toBeTruthy()
      expect(theme.preview.accent).toBeTruthy()
      expect(theme.preview.checkerA).toBeTruthy()
      expect(theme.preview.checkerB).toBeTruthy()
    }
  })

  test('glass themes are flagged for Appearance mockups', () => {
    expect(THEMES.find((t) => t.id === 'vapor')?.preview.glass).toBe(true)
    expect(THEMES.find((t) => t.id === 'crystal')?.preview.glass).toBe(true)
    expect(THEMES.find((t) => t.id === 'midnight')?.preview.glass).toBeUndefined()
  })

  test('light opaque themes use light checker pairs', () => {
    for (const id of ['paper', 'mist'] as const) {
      const preview = THEMES.find((t) => t.id === id)!.preview
      // Light boards are high-luminance hex (leading digit a–f for R channel).
      expect(preview.checkerA.startsWith('#')).toBe(true)
      const r = Number.parseInt(preview.checkerA.slice(1, 3), 16)
      expect(r).toBeGreaterThan(0xb0)
    }
  })
})
