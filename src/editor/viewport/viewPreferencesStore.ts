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
  setShowGrid: (show: boolean) => void
  setShowPixelGrid: (show: boolean) => void
  setPixelatedPreview: (enabled: boolean) => void
}

/** Live mirror of View menu prefs for Pixi overlay passes (non-React render loop). */
export const useViewPreferencesStore = create<ViewPreferencesState>((set) => ({
  showGrid: true,
  showPixelGrid: false,
  pixelatedPreview: readPixelatedPreviewPref(),
  setShowGrid: (showGrid) => set({ showGrid }),
  setShowPixelGrid: (showPixelGrid) => set({ showPixelGrid }),
  setPixelatedPreview: (pixelatedPreview) => {
    persistPixelatedPreviewPref(pixelatedPreview)
    set({ pixelatedPreview })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(VIEWPORT_PIXELATED_PREVIEW_CHANGED_EVENT))
    }
  },
}))
