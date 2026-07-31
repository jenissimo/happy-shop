import { beforeEach, describe, expect, test } from 'bun:test'
import { useBrushSettingsStore } from '../tools/brush/brushSettingsStore'
import {
  DEFAULT_BACKGROUND,
  DEFAULT_FOREGROUND,
  useColorStore,
} from './colorStore'
import { usePaletteStore } from './paletteStore'

describe('useColorStore', () => {
  beforeEach(() => {
    usePaletteStore.setState({ snapToPalette: false, activeColors: [] })
    useColorStore.getState().resetDefaults()
    useBrushSettingsStore.getState().setPrefs({ color: DEFAULT_FOREGROUND })
  })

  test('setForeground syncs brush color', () => {
    useColorStore.getState().setForeground('#ff0000')
    expect(useColorStore.getState().foreground).toBe('#ff0000')
    expect(useBrushSettingsStore.getState().color).toBe('#ff0000')
  })

  test('swap exchanges FG/BG and syncs brush to new FG', () => {
    useColorStore.getState().setForeground('#112233')
    useColorStore.getState().setBackground('#aabbcc')
    useColorStore.getState().swap()
    expect(useColorStore.getState().foreground).toBe('#aabbcc')
    expect(useColorStore.getState().background).toBe('#112233')
    expect(useBrushSettingsStore.getState().color).toBe('#aabbcc')
  })

  test('resetDefaults restores black/white', () => {
    useColorStore.getState().setForeground('#ff00ff')
    useColorStore.getState().resetDefaults()
    expect(useColorStore.getState().foreground).toBe(DEFAULT_FOREGROUND)
    expect(useColorStore.getState().background).toBe(DEFAULT_BACKGROUND)
    expect(useBrushSettingsStore.getState().color).toBe(DEFAULT_FOREGROUND)
  })
})
