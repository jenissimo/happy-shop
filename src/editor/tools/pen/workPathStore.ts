import { create } from 'zustand'
import type { PenPath } from './penPath'
import { emptyPenPath } from './penPath'

type WorkPathState = {
  /** Committed work path (visible overlay until cleared). */
  path: PenPath | null
  /** In-progress path while Pen tool is placing anchors. */
  draft: PenPath | null
  /** Rubber-band cursor while placing the next anchor. */
  rubberBand: { x: number; y: number } | null
  /** Direct Selection: selected anchor index. */
  selectedAnchor: number | null
  /** Direct Selection: active handle being dragged. */
  activeHandle: 'in' | 'out' | 'anchor' | null

  setPath: (path: PenPath | null) => void
  setDraft: (draft: PenPath | null) => void
  setRubberBand: (point: { x: number; y: number } | null) => void
  commitDraft: () => void
  clearAll: () => void
  setSelectedAnchor: (index: number | null) => void
  setActiveHandle: (handle: 'in' | 'out' | 'anchor' | null) => void
  /** Path used for overlay + operations (draft while drawing, else work path). */
  activePath: () => PenPath | null
}

export const useWorkPathStore = create<WorkPathState>((set, get) => ({
  path: null,
  draft: null,
  rubberBand: null,
  selectedAnchor: null,
  activeHandle: null,

  setPath: (path) => set({ path, selectedAnchor: null, activeHandle: null }),
  setDraft: (draft) => set({ draft, rubberBand: null }),
  setRubberBand: (rubberBand) => set({ rubberBand }),
  commitDraft: () => {
    const draft = get().draft
    if (!draft || draft.anchors.length === 0) {
      set({ draft: null, rubberBand: null })
      return
    }
    set({ path: draft, draft: null, rubberBand: null, selectedAnchor: null, activeHandle: null })
  },
  clearAll: () =>
    set({
      path: null,
      draft: null,
      rubberBand: null,
      selectedAnchor: null,
      activeHandle: null,
    }),
  setSelectedAnchor: (selectedAnchor) => set({ selectedAnchor }),
  setActiveHandle: (activeHandle) => set({ activeHandle }),
  activePath: () => {
    const { draft, path } = get()
    return draft ?? path
  },
}))

export function resetWorkPath(): void {
  useWorkPathStore.setState({
    path: null,
    draft: emptyPenPath(),
    rubberBand: null,
    selectedAnchor: null,
    activeHandle: null,
  })
}
