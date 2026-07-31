import { produce } from 'immer'
import { createPathId } from './ids'
import type { HappyDocument } from './schema'
import {
  EMPTY_PATH_STORE,
  normalizePathStore,
  type DocumentPathStore,
  type PathId,
  type VectorPath,
} from './pathSchema'

export type { DocumentPathStore, PathId, PathKnot, PathHandle, VectorPath } from './pathSchema'
export {
  EMPTY_PATH_STORE,
  normalizePathStore,
  resolveActivePath,
  DocumentPathStoreSchema,
  PathIdSchema,
  PathKnotSchema,
  VectorPathSchema,
} from './pathSchema'

function withPaths(
  doc: HappyDocument,
  updater: (store: DocumentPathStore) => DocumentPathStore,
): HappyDocument {
  const next = updater(normalizePathStore(doc.paths))
  const empty =
    !next.workPath && next.saved.length === 0 && (next.activePathId ?? null) === null
  if (empty) {
    const { paths: _removed, ...rest } = doc
    return rest as HappyDocument
  }
  return { ...doc, paths: next }
}

export function ensurePathStore(doc: HappyDocument): HappyDocument {
  if (doc.paths) return doc
  return { ...doc, paths: { ...EMPTY_PATH_STORE } }
}

export function setWorkPath(
  doc: HappyDocument,
  path: VectorPath | null,
): HappyDocument {
  return withPaths(doc, (store) => ({
    ...store,
    workPath: path ?? undefined,
    activePathId: path ? path.id : store.activePathId,
  }))
}

export function setActivePathId(
  doc: HappyDocument,
  pathId: PathId | null,
): HappyDocument {
  return withPaths(ensurePathStore(doc), (store) => ({
    ...store,
    activePathId: pathId,
  }))
}

export function upsertSavedPath(
  doc: HappyDocument,
  path: VectorPath,
): HappyDocument {
  return withPaths(ensurePathStore(doc), (store) => {
    const index = store.saved.findIndex((entry) => entry.id === path.id)
    const saved =
      index >= 0
        ? store.saved.map((entry, i) => (i === index ? path : entry))
        : [...store.saved, path]
    return { ...store, saved, activePathId: path.id }
  })
}

export function deletePath(
  doc: HappyDocument,
  pathId: PathId,
): HappyDocument {
  return withPaths(ensurePathStore(doc), (store) => {
    const workPath = store.workPath?.id === pathId ? undefined : store.workPath
    const saved = store.saved.filter((entry) => entry.id !== pathId)
    let activePathId = store.activePathId ?? null
    if (activePathId === pathId) {
      activePathId = workPath?.id ?? saved[0]?.id ?? null
    }
    return { ...store, workPath, saved, activePathId }
  })
}

export function renamePath(
  doc: HappyDocument,
  pathId: PathId,
  name: string,
): HappyDocument {
  const trimmed = name.trim()
  if (!trimmed) return doc
  return withPaths(ensurePathStore(doc), (store) =>
    produce(store, (draft) => {
      if (draft.workPath?.id === pathId) {
        draft.workPath.name = trimmed
        return
      }
      const entry = draft.saved.find((path) => path.id === pathId)
      if (entry) entry.name = trimmed
    }),
  )
}

/** Duplicate work path into saved list (classic "Save Path"). */
export function saveWorkPath(
  doc: HappyDocument,
  name?: string,
): HappyDocument {
  const store = normalizePathStore(doc.paths)
  if (!store.workPath) return doc
  const copy: VectorPath = {
    ...structuredClone(store.workPath),
    id: createPathId(),
    name: name?.trim() || nextSavedPathName(store.saved),
  }
  return upsertSavedPath(doc, copy)
}

export function nextSavedPathName(saved: readonly VectorPath[]): string {
  const used = new Set(saved.map((entry) => entry.name.toLocaleLowerCase()))
  for (let index = 1; index <= saved.length + 1; index++) {
    const candidate = `Path ${index}`
    if (!used.has(candidate.toLocaleLowerCase())) return candidate
  }
  return `Path ${saved.length + 1}`
}
