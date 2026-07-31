import { create } from 'zustand'

type LiquifyFreezeState = {
  /** layerId → layer-local A8 pin mask (width × height bytes). Session-only; not persisted. */
  masks: Record<string, Uint8Array>
  version: number
  ensureMask: (layerId: string, width: number, height: number) => Uint8Array
  getMask: (layerId: string) => Uint8Array | undefined
  clearMask: (layerId: string) => void
  bumpVersion: () => void
}

export const useLiquifyFreezeStore = create<LiquifyFreezeState>((set, get) => ({
  masks: {},
  version: 0,
  ensureMask: (layerId, width, height) => {
    const existing = get().masks[layerId]
    if (existing && existing.length === width * height) return existing
    const mask = new Uint8Array(width * height)
    set((state) => ({ masks: { ...state.masks, [layerId]: mask } }))
    return mask
  },
  getMask: (layerId) => get().masks[layerId],
  clearMask: (layerId) => {
    set((state) => {
      const next = { ...state.masks }
      delete next[layerId]
      return { masks: next, version: state.version + 1 }
    })
  },
  bumpVersion: () => set((state) => ({ version: state.version + 1 })),
}))
