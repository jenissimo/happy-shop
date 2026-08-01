import { constrainToAxis } from '../constrain'
import type { ToolModifiers } from '../toolModifiers'
import {
  addCornerAnchor,
  addCuspAnchor,
  addSmoothAnchor,
  clonePenPath,
  closePenPath,
  emptyPenPath,
  getSubpath,
  hitTestPathEndpoint,
  penPathAnchorCount,
  penPathCanClose,
  reverseSubpath,
  startNewSubpath,
  updateSubpath,
  type PenPath,
} from './penPath'
import { useWorkPathStore } from './workPathStore'
import { persistWorkPathToDocument } from '../paths/pathDocumentSync'

const DRAG_THRESHOLD = 4
const NO_MODS: ToolModifiers = { shift: false, alt: false, ctrl: false, meta: false }

/**
 * Pen tool (P): click for corners, drag for smooth points with handles.
 * Live place+drag preview; Shift constrains 45°; Alt creates cusp;
 * click near endpoint continues an open work path.
 * Enter / double-click / click-first-point closes into the work path.
 */
export class PenToolController {
  private dragging = false
  private pointerId: number | null = null
  private start = { x: 0, y: 0 }
  private dragHandle = false
  private mods: ToolModifiers = NO_MODS
  private provisional = false
  private continueSubpath = 0

  pointerDown(
    docX: number,
    docY: number,
    pointerId: number,
    mods: ToolModifiers = NO_MODS,
  ): boolean {
    this.mods = mods
    const store = useWorkPathStore.getState()
    let path = store.draft
    let subpathIndex = store.activeSubpathIndex

    if (!path) {
      const committed = store.path
      if (committed && !this.allSubpathsClosed(committed)) {
        const endpoint = hitTestPathEndpoint(committed, docX, docY)
        if (endpoint) {
          path = clonePenPath(committed)
          subpathIndex = endpoint.subpathIndex
          if (endpoint.end === 'start') {
            path = reverseSubpath(path, subpathIndex)
          }
          store.setDraft(path)
          store.setActiveSubpathIndex(subpathIndex)
          this.continueSubpath = subpathIndex
          // Attaching to an existing endpoint — do not place a duplicate knot.
          store.setRubberBand({ x: docX, y: docY })
          return true
        } else if (this.hasClosedSubpath(committed)) {
          // Start a new subpath on the same compound path.
          path = startNewSubpath(clonePenPath(committed))
          subpathIndex = path.subpaths.length - 1
          store.setDraft(path)
          store.setActiveSubpathIndex(subpathIndex)
          this.continueSubpath = subpathIndex
        } else {
          path = emptyPenPath()
          subpathIndex = 0
          store.setDraft(path)
          store.setActiveSubpathIndex(0)
          this.continueSubpath = 0
        }
      } else {
        path = emptyPenPath()
        subpathIndex = 0
        store.setDraft(path)
        store.setActiveSubpathIndex(0)
        this.continueSubpath = 0
      }
    } else {
      this.continueSubpath = subpathIndex
    }

    if (penPathCanClose(path, docX, docY, subpathIndex)) {
      let closed = closePenPath(path, subpathIndex)
      // Leave room for another subpath after close (compound paths).
      closed = startNewSubpath(closed)
      this.finishPath(closed, true)
      return true
    }

    this.dragging = true
    this.pointerId = pointerId
    this.start = { x: docX, y: docY }
    this.dragHandle = false
    this.provisional = true

    // Live provisional corner anchor; upgraded to smooth on drag.
    path = addCornerAnchor(path, docX, docY, subpathIndex)
    store.setDraft(path)
    store.setRubberBand({ x: docX, y: docY })
    return true
  }

  pointerMove(
    docX: number,
    docY: number,
    pointerId: number,
    mods: ToolModifiers = NO_MODS,
  ): void {
    this.mods = mods
    const store = useWorkPathStore.getState()

    if (!this.dragging || this.pointerId !== pointerId) {
      // Idle rubber-band while a draft is open.
      if (store.draft && penPathAnchorCount(store.draft) > 0) {
        const pt = mods.shift
          ? this.constrainFromLast(store.draft, store.activeSubpathIndex, docX, docY)
          : { x: docX, y: docY }
        store.setRubberBand(pt)
      }
      return
    }

    let x = docX
    let y = docY
    if (mods.shift) {
      const constrained = constrainToAxis(this.start, { x, y }, 45)
      x = constrained.x
      y = constrained.y
    }

    store.setRubberBand({ x, y })

    const dist = Math.hypot(x - this.start.x, y - this.start.y)
    if (dist >= DRAG_THRESHOLD) {
      this.dragHandle = true
      const path = store.draft
      if (!path || !this.provisional) return
      const si = this.continueSubpath
      const sp = getSubpath(path, si)
      const lastIdx = sp.anchors.length - 1
      if (lastIdx < 0) return
      const out = { x, y }
      const next = updateSubpath(path, si, (s) => {
        const anchors = [...s.anchors]
        if (mods.alt) {
          anchors[lastIdx] = {
            x: this.start.x,
            y: this.start.y,
            out,
            linked: false,
          }
        } else {
          anchors[lastIdx] = {
            x: this.start.x,
            y: this.start.y,
            out,
            in: {
              x: this.start.x + (this.start.x - out.x),
              y: this.start.y + (this.start.y - out.y),
            },
            linked: true,
          }
        }
        return { ...s, anchors }
      })
      store.setDraft(next)
    }
  }

