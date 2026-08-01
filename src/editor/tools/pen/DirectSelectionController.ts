import { constrainToAxis } from '../constrain'
import type { ToolModifiers } from '../toolModifiers'
import {
  clonePenPath,
  hitTestPenPath,
  isHandleLinked,
  mirrorHandle,
  setHandleUnlinked,
  type PenHit,
  type PenPath,
} from './penPath'
import { persistWorkPathToDocument, resolvePenPathForOps } from '../paths/pathDocumentSync'
import {
  anchorRefsEqual,
  toggleAnchorSelection,
  useWorkPathStore,
  type AnchorRef,
} from './workPathStore'

const NO_MODS: ToolModifiers = { shift: false, alt: false, ctrl: false, meta: false }

type DragTarget =
  | { kind: 'anchor'; refs: AnchorRef[] }
  | { kind: 'in'; ref: AnchorRef }
  | { kind: 'out'; ref: AnchorRef }

/**
 * Direct Selection (A): move anchors and cubic handles on the work path.
 * Shift-click toggles multi-select; Alt+handle breaks linked handles (cusp).
 */
export class DirectSelectionController {
  private dragging = false
  private pointerId: number | null = null
  private target: DragTarget | null = null
  private startPath: PenPath | null = null
  private startDoc = { x: 0, y: 0 }

  pointerDown(
    docX: number,
    docY: number,
    pointerId: number,
    zoom: number,
    mods: ToolModifiers = NO_MODS,
  ): boolean {
    const path = resolvePenPathForOps()
    if (!path || path.subpaths.every((sp) => sp.anchors.length === 0)) return false

    const hit = hitTestPenPath(path, docX, docY, zoom)
    if (!hit || hit.kind === 'segment') return false

    const ref: AnchorRef = { subpathIndex: hit.subpathIndex, index: hit.index }
    const store = useWorkPathStore.getState()

    if (hit.kind === 'anchor') {
      let selected = store.selectedAnchors
      if (mods.shift) {
        selected = toggleAnchorSelection(selected, ref)
      } else if (!selected.some((a) => anchorRefsEqual(a, ref))) {
        selected = [ref]
      }
      store.setSelectedAnchors(selected)
      store.setPrimaryAnchor(ref)
      store.setActiveHandle('anchor')
      this.target = { kind: 'anchor', refs: selected.length ? selected : [ref] }
    } else {
      store.setSelectedAnchors([ref])
      store.setPrimaryAnchor(ref)
      store.setActiveHandle(hit.kind)
      this.target = { kind: hit.kind, ref }
    }

    this.dragging = true
    this.pointerId = pointerId
    this.startPath = clonePenPath(path)
    this.startDoc = { x: docX, y: docY }
    return true
  }

  pointerMove(
    docX: number,
    docY: number,
    pointerId: number,
    mods: ToolModifiers = NO_MODS,
  ): void {
    if (!this.dragging || this.pointerId !== pointerId || !this.target || !this.startPath) return

    let x = docX
    let y = docY
    if (mods.shift && this.target.kind !== 'anchor') {
      const ref = this.target.ref
      const anchor = this.startPath.subpaths[ref.subpathIndex]?.anchors[ref.index]
      if (anchor) {
        const constrained = constrainToAxis(anchor, { x, y }, 45)
        x = constrained.x
        y = constrained.y
      }
    }

    const dx = x - this.startDoc.x
    const dy = y - this.startDoc.y
    const next = clonePenPath(this.startPath)

    if (this.target.kind === 'anchor') {
      for (const ref of this.target.refs) {
        const sp = next.subpaths[ref.subpathIndex]
        if (!sp) continue
        const anchor = sp.anchors[ref.index]
        if (!anchor) continue
        anchor.x += dx
        anchor.y += dy
        if (anchor.in) {
          anchor.in = { x: anchor.in.x + dx, y: anchor.in.y + dy }
        }
        if (anchor.out) {
          anchor.out = { x: anchor.out.x + dx, y: anchor.out.y + dy }
        }
      }
    } else {
      const ref = this.target.ref
      const sp = next.subpaths[ref.subpathIndex]
      if (!sp) return
      const anchor = sp.anchors[ref.index]
      if (!anchor) return
      const unlink = mods.alt || !isHandleLinked(anchor)
      sp.anchors[ref.index] = unlink
        ? setHandleUnlinked(anchor, this.target.kind, { x, y })
        : mirrorHandle(anchor, this.target.kind, { x, y })
    }

    useWorkPathStore.getState().setPath(next, { preserveSelection: true })
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
