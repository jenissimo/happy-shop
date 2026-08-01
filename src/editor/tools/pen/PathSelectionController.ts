import { createMetadataEntry } from '../../../core/history'
import { setWorkPath, upsertSavedPath } from '../../../core/document/pathOperations'
import { resolveActivePath } from '../../../core/document/pathSchema'
import { documentHistory } from '../../session/documentHistory'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { penPathToVectorPath } from '../paths/pathBridge'
import { persistWorkPathToDocument, resolvePenPathForOps } from '../paths/pathDocumentSync'
import {
  clonePenPath,
  getSubpath,
  penPathIsEmpty,
  tessellatePenSubpath,
  type PenPath,
} from './penPath'
import { useWorkPathStore } from './workPathStore'

type Gesture = {
  pointerId: number
  lastDoc: { x: number; y: number }
  startPath: PenPath
  documentPathId: string | null
  subpathIndex: number
}

const HIT_PX = 8

function subpathBodyHit(
  path: PenPath,
  subpathIndex: number,
  docX: number,
  docY: number,
  zoom: number,
): boolean {
  const poly = tessellatePenSubpath(path, subpathIndex, 12)
  const threshold = HIT_PX / Math.max(zoom, 0.25)
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1]!
    const b = poly[i]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    if (lenSq < 1e-12) continue
    let t = ((docX - a.x) * dx + (docY - a.y) * dy) / lenSq
    t = Math.max(0, Math.min(1, t))
    const px = a.x + t * dx
    const py = a.y + t * dy
    if (Math.hypot(docX - px, docY - py) <= threshold) return true
  }
  return false
}

function hitActiveSubpath(
  path: PenPath,
  docX: number,
  docY: number,
  zoom: number,
): number | null {
  for (let si = path.subpaths.length - 1; si >= 0; si--) {
    if (getSubpath(path, si).anchors.length === 0) continue
    if (subpathBodyHit(path, si, docX, docY, zoom)) return si
  }
  return null
}

function commitDocumentPath(label: string, pathId: string, nextPen: PenPath): void {
  const session = useEditorSessionStore.getState()
  const doc = session.document
  const current = resolveActivePath(doc.paths)
  if (!current || current.id !== pathId) return

  const nextVector = penPathToVectorPath(nextPen, current.name, current.id)
  const after =
    doc.paths?.workPath?.id === pathId
      ? setWorkPath(doc, nextVector)
      : upsertSavedPath(doc, nextVector)

  if (after === doc) return
  const apply = (document: typeof after) => {
    useEditorSessionStore.setState({
      document,
      dirty: true,
      historyVersion: documentHistory.version,
    })
  }
  documentHistory.push(createMetadataEntry({ label, before: doc, after, apply }))
  apply(after)
}

/**
 * Path Selection (A flyout): select and move an entire path/subpath.
 */
export class PathSelectionController {
  private gesture: Gesture | null = null

  get isDragging(): boolean {
    return this.gesture != null
  }

  pointerDown(docX: number, docY: number, pointerId: number, zoom: number): boolean {
    const path = resolvePenPathForOps()
    if (!path || penPathIsEmpty(path)) return false
    const subpathIndex = hitActiveSubpath(path, docX, docY, zoom)
    if (subpathIndex == null) return false

    const docPath = resolveActivePath(useEditorSessionStore.getState().document.paths)
    this.gesture = {
      pointerId,
      lastDoc: { x: docX, y: docY },
      startPath: clonePenPath(path),
      documentPathId: docPath?.id ?? null,
      subpathIndex,
    }
    useWorkPathStore.getState().setSelectedAnchors([])
    useWorkPathStore.getState().setPrimaryAnchor(null)
    useWorkPathStore.getState().setActiveHandle(null)
    useWorkPathStore.getState().setActiveSubpathIndex(subpathIndex)
    return true
  }

  pointerMove(docX: number, docY: number, pointerId: number): void {
    const gesture = this.gesture
    if (!gesture || gesture.pointerId !== pointerId) return

    const dx = docX - gesture.lastDoc.x
    const dy = docY - gesture.lastDoc.y
    if (dx === 0 && dy === 0) return

    const moved = clonePenPath(gesture.startPath)
    const sp = moved.subpaths[gesture.subpathIndex]
    if (sp) {
      moved.subpaths[gesture.subpathIndex] = {
        ...sp,
        anchors: sp.anchors.map((anchor) => ({
          ...anchor,
          x: anchor.x + dx,
          y: anchor.y + dy,
          in: anchor.in ? { x: anchor.in.x + dx, y: anchor.in.y + dy } : undefined,
          out: anchor.out ? { x: anchor.out.x + dx, y: anchor.out.y + dy } : undefined,
        })),
      }
    }

    useWorkPathStore.getState().setPath(moved, { preserveSelection: true })
    gesture.lastDoc = { x: docX, y: docY }
    gesture.startPath = clonePenPath(moved)
  }

  pointerUp(_docX: number, _docY: number, pointerId: number): void {
    const gesture = this.gesture
    if (!gesture || gesture.pointerId !== pointerId) return

    const path = useWorkPathStore.getState().path
    if (path) {
      if (gesture.documentPathId) {
        commitDocumentPath('Move Path', gesture.documentPathId, path)
      } else {
        persistWorkPathToDocument(path, 'Move Path')
      }
    }

    this.gesture = null
  }
}
