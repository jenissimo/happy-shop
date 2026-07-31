import {
  normalizePathStore,
  type DocumentPathStore,
  type PathId,
  type VectorPath,
} from '../../../core/document/pathSchema'

export type PathPanelRowKind = 'work' | 'saved'

export type PathPanelRow = {
  id: PathId
  label: string
  kind: PathPanelRowKind
  knotCount: number
  closed: boolean
}

export function pathPanelRows(store: DocumentPathStore | undefined | null): PathPanelRow[] {
  const paths = normalizePathStore(store)
  const rows: PathPanelRow[] = []
  if (paths.workPath) {
    rows.push(toRow(paths.workPath, 'work'))
  }
  for (const saved of paths.saved) {
    rows.push(toRow(saved, 'saved'))
  }
  return rows
}

function toRow(path: VectorPath, kind: PathPanelRowKind): PathPanelRow {
  return {
    id: path.id,
    label: kind === 'work' ? 'Work Path' : path.name,
    kind,
    knotCount: path.knots.length,
    closed: path.closed,
  }
}

export function pathPanelActiveId(
  store: DocumentPathStore | undefined | null,
): PathId | null {
  const paths = normalizePathStore(store)
  if (paths.activePathId) {
    if (paths.workPath?.id === paths.activePathId) return paths.activePathId
    if (paths.saved.some((entry) => entry.id === paths.activePathId)) {
      return paths.activePathId
    }
  }
  return paths.workPath?.id ?? paths.saved[0]?.id ?? null
}
