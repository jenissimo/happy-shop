import { create } from 'zustand'
import {
  SelectionMask,
  normalizeRect,
  type SelectionCombineMode,
  type SelectionRect,
} from './SelectionMask'
import { useEditorSessionStore } from './EditorSessionStore'
import { useSelectionToolStore } from './selectionToolStore'

export type { SelectionRect } from './SelectionMask'

type SelectionState = {
  /** Document-space AABB preview / bounds; null = no selection. */
  marquee: SelectionRect | null
  /** Previous selection bounds for Select → Reselect. */
  lastMarquee: SelectionRect | null
  /** Full selection mask (rect-compact or A8); null when empty / zero-size drag. */
  mask: SelectionMask | null
  lastMask: SelectionMask | null
  setMarquee: (rect: SelectionRect | null) => void
  setMask: (mask: SelectionMask | null) => void
  /**
   * Commit an incoming shape using the options-bar combine mode
   * (or an explicit mode). Empty result clears the selection.
   */
  applyMask: (
    incoming: SelectionMask,
    mode?: SelectionCombineMode,
  ) => void
  deselect: () => void
  reselect: () => void
  /**
   * Image → Canvas Size: keep the selection pinned to the pixels it was drawn
   * on. `offsetX/offsetY` is where the old canvas origin lands in the new
   * canvas (see `canvasSizeOriginOffset`); anything outside is dropped.
   */
  canvasResized: (
    width: number,
    height: number,
    offsetX: number,
    offsetY: number,
  ) => void
  /** Image → Image Size: scale the selection with the resampled document. */
  documentResampled: (width: number, height: number) => void
  selectAll: (width: number, height: number) => void
  inverse: (width: number, height: number) => void
  hasSelection: () => boolean
  /** True when document point is inside the active mask / marquee. */
  containsPoint: (docX: number, docY: number) => boolean
}

/** Rect selections without a mask still need remapping on a resize. */
function remapRect(
  rect: SelectionRect | null,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
): SelectionRect | null {
  if (!rect || rect.width < 1 || rect.height < 1) return null
  const moved = { ...rect, x: rect.x + offsetX, y: rect.y + offsetY }
  const clipped = normalizeRect(moved, width, height)
  return clipped.width >= 1 && clipped.height >= 1 ? clipped : null
}

function scaleRect(
  rect: SelectionRect | null,
  scaleX: number,
  scaleY: number,
  width: number,
  height: number,
): SelectionRect | null {
  if (!rect || rect.width < 1 || rect.height < 1) return null
  const scaled = normalizeRect(
    {
      x: rect.x * scaleX,
      y: rect.y * scaleY,
      width: rect.width * scaleX,
      height: rect.height * scaleY,
    },
    width,
    height,
  )
  return scaled.width >= 1 && scaled.height >= 1 ? scaled : null
}

