import { constrainToAxis } from '../constrain'
import type { ToolModifiers } from '../toolModifiers'
import {
  convertToCorner,
  convertToSmooth,
  hitTestPenPath,
  insertAnchorOnSegment,
  removeAnchor,
  type PenPath,
} from './penPath'
import { persistWorkPathToDocument, resolvePenPathForOps } from '../paths/pathDocumentSync'
import { useWorkPathStore } from './workPathStore'

const NO_MODS: ToolModifiers = { shift: false, alt: false, ctrl: false, meta: false }
const DRAG_THRESHOLD = 4

/**
 * Add Anchor tool: click a segment to insert a knot via cubic split.
 */
export class AddAnchorController {
  pointerDown(docX: number, docY: number, _pointerId: number, zoom: number): boolean {
    const path = resolvePenPathForOps()
    if (!path) return false
    const hit = hitTestPenPath(path, docX, docY, zoom, { includeSegments: true })
    if (!hit || hit.kind !== 'segment') return false
    const next = insertAnchorOnSegment(path, hit.subpathIndex, hit.segmentIndex, hit.t)
    useWorkPathStore.getState().setPath(next)
    persistWorkPathToDocument(next, 'Add Anchor')
    useWorkPathStore.getState().setSelectedAnchors([
      { subpathIndex: hit.subpathIndex, index: hit.segmentIndex + 1 },
    ])
    return true
  }

  pointerMove(): void {}
  pointerUp(): void {}
  get isDragging(): boolean {
    return false
  }
}

/**
 * Delete Anchor tool: click an anchor to remove it.
 */
export class DeleteAnchorController {
  pointerDown(docX: number, docY: number, _pointerId: number, zoom: number): boolean {
    const path = resolvePenPathForOps()
    if (!path) return false
    const hit = hitTestPenPath(path, docX, docY, zoom)
    if (!hit || hit.kind !== 'anchor') return false
    const next = removeAnchor(path, hit.subpathIndex, hit.index)
    if (!next) return false
    useWorkPathStore.getState().setPath(next)
    persistWorkPathToDocument(next, 'Delete Anchor')
    useWorkPathStore.getState().setSelectedAnchors([])
    return true
  }

  pointerMove(): void {}
  pointerUp(): void {}
  get isDragging(): boolean {
    return false
  }
}

/**
 * Convert Point tool: click strips handles (corner); drag sets smooth linked handles.
 */
export class ConvertPointController {
  private dragging = false
  private pointerId: number | null = null
  private start = { x: 0, y: 0 }
  private anchorRef: { subpathIndex: number; index: number } | null = null
  private startPath: PenPath | null = null
  private didDrag = false

  pointerDown(
    docX: number,
    docY: number,
    pointerId: number,
    zoom: number,
    _mods: ToolModifiers = NO_MODS,
  ): boolean {
    const path = resolvePenPathForOps()
    if (!path) return false
    const hit = hitTestPenPath(path, docX, docY, zoom)
    if (!hit || (hit.kind !== 'anchor' && hit.kind !== 'in' && hit.kind !== 'out')) return false

    this.dragging = true
    this.pointerId = pointerId
    this.start = { x: docX, y: docY }
    this.anchorRef = { subpathIndex: hit.subpathIndex, index: hit.index }
    this.startPath = path
    this.didDrag = false
    useWorkPathStore.getState().setSelectedAnchors([this.anchorRef])
    useWorkPathStore.getState().setPrimaryAnchor(this.anchorRef)
    return true
  }

  pointerMove(
    docX: number,
    docY: number,
    pointerId: number,
    mods: ToolModifiers = NO_MODS,
  ): void {
    if (!this.dragging || this.pointerId !== pointerId || !this.anchorRef || !this.startPath) {
      return
    }
    let x = docX
    let y = docY
    if (mods.shift) {
      const c = constrainToAxis(this.start, { x, y }, 45)
      x = c.x
      y = c.y
    }
    if (Math.hypot(x - this.start.x, y - this.start.y) < DRAG_THRESHOLD) return
    this.didDrag = true

    const { subpathIndex, index } = this.anchorRef
    const next: PenPath = {
      ...this.startPath,
      subpaths: this.startPath.subpaths.map((sp, si) => {
        if (si !== subpathIndex) return sp
        const anchors = [...sp.anchors]
        const anchor = anchors[index]!
        anchors[index] = convertToSmooth(anchor, { x, y })
        return { ...sp, anchors }
      }),
    }
    useWorkPathStore.getState().setPath(next, { preserveSelection: true })
  }

  pointerUp(_docX: number, _docY: number, pointerId: number): void {
    if (!this.dragging || this.pointerId !== pointerId || !this.anchorRef || !this.startPath) {
      return
    }
    this.dragging = false
    this.pointerId = null

    if (!this.didDrag) {
      const { subpathIndex, index } = this.anchorRef
      const next: PenPath = {
        ...this.startPath,
        subpaths: this.startPath.subpaths.map((sp, si) => {
          if (si !== subpathIndex) return sp
          const anchors = [...sp.anchors]
          anchors[index] = convertToCorner(anchors[index]!)
          return { ...sp, anchors }
        }),
      }
      useWorkPathStore.getState().setPath(next, { preserveSelection: true })
      persistWorkPathToDocument(next, 'Convert Point')
    } else {
      const path = useWorkPathStore.getState().path
      if (path) persistWorkPathToDocument(path, 'Convert Point')
    }

    this.anchorRef = null
    this.startPath = null
    this.didDrag = false
  }

  get isDragging(): boolean {
    return this.dragging
  }
}
