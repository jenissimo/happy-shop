import { create } from 'zustand'
import { loadLospecPalette, loadLospecPaletteIndex } from '../../imaging/palettes/lospecCatalog'

const STORAGE_KEY = 'happy-shop.palette.prefs'

type StoredPalettePrefs = {
  activePaletteId?: string | null
  snapToPalette?: boolean
}

type PaletteUiState = {
  activePaletteId: string | null
  activeColors: readonly string[]
  snapToPalette: boolean
  setActivePaletteId: (id: string | null) => void
  setActivePaletteColors: (colors: readonly string[]) => void
  setSnapToPalette: (enabled: boolean) => void
}

function readStoredPrefs(): StoredPalettePrefs {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as StoredPalettePrefs
  } catch {
    return {}
  }
}

function writeStoredPrefs(partial: StoredPalettePrefs): void {
  try {
    const next = { ...readStoredPrefs(), ...partial }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // localStorage unavailable in private browsing.
  }
}

function loadPaletteColors(id: string): void {
  void loadLospecPalette(id)
    .then((palette) => {
      const state = usePaletteStore.getState()
      if (state.activePaletteId !== id) return
      usePaletteStore.setState({ activeColors: palette.colors })
    })
    .catch(() => {
      const state = usePaletteStore.getState()
      if (state.activePaletteId === id) {
        usePaletteStore.setState({ activeColors: [] })
      }
    })
}

const stored = readStoredPrefs()

export const usePaletteStore = create<PaletteUiState>((set) => ({
  activePaletteId: stored.activePaletteId ?? null,
  activeColors: [],
  snapToPalette: stored.snapToPalette === true,

  setActivePaletteId: (id) => {
    set({ activePaletteId: id, activeColors: [] })
    writeStoredPrefs({ activePaletteId: id })
    if (id) loadPaletteColors(id)
  },

  setActivePaletteColors: (colors) => {
    set({ activeColors: colors })
  },

  setSnapToPalette: (enabled) => {
    set({ snapToPalette: enabled })
    writeStoredPrefs({ snapToPalette: enabled })
  },
}))

/** Seed the first catalog palette when nothing is selected yet. */
export function ensureDefaultPaletteSelection(): void {
  const { activePaletteId } = usePaletteStore.getState()
  if (activePaletteId) {
    if (usePaletteStore.getState().activeColors.length === 0) {
      loadPaletteColors(activePaletteId)
    }
    return
  }
  void loadLospecPaletteIndex()
    .then((entries) => {
      const id = entries[0]?.id
      if (id) usePaletteStore.getState().setActivePaletteId(id)
    })
    .catch(() => {
      // Catalog unavailable offline — snap stays inert until Swatches panel loads.
    })
}

if (typeof localStorage !== 'undefined') {
  ensureDefaultPaletteSelection()
}