  pointerUp(
    docX: number,
    docY: number,
    pointerId: number,
    mods: ToolModifiers = NO_MODS,
  ): void {
    if (!this.dragging || this.pointerId !== pointerId) return
    this.mods = mods
    this.dragging = false
    this.pointerId = null
    this.provisional = false

    const store = useWorkPathStore.getState()
    // Provisional anchor already in draft from pointerDown; finalize handles if dragged.
    let x = docX
    let y = docY
    if (mods.shift || this.mods.shift) {
      const constrained = constrainToAxis(this.start, { x, y }, 45)
      x = constrained.x
      y = constrained.y
    }

    if (this.dragHandle && store.draft) {
      const si = this.continueSubpath
      const path = store.draft
      const sp = getSubpath(path, si)
      const lastIdx = sp.anchors.length - 1
      if (lastIdx >= 0) {
        const useAlt = mods.alt || this.mods.alt
        const without = updateSubpath(path, si, (s) => ({
          ...s,
          anchors: s.anchors.slice(0, -1),
        }))
        const next = useAlt
          ? addCuspAnchor(without, this.start.x, this.start.y, { x, y }, si)
          : addSmoothAnchor(without, this.start.x, this.start.y, { x, y }, si)
        store.setDraft(next)
      }
    }

    // Keep idle rubber-band at release point for next segment preview.
    store.setRubberBand({ x: docX, y: docY })
    this.dragHandle = false
  }

  /** Enter or double-click closes the open draft into the work path. */
  closeDraft(): boolean {
    const store = useWorkPathStore.getState()
    const draft = store.draft
    if (!draft || penPathAnchorCount(draft) < 2) {
      store.setDraft(null)
      store.setRubberBand(null)
      return false
    }
    const si = store.activeSubpathIndex
    const sp = getSubpath(draft, si)
    const closed =
      sp.anchors.length >= 3 ? closePenPath(draft, si) : draft
    this.finishPath(closed, false)
    return true
  }

  /** Discard in-progress draft gesture; keep committed work path. */
  cancelDraft(): void {
    this.dragging = false
    this.pointerId = null
    this.provisional = false
    useWorkPathStore.getState().setDraft(null)
    useWorkPathStore.getState().setRubberBand(null)
  }

  /** Commit open draft to work path when leaving the tool. */
  commitOpenDraft(): void {
    const store = useWorkPathStore.getState()
    const draft = store.draft
    if (!draft || penPathAnchorCount(draft) === 0) {
      this.cancelDraft()
      return
    }
    this.finishPath(draft, false)
  }

  get isDragging(): boolean {
    return this.dragging
  }

  get hasOpenDraft(): boolean {
    const draft = useWorkPathStore.getState().draft
    return Boolean(draft && penPathAnchorCount(draft) > 0)
  }

  private finishPath(path: PenPath, keepEmptySubpath: boolean): void {
    this.dragging = false
    this.pointerId = null
    this.provisional = false
    // Drop trailing empty subpath unless we just closed and want compound continue.
    let finalPath = path
    if (!keepEmptySubpath) {
      const last = path.subpaths[path.subpaths.length - 1]
      if (last && last.anchors.length === 0 && path.subpaths.length > 1) {
        finalPath = { ...path, subpaths: path.subpaths.slice(0, -1) }
      }
    } else {
      // keep trailing empty for next subpath; strip if finishing entirely later
    }
    // If keepEmptySubpath, persist without the empty trailer for document,
    // but leave draft null and path as closed compound without empty.
    if (keepEmptySubpath) {
      const withoutEmpty = {
        ...finalPath,
        subpaths: finalPath.subpaths.filter((sp) => sp.anchors.length > 0),
      }
      useWorkPathStore.getState().setPath(withoutEmpty)
      // Start fresh draft as new empty subpath continuation of compound.
      const continued = startNewSubpath(clonePenPath(withoutEmpty))
      useWorkPathStore.getState().setDraft(continued)
      useWorkPathStore.getState().setActiveSubpathIndex(continued.subpaths.length - 1)
      useWorkPathStore.getState().setRubberBand(null)
      persistWorkPathToDocument(withoutEmpty)
      return
    }
    useWorkPathStore.getState().setPath(finalPath)
    useWorkPathStore.getState().setDraft(null)
    useWorkPathStore.getState().setRubberBand(null)
    persistWorkPathToDocument(finalPath)
  }

  private constrainFromLast(
    path: PenPath,
    subpathIndex: number,
    x: number,
    y: number,
  ): { x: number; y: number } {
    const sp = getSubpath(path, subpathIndex)
    const last = sp.anchors[sp.anchors.length - 1]
    if (!last) return { x, y }
    return constrainToAxis(last, { x, y }, 45)
  }

  private allSubpathsClosed(path: PenPath): boolean {
    return path.subpaths.every((sp) => sp.closed || sp.anchors.length === 0)
  }

  private hasClosedSubpath(path: PenPath): boolean {
    return path.subpaths.some((sp) => sp.closed && sp.anchors.length >= 3)
  }
}
