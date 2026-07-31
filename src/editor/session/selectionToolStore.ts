import { create } from 'zustand'
import type {
  SelectionCombineMode,
  SelectionPoint,
  SelectionRect,
} from './SelectionMask'
import {
  persistSelectionToolPrefs,
  readSelectionToolPrefs,
} from './selectionToolPrefs'

export type MarqueeShape = 'rect' | 'ellipse'
export type MarqueeStyle =
  | 'normal'
  | 'fixedSize'
  | 'singleRow'
  | 'singleColumn'
  | 'singlePixel'
export type LassoMode = 'freehand' | 'polygonal' | 'magnetic'

const LASSO_MODES: readonly LassoMode[] = ['freehand', 'polygonal', 'magnetic']
const persistedVariants = readSelectionToolPrefs()

export type SelectionPreview =
  | null
  | { kind: 'rect'; rect: SelectionRect }
  | { kind: 'ellipse'; rect: SelectionRect }
  | { kind: 'path'; points: SelectionPoint[]; closed: boolean }

type SelectionToolState = {
  marqueeShape: MarqueeShape
  marqueeStyle: MarqueeStyle
  /** Fixed-size marquee width/height in document pixels. */
  fixedMarqueeWidth: number
  fixedMarqueeHeight: number
  lassoMode: LassoMode
  combineMode: SelectionCombineMode
  /** Radius in document pixels applied after marquee/lasso commits. */
  featherRadius: number
  /** Supersample curved/freehand selection edges at commit. */
  antiAlias: boolean
  /** Magic wand color tolerance (0–255, max-channel Δ). */
  wandTolerance: number
  /** Live drag / polygonal rubber-band preview (not committed). */
  preview: SelectionPreview
  setMarqueeShape: (shape: MarqueeShape) => void
  setMarqueeStyle: (style: MarqueeStyle) => void
  setFixedMarqueeSize: (width: number, height: number) => void
  setLassoMode: (mode: LassoMode) => void
  setCombineMode: (mode: SelectionCombineMode) => void
  setFeatherRadius: (radius: number) => void
  setAntiAlias: (enabled: boolean) => void
  setWandTolerance: (tolerance: number) => void
  setPreview: (preview: SelectionPreview) => void
  clearPreview: () => void
  cycleMarqueeShape: (direction?: 1 | -1) => MarqueeShape
  cycleLassoMode: (direction?: 1 | -1) => LassoMode
}

function clampFixedMarqueeSize(value: number): number {
  return Math.max(1, Math.min(10000, Math.round(Number.isFinite(value) ? value : 1)))
}

export const useSelectionToolStore = create<SelectionToolState>((set, get) => ({
  marqueeShape: persistedVariants.marqueeShape ?? 'rect',
  marqueeStyle: persistedVariants.marqueeStyle ?? 'normal',
  fixedMarqueeWidth: persistedVariants.fixedMarqueeWidth ?? 64,
  fixedMarqueeHeight: persistedVariants.fixedMarqueeHeight ?? 64,
  lassoMode: persistedVariants.lassoMode ?? 'freehand',
  combineMode: 'new',
  featherRadius: persistedVariants.featherRadius ?? 0,
  antiAlias: persistedVariants.antiAlias ?? false,
  wandTolerance: 32,
  preview: null,

  setMarqueeShape: (marqueeShape) => {
    persistSelectionToolPrefs({ marqueeShape })
    set({ marqueeShape })
  },
  setMarqueeStyle: (marqueeStyle) => {
    persistSelectionToolPrefs({ marqueeStyle })
    set({ marqueeStyle })
  },
  setFixedMarqueeSize: (width, height) => {
    const fixedMarqueeWidth = clampFixedMarqueeSize(width)
    const fixedMarqueeHeight = clampFixedMarqueeSize(height)
    persistSelectionToolPrefs({ fixedMarqueeWidth, fixedMarqueeHeight })
    set({ fixedMarqueeWidth, fixedMarqueeHeight })
  },
  setLassoMode: (lassoMode) => {
    persistSelectionToolPrefs({ lassoMode })
    set({ lassoMode })
  },
  setCombineMode: (combineMode) => set({ combineMode }),
  setFeatherRadius: (featherRadius) => {
    const next = Math.max(0, Math.min(250, Number.isFinite(featherRadius) ? featherRadius : 0))
    persistSelectionToolPrefs({ featherRadius: next })
    set({ featherRadius: next })
  },
  setAntiAlias: (antiAlias) => {
    persistSelectionToolPrefs({ antiAlias })
    set({ antiAlias })
  },
  setWandTolerance: (wandTolerance) =>
    set({
      wandTolerance: Math.max(0, Math.min(255, Math.round(wandTolerance))),
    }),
  setPreview: (preview) => set({ preview }),
  clearPreview: () => set({ preview: null }),

  cycleMarqueeShape: (direction = 1) => {
    const next: MarqueeShape =
      direction === 1
        ? get().marqueeShape === 'rect' ? 'ellipse' : 'rect'
        : get().marqueeShape === 'ellipse' ? 'rect' : 'ellipse'
    persistSelectionToolPrefs({ marqueeShape: next })
    set({ marqueeShape: next })
    return next
  },

  cycleLassoMode: (direction = 1) => {
    const current = get().lassoMode
    const idx = LASSO_MODES.indexOf(current)
    const next =
      LASSO_MODES[(idx + direction + LASSO_MODES.length) % LASSO_MODES.length]!
    persistSelectionToolPrefs({ lassoMode: next })
    set({ lassoMode: next })
    return next
  },
}))
