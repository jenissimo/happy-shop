import { create } from 'zustand'
import { useBrushSettingsStore } from '../tools/brush/brushSettingsStore'
import { snapToActivePalette } from './snapToActivePalette'

export const DEFAULT_FOREGROUND = '#000000'
export const DEFAULT_BACKGROUND = '#ffffff'

type ColorState = {
  foreground: string
  background: string
  setForeground: (color: string) => void
  setBackground: (color: string) => void
  swap: () => void
  resetDefaults: () => void
}

function syncBrushColor(color: string): void {
  useBrushSettingsStore.getState().setPrefs({ color })
}

export const useColorStore = create<ColorState>((set, get) => ({
  foreground: DEFAULT_FOREGROUND,
  background: DEFAULT_BACKGROUND,

  setForeground: (color) => {
    const next = snapToActivePalette(color)
    if (next === get().foreground) return
    set({ foreground: next })
    syncBrushColor(next)
  },

  setBackground: (color) => {
    set({ background: color })
  },

  swap: () => {
    const { foreground, background } = get()
    set({ foreground: background, background: foreground })
    syncBrushColor(background)
  },

  resetDefaults: () => {
    set({
      foreground: DEFAULT_FOREGROUND,
      background: DEFAULT_BACKGROUND,
    })
    syncBrushColor(DEFAULT_FOREGROUND)
  },
}))
