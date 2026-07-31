import {
  addCornerAnchor,
  addSmoothAnchor,
  closePenPath,
  emptyPenPath,
  penPathCanClose,
  type PenPath,
} from './penPath'
import { useWorkPathStore } from './workPathStore'
import { persistWorkPathToDocument } from '../paths/pathDocumentSync'

const DRAG_THRESHOLD = 4

/**
 * Pen tool (P): click for corners, drag for smooth points with handles.
 * Enter / double-click / click-first-point closes into the work path.
 */
export class PenToolController {
  private dragging = false
  private pointerId: number | null = null
  private start = { x: 0, y: 0 }
  private dragHandle = false

  pointerDown(docX: number, docY: number, pointerId: number): boolean {
    const store = useWorkPathStore.getState()
    const path = store.draft ?? emptyPenPath()

    if (penPathCanClose(path, docX, docY)) {
      this.finishPath(closePenPath(path))
      return true
    }

    if (!store.draft) {
      store.setDraft(emptyPenPath())
    }

    this.dragging = true
    this.pointerId = pointerId
    this.start = { x: docX, y: docY }
    this.dragHandle = false
    store.setRubberBand({ x: docX, y: docY })
    return true
  }

  pointerMove(docX: number, docY: number, pointerId: number): void {
    if (!this.dragging || this.pointerId !== pointerId) return
    useWorkPathStore.getState().setRubberBand({ x: docX, y: docY })
    if (Math.hypot(docX - this.start.x, docY - this.start.y) >= DRAG_THRESHOLD) {
      this.dragHandle = true
    }
  }

  pointerUp(docX: number, docY: number, pointerId: number): void {
    if (!this.dragging || this.pointerId !== pointerId) return
    this.dragging = false
    this.pointerId = null

    const store = useWorkPathStore.getState()
    let path = store.draft ?? emptyPenPath()

    if (this.dragHandle) {
      path = addSmoothAnchor(path, this.start.x, this.start.y, { x: docX, y: docY })
    } else {
      path = addCornerAnchor(path, this.start.x, this.start.y)
    }

    store.setDraft(path)
    store.setRubberBand(null)
    this.dragHandle = false
  }

  /** Enter or double-click closes the open draft into the work path. */
  closeDraft(): boolean {
    const store = useWorkPathStore.getState()
    const draft = store.draft
    if (!draft || draft.anchors.length < 2) {
      store.setDraft(null)
      store.setRubberBand(null)
      return false
    }
    const closed = draft.anchors.length >= 3 ? closePenPath(draft) : draft
    this.finishPath(closed)
    return true
  }

  cancelDraft(): void {
    this.dragging = false
    this.pointerId = null
    useWorkPathStore.getState().setDraft(null)
    useWorkPathStore.getState().setRubberBand(null)
  }

  get isDragging(): boolean {
    return this.dragging
  }

  get hasOpenDraft(): boolean {
    const draft = useWorkPathStore.getState().draft
    return Boolean(draft && draft.anchors.length > 0)
  }

  private finishPath(path: PenPath): void {
    this.dragging = false
    this.pointerId = null
    useWorkPathStore.getState().setPath(path)
    useWorkPathStore.getState().setDraft(null)
    useWorkPathStore.getState().setRubberBand(null)
    persistWorkPathToDocument(path)
  }
}