function canvasSize(): { width: number; height: number } {
  const { width, height } = useEditorSessionStore.getState().document.canvas
  return { width, height }
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  marquee: null,
  lastMarquee: null,
  mask: null,
  lastMask: null,

  setMarquee: (rect) => {
    if (!rect) {
      set((state) => ({
        marquee: null,
        mask: null,
        lastMarquee: state.marquee ?? state.lastMarquee,
        lastMask: state.mask?.clone() ?? state.lastMask,
      }))
      return
    }

    // Live drag may report 0×0; keep marquee for preview, mask only when real.
    if (rect.width < 1 || rect.height < 1) {
      set({ marquee: rect, mask: null })
      return
    }

    const { width, height } = canvasSize()
    const mask = SelectionMask.fromRect(width, height, rect)
    if (mask.isEmpty()) {
      set({ marquee: rect, mask: null })
      return
    }
    const bounds = mask.bounds()
    set({
      marquee: bounds ?? rect,
      mask,
      lastMarquee: bounds ?? rect,
      lastMask: mask.clone(),
    })
  },

  setMask: (mask) => {
    if (!mask || mask.isEmpty()) {
      set((state) => ({
        marquee: null,
        mask: null,
        lastMarquee: state.marquee ?? state.lastMarquee,
        lastMask: state.mask?.clone() ?? state.lastMask,
      }))
      return
    }
    const bounds = mask.bounds()
    set({
      marquee: bounds,
      mask,
      lastMarquee: bounds,
      lastMask: mask.clone(),
    })
  },

  applyMask: (incoming, mode) => {
    const combine =
      mode ?? useSelectionToolStore.getState().combineMode
    const state = get()
    const { width, height } = canvasSize()
    let next: SelectionMask
    if (combine === 'new') {
      next = incoming.clone()
    } else if (!state.mask || state.mask.isEmpty()) {
      // Add to empty = incoming; subtract/intersect empty = empty.
      next =
        combine === 'add'
          ? incoming.clone()
          : SelectionMask.empty(width, height)
    } else {
      let base = state.mask
      if (base.width !== width || base.height !== height) {
        base = SelectionMask.empty(width, height)
      }
      next = base.combine(incoming, combine)
    }
    get().setMask(next.isEmpty() ? null : next)
  },

  deselect: () =>
    set((state) => ({
      lastMarquee: state.marquee ?? state.lastMarquee,
      lastMask: state.mask?.clone() ?? state.lastMask,
      marquee: null,
      mask: null,
    })),

  reselect: () => {
    const last = get().lastMask
    if (last && !last.isEmpty()) {
      set({
        mask: last.clone(),
        marquee: last.bounds(),
      })
      return
    }
    const lastRect = get().lastMarquee
    if (lastRect && lastRect.width >= 1 && lastRect.height >= 1) {
      const { width, height } = canvasSize()
      const mask = SelectionMask.fromRect(width, height, lastRect)
      set({
        marquee: mask.bounds() ?? lastRect,
        mask: mask.isEmpty() ? null : mask,
      })
    }
  },

  canvasResized: (width, height, offsetX, offsetY) => {
    const { mask, marquee, lastMask, lastMarquee } = get()
    const move = (m: SelectionMask | null): SelectionMask | null => {
      if (!m || m.isEmpty()) return null
      const next = m.resizeCanvas(width, height, offsetX, offsetY)
      return next.isEmpty() ? null : next
    }
    const nextMask = move(mask)
    const nextLastMask = move(lastMask)
    set({
      mask: nextMask,
      marquee:
        nextMask?.bounds() ??
        remapRect(marquee, width, height, offsetX, offsetY),
      lastMask: nextLastMask,
      lastMarquee:
        nextLastMask?.bounds() ??
        remapRect(lastMarquee, width, height, offsetX, offsetY),
    })
  },

  documentResampled: (width, height) => {
    const { mask, marquee, lastMask, lastMarquee } = get()
    const source = mask ?? lastMask
    // Ratios come from whichever mask still carries the pre-resize canvas size;
    // rect-only selections fall back to the store's own canvas dimensions.
    const previous = source
      ? { width: source.width, height: source.height }
      : canvasSize()
    const scaleX = width / Math.max(1, previous.width)
    const scaleY = height / Math.max(1, previous.height)
    const scale = (m: SelectionMask | null): SelectionMask | null => {
      if (!m || m.isEmpty()) return null
      const next = m.resampleToCanvas(width, height)
      return next.isEmpty() ? null : next
    }
    const nextMask = scale(mask)
    const nextLastMask = scale(lastMask)
    set({
      mask: nextMask,
      marquee:
        nextMask?.bounds() ??
        scaleRect(marquee, scaleX, scaleY, width, height),
      lastMask: nextLastMask,
      lastMarquee:
        nextLastMask?.bounds() ??
        scaleRect(lastMarquee, scaleX, scaleY, width, height),
    })
  },

  selectAll: (width, height) => {
    const mask = SelectionMask.fromRect(width, height, {
      x: 0,
      y: 0,
      width,
      height,
    })
    const bounds = mask.bounds()
    set({
      marquee: bounds,
      mask,
      lastMarquee: bounds,
      lastMask: mask.clone(),
    })
  },

  inverse: (width, height) => {
    const state = get()
    let mask: SelectionMask
    if (state.mask && state.mask.width === width && state.mask.height === height) {
      mask = state.mask
    } else if (
      state.marquee &&
      state.marquee.width >= 1 &&
      state.marquee.height >= 1
    ) {
      mask = SelectionMask.fromRect(width, height, state.marquee)
    } else {
      mask = SelectionMask.empty(width, height)
    }
    const next = mask.inverse()
    if (next.isEmpty()) {
      set((s) => ({
        lastMarquee: s.marquee ?? s.lastMarquee,
        lastMask: s.mask?.clone() ?? s.lastMask,
        marquee: null,
        mask: null,
      }))
      return
    }
    set({
      mask: next,
      marquee: next.bounds(),
      lastMarquee: next.bounds(),
      lastMask: next.clone(),
    })
  },

  hasSelection: () => {
    const { mask, marquee } = get()
    if (mask && !mask.isEmpty()) return true
    return marquee != null && marquee.width >= 1 && marquee.height >= 1
  },

  containsPoint: (docX, docY) => {
    const { mask, marquee } = get()
    if (mask && !mask.isEmpty()) {
      return mask.contains(Math.floor(docX), Math.floor(docY))
    }
    if (marquee && marquee.width >= 1 && marquee.height >= 1) {
      const ix = Math.floor(docX)
      const iy = Math.floor(docY)
      return (
        ix >= marquee.x &&
        iy >= marquee.y &&
        ix < marquee.x + marquee.width &&
        iy < marquee.y + marquee.height
      )
    }
    return false
  },
}))
