import { createMetadataEntry } from '../../../core/history'
import {
  normalizePathStore,
  resolveActivePath,
  saveWorkPath,
  setWorkPath,
  type HappyDocument,
  type VectorPath,
} from '../../../core/document'
import { documentHistory } from '../../session/documentHistory'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { penPathAnchorCount, penPathIsEmpty, type PenPath } from '../pen/penPath'
import { useWorkPathStore } from '../pen/workPathStore'
import { penPathToVectorPath, vectorPathToPenPath } from './pathBridge'

function applyDocument(document: HappyDocument): void {
  useEditorSessionStore.setState({
    document,
    dirty: true,
    historyVersion: documentHistory.version,
  })
}

function commitDocument(label: string, after: HappyDocument): void {
  const before = useEditorSessionStore.getState().document
  if (after === before) return
  documentHistory.push(createMetadataEntry({ label, before, after, apply: applyDocument }))
  applyDocument(after)
}

/** Persist the session work path into `document.paths.workPath`. */
export function persistWorkPathToDocument(path: PenPath, label = 'Work Path'): void {
  if (penPathIsEmpty(path)) return
  const doc = useEditorSessionStore.getState().document
  const existingId = normalizePathStore(doc.paths).workPath?.id
  const vector = penPathToVectorPath(path, 'Work Path', existingId)
  commitDocument(label, setWorkPath(doc, vector))
}

/** Duplicate document work path into the saved-path list (Paths panel Save). */
export function saveActiveWorkPathToDocument(): boolean {
  const doc = useEditorSessionStore.getState().document
  const after = saveWorkPath(doc)
  if (after === doc) return false
  commitDocument('Save Path', after)
  return true
}

/** Hydrate the session work-path overlay from the open document. */
export function hydrateWorkPathFromDocument(document: HappyDocument): void {
  const work = normalizePathStore(document.paths).workPath
  useWorkPathStore.getState().setPath(work ? vectorPathToPenPath(work) : null)
}

/** Resolve the path targeted by panel commands and path ops. */
export function resolvePenPathForOps(): PenPath | null {
  const draft = useWorkPathStore.getState().draft
  if (draft && penPathAnchorCount(draft) > 0) return draft

  const sessionPath = useWorkPathStore.getState().path
  if (sessionPath && penPathAnchorCount(sessionPath) > 0) return sessionPath

  const doc = useEditorSessionStore.getState().document
  const active = resolveActivePath(doc.paths)
  if (active) return vectorPathToPenPath(active)
  return null
}

export function activeVectorPath(document: HappyDocument): VectorPath | null {
  return resolveActivePath(document.paths)
}
