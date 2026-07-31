import { create } from 'zustand'
import { DEFAULT_SNAP, type SnapSettings } from '../geometry'

type SnapPreferencesState = {
  settings: SnapSettings
  setSettings: (settings: SnapSettings) => void
}

/** Live mirror of the workspace View → Snap preference for input controllers. */
export const useSnapPreferencesStore = create<SnapPreferencesState>((set) => ({
  settings: DEFAULT_SNAP,
  setSettings: (settings) => set({ settings }),
}))
