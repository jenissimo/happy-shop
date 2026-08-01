import { create } from 'zustand'
import type { PenPath } from './penPath'
import { emptyPenPath, penPathAnchorCount, penPathIsEmpty } from './penPath'

export type AnchorRef = { subpathIndex: number; index: number }

type WorkPathState = {
  /** Committed work path (visible overlay until cleared). */
  path: PenPath | null
  /** In-progress path while Pen tool is placing anchors. */
  draft: PenPath | null
  /** Rubber-band cursor while placing the next anchor. */
  rubberBand: { x: number; y: number } | null
  /** Active subpath being edited / drawn. */
  activeSubpathIndex: number
  /** Direct Selection: selected anchors (multi-select). */
  selectedAnchors: AnchorRef[]
  /** Primary selection for handle display. */
  primaryAnchor: AnchorRef | null
  /** Direct Selection: active handle being dragged. */
  activeHandle: 'in' | 'out' | 'anchor' | null

  setPath: (path: PenPath | null, options?: { preserveSelection?: boolean }) => void
  setDraft: (draft: PenPath | null) => void
  setRubberBand: (point: { x: number; y: number } | null) => void
  setActiveSubpathIndex: (index: number) => void
  commitDraft: () => void
  clearAll: () => void
  setSelectedAnchors: (anchors: AnchorRef[]) => void
  setPrimaryAnchor: (anchor: AnchorRef | null) => void
  setActiveHandle: (handle: 'in' | 'out' | 'anchor' | null) => void
  /** Path used for overlay + operations (draft while drawing, else work path). */
  activePath: () => PenPath | null
}

function clearSelectionPatch() {
  return {
    selectedAnchors: [] as AnchorRef[],
    primaryAnchor: null as AnchorRef | null,
    activeHandle: null as 'in' | 'out' | 'anchor' | null,
  }
}

export const useWorkPathStore = create<WorkPathState>((set, get) => ({
  path: null,
  draft: null,
  rubberBand: null,
  activeSubpathIndex: 0,
  selectedAnchors: [],
  primaryAnchor: null,
  activeHandle: null,

  setPath: (path, options) =>
    set(
      options?.preserveSelection
        ? { path }
        : {
            path,
            activeSubpathIndex: 0,
            ...clearSelectionPatch(),
          },
    ),
  setDraft: (draft) => set({ draft }),
  setRubberBand: (rubberBand) => set({ rubberBand }),
  setActiveSubpathIndex: (activeSubpathIndex) => set({ activeSubpathIndex }),
  commitDraft: () => {
    const draft = get().draft
    if (!draft || penPathIsEmpty(draft)) {
      set({ draft: null, rubberBand: null })
      return
    }
    set({
      path: draft,
      draft: null,
      rubberBand: null,
      ...clearSelectionPatch(),
    })
  },
  clearAll: () =>
    set({
      path: null,
      draft: null,
      rubberBand: null,
      activeSubpathIndex: 0,
      ...clearSelectionPatch(),
    }),
  setSelectedAnchors: (selectedAnchors) =>
    set({
      selectedAnchors,
      primaryAnchor: selectedAnchors[selectedAnchors.length - 1] ?? null,
    }),
  setPrimaryAnchor: (primaryAnchor) => set({ primaryAnchor }),
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
    activeSubpathIndex: 0,
    selectedAnchors: [],
    primaryAnchor: null,
    activeHandle: null,
  })
}

export function anchorRefsEqual(a: AnchorRef, b: AnchorRef): boolean {
  return a.subpathIndex === b.subpathIndex && a.index === b.index
}

export function toggleAnchorSelection(
  current: AnchorRef[],
  target: AnchorRef,
): AnchorRef[] {
  const exists = current.some((a) => anchorRefsEqual(a, target))
  if (exists) return current.filter((a) => !anchorRefsEqual(a, target))
  return [...current, target]
}

/** @deprecated use selectedAnchors — kept for transitional call sites */
export function selectedAnchorIndex(state: {
  primaryAnchor: AnchorRef | null
}): number | null {
  return state.primaryAnchor?.index ?? null
}

export { penPathAnchorCount }
