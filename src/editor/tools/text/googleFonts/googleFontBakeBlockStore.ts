import { create } from 'zustand'
import type { LayerId, TextLayer } from '../../../../core/document'
import type { FontResolution } from '../textRasterize'
import { recoverGoogleFontForLayer } from './googleFontRecovery'

type BakeBlockState = {
  layerId: LayerId
  resolution: Extract<FontResolution, { ok: false }>
  retrying: boolean
  onRecovered: () => Promise<void>
}

type GoogleFontBakeBlockStore = {
  block: BakeBlockState | null
  show: (block: Omit<BakeBlockState, 'retrying'>) => void
  clear: () => void
  retry: (layer: TextLayer | undefined) => Promise<boolean>
}

export const useGoogleFontBakeBlockStore = create<GoogleFontBakeBlockStore>((set, get) => ({
  block: null,
  show: (block) => set({ block: { ...block, retrying: false } }),
  clear: () => set({ block: null }),
  retry: async (layer) => {
    const current = get().block
    if (!current || !layer || layer.type !== 'text') return false
    set({ block: { ...current, retrying: true } })
    const resolution = await recoverGoogleFontForLayer(layer)
    if (!resolution.ok) {
      set({ block: { ...current, resolution, retrying: false } })
      return false
    }
    const onRecovered = current.onRecovered
    set({ block: null })
    await onRecovered()
    return true
  },
}))

export function clearGoogleFontBakeBlockForTests(): void {
  useGoogleFontBakeBlockStore.setState({ block: null })
}
