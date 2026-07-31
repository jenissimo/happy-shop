import { hitTestPenPath, mirrorHandle, type PenHit, type PenPath } from './penPath'
import { persistWorkPathToDocument, resolvePenPathForOps } from '../paths/pathDocumentSync'
import { useWorkPathStore } from './workPathStore'

type DragTarget =
  | { kind: 'anchor'; index: number }
  | { kind: 'in'; index: number }
  | { kind: 'out'; index: number }

/**
 * Direct Selection (A): move anchors and cubic handles on the work path.
 */
export class DirectSelectionController {
  private dragging = false
  private pointerId: number | null = null
  private target: DragTarget | null = null
  private startPath: PenPath | null = null
  private startDoc = { x: 0, y: 0 }

  pointerDown(docX: number, docY: number, pointerId: number, zoom: number): boolean {
    const path = resolvePenPathForOps()
    if (!path || path.anchors.length === 0) return false

    const hit = hitTestPenPath(path, docX, docY, zoom)
    if (!hit) return false

    this.dragging = true
    this.pointerId = pointerId
    this.target = hit
    this.startPath = {
      closed: path.closed,
      anchors: path.anchors.map((a) => ({
        ...a,
        in: a.in ? { ...a.in } : undefined,
        out: a.out ? { ...a.out } : undefined,
      })),
    }
    this.startDoc = { x: docX, y: docY }
    useWorkPathStore.getState().setSelectedAnchor(hit.index)
    useWorkPathStore.getState().setActiveHandle(
      hit.kind === 'anchor' ? 'anchor' : hit.kind,
    )
    return true
  }

  pointerMove(docX: number, docY: number, pointerId: number): void {
    if (!this.dragging || this.pointerId !== pointerId || !this.target || !this.startPath) return
    const dx = docX - this.startDoc.x
    const dy = docY - this.startDoc.y
    const next = {
      closed: this.startPath.closed,
      anchors: this.startPath.anchors.map((a) => ({ ...a })),
    }
    const idx = this.target.index
    const anchor = next.anchors[idx]!
    if (this.target.kind === 'anchor') {
      anchor.x += dx
      anchor.y += dy
      if (anchor.in) {
        anchor.in = { x: anchor.in.x + dx, y: anchor.in.y + dy }
      }
      if (anchor.out) {
        anchor.out = { x: anchor.out.x + dx, y: anchor.out.y + dy }
      }
    } else if (this.target.kind === 'in') {
      next.anchors[idx] = mirrorHandle(anchor, 'in', { x: docX, y: docY })
    } else {
      next.anchors[idx] = mirrorHandle(anchor, 'out', { x: docX, y: docY })
    }
    useWorkPathStore.getState().setPath(next)
  }

  pointerUp(_docX: number, _docY: number, pointerId: number): void {
    if (this.pointerId !== pointerId) return
    const path = useWorkPathStore.getState().path
    if (path) persistWorkPathToDocument(path, 'Edit Path')
    this.dragging = false
    this.pointerId = null
    this.target = null
    this.startPath = null
    useWorkPathStore.getState().setActiveHandle(null)
  }

  get isDragging(): boolean {
    return this.dragging
  }
}

export type { PenHit }
