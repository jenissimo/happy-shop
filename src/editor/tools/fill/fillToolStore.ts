import { create } from 'zustand'

const STORAGE_KEY = 'happy-shop.fill.settings'

export type FillToolPrefs = {
  tolerance: number
  antiAlias: boolean
}

const DEFAULTS: FillToolPrefs = { tolerance: 32, antiAlias: false }

function readPrefs(): FillToolPrefs {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<FillToolPrefs>
    return {
      tolerance: Math.max(0, Math.min(255, Math.round(parsed.tolerance ?? DEFAULTS.tolerance))),
      antiAlias: typeof parsed.antiAlias === 'boolean' ? parsed.antiAlias : DEFAULTS.antiAlias,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

type FillToolState = FillToolPrefs & {
  setPrefs: (patch: Partial<FillToolPrefs>) => void
}

export const useFillToolStore = create<FillToolState>((set, get) => ({
  ...readPrefs(),
  setPrefs: (patch) => {
    const next: FillToolPrefs = {
      tolerance: Math.max(0, Math.min(255, Math.round(patch.tolerance ?? get().tolerance))),
      antiAlias: patch.antiAlias ?? get().antiAlias,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* storage unavailable */
    }
    set(next)
  },
}))
