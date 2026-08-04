import { create } from 'zustand'
import {
  persistPixelatedPreviewPref,
  readPixelatedPreviewPref,
  VIEWPORT_PIXELATED_PREVIEW_CHANGED_EVENT,
} from '../../ui/features/settings/prefs'

/** Minimum zoom before 1×1 pixel grid lines are drawn. */
export const PIXEL_GRID_MIN_ZOOM = 1

type ViewPreferencesState = {
  showGrid: boolean
  showPixelGrid: boolean
  pixelatedPreview: boolean
  /** View → Extras (Mod+H). See `EXTRAS_OVERLAYS` for what it governs. */
  extrasVisible: boolean
  setShowGrid: (show: boolean) => void
  setShowPixelGrid: (show: boolean) => void
  setPixelatedPreview: (enabled: boolean) => void
  setExtrasVisible: (visible: boolean) => void
  toggleExtras: () => void
}

/**
 * Overlays Extras hides as a group, matching Photoshop's View → Show set:
 *
 *   - guides (document guides dragged off the rulers)
 *   - grid and pixel grid
 *   - selection edges (marching ants)
 *   - target paths (the pen work path)
 *   - transform/cage handles (Photoshop's "layer edges" equivalent here)
 *
 * Deliberately NOT governed: rulers (own toggle, `view.toggleRulers`, exactly
 * as in Photoshop), pixelated preview (a rendering mode, not an overlay), and
 * live tool cursors/brush rings.
 *
 * Extras is a pure render gate: it never writes `showGrid`/`showPixelGrid`/
 * snap, so turning it back on restores whatever each individual toggle was.
 */
export const EXTRAS_OVERLAYS = [
  'guides',
  'grid',
  'pixelGrid',
  'selectionEdges',
  'targetPaths',
  'transformHandles',
] as const

/** Live mirror of View menu prefs for Pixi overlay passes (non-React render loop). */
export const useViewPreferencesStore = create<ViewPreferencesState>((set) => ({
  showGrid: true,
  showPixelGrid: false,
  pixelatedPreview: readPixelatedPreviewPref(),
  extrasVisible: true,
  setShowGrid: (showGrid) => set({ showGrid }),
  setShowPixelGrid: (showPixelGrid) => set({ showPixelGrid }),
  setExtrasVisible: (extrasVisible) => set({ extrasVisible }),
  toggleExtras: () => set((state) => ({ extrasVisible: !state.extrasVisible })),
  setPixelatedPreview: (pixelatedPreview) => {
    persistPixelatedPreviewPref(pixelatedPreview)
    set({ pixelatedPreview })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(VIEWPORT_PIXELATED_PREVIEW_CHANGED_EVENT))
    }
  },
}))
