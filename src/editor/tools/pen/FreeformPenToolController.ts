import { buildFreeformPenPath, type PenPath, type PenPoint } from './penPath'
import { useWorkPathStore } from './workPathStore'
import { persistWorkPathToDocument } from '../paths/pathDocumentSync'

const SAMPLE_DIST_PX = 2

/**
 * Freeform Pen: drag to sketch a path; sampled corner anchors on release.
 */
export class FreeformPenToolController {
  private dragging = false
  private pointerId: number | null = null
  private samples: PenPoint[] = []

  pointerDown(docX: number, docY: number, pointerId: number): boolean {
    this.dragging = true
    this.pointerId = pointerId
    this.samples = [{ x: docX, y: docY }]
    useWorkPathStore.getState().setDraft(buildFreeformPenPath(this.samples, 0))
    return true
  }

  pointerMove(docX: number, docY: number, pointerId: number): void {
    if (!this.dragging || this.pointerId !== pointerId) return
    const last = this.samples[this.samples.length - 1]
    if (!last || Math.hypot(docX - last.x, docY - last.y) >= SAMPLE_DIST_PX) {
      this.samples.push({ x: docX, y: docY })
      useWorkPathStore.getState().setDraft(buildFreeformPenPath(this.samples))
    }
  }

  pointerUp(_docX: number, _docY: number, pointerId: number): void {
    if (!this.dragging || this.pointerId !== pointerId) return
    this.dragging = false
    this.pointerId = null
    const path = buildFreeformPenPath(this.samples)
    this.samples = []
    if (path.anchors.length < 2) {
      useWorkPathStore.getState().setDraft(null)
      return
    }
    this.finishPath(path)
  }

  cancelDraft(): void {
    this.dragging = false
    this.pointerId = null
    this.samples = []
    useWorkPathStore.getState().setDraft(null)
    useWorkPathStore.getState().setRubberBand(null)
  }

  get isDragging(): boolean {
    return this.dragging
  }

  private finishPath(path: PenPath): void {
    useWorkPathStore.getState().setPath(path)
    useWorkPathStore.getState().setDraft(null)
    useWorkPathStore.getState().setRubberBand(null)
    persistWorkPathToDocument(path)
  }
}
