import { create } from 'zustand'

/** Zoom % for status bar / chrome (updated from ViewportHost render loop). */
type ViewportZoomState = {
  zoomPercent: number
  setZoomPercent: (zoomPercent: number) => void
}

export const useViewportZoomStore = create<ViewportZoomState>((set) => ({
  zoomPercent: 100,
  setZoomPercent: (zoomPercent) => set({ zoomPercent }),
}))
