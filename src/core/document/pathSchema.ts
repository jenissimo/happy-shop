/**
 * Shared vector-path contract for Pen tool, Paths panel, stroke, and selection.
 *
 * Kept separate from the main layer union so path geometry can evolve without
 * forcing unrelated schema churn. `HappyDocument.paths` is an optional v6 field.
 *
 * Canonical geometry is `subpaths[]`. Legacy `{ closed, knots }` documents are
 * normalized on parse into a single subpath.
 */
import { z } from 'zod'
import { finiteNumber } from './schemaPrimitives'

export const PathIdSchema = z.string().min(1).brand<'PathId'>()
export type PathId = z.infer<typeof PathIdSchema>

/** Relative handle offset from the anchor (document px). */
export const PathHandleSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
})
export type PathHandle = z.infer<typeof PathHandleSchema>

export const PathKnotSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
  handleIn: PathHandleSchema.nullable(),
  handleOut: PathHandleSchema.nullable(),
  /** When true, dragging one handle mirrors the opposite (smooth point). */
  linked: z.boolean().optional(),
})
export type PathKnot = z.infer<typeof PathKnotSchema>

export const PathSubpathSchema = z.object({
  closed: z.boolean(),
  knots: z.array(PathKnotSchema).min(1),
})
export type PathSubpath = z.infer<typeof PathSubpathSchema>

const VectorPathFieldsSchema = z.object({
  id: PathIdSchema,
  name: z.string().min(1),
  fillRule: z.enum(['nonzero', 'evenodd']).optional(),
  subpaths: z.array(PathSubpathSchema).min(1).optional(),
  /** @deprecated legacy single-contour fields — normalized into subpaths. */
  closed: z.boolean().optional(),
  knots: z.array(PathKnotSchema).min(1).optional(),
})

export type VectorPath = {
  id: PathId
  name: string
  subpaths: PathSubpath[]
  fillRule?: 'nonzero' | 'evenodd'
}

function normalizeVectorPathRaw(
  raw: z.infer<typeof VectorPathFieldsSchema>,
): VectorPath {
  if (raw.subpaths && raw.subpaths.length > 0) {
    return {
      id: raw.id,
      name: raw.name,
      fillRule: raw.fillRule,
      subpaths: raw.subpaths,
    }
  }
  if (raw.knots && raw.knots.length > 0) {
    return {
      id: raw.id,
      name: raw.name,
      fillRule: raw.fillRule,
      subpaths: [{ closed: raw.closed ?? false, knots: raw.knots }],
    }
  }
  throw new Error('VectorPath requires subpaths or knots')
}

export const VectorPathSchema = VectorPathFieldsSchema.transform(normalizeVectorPathRaw)

export const DocumentPathStoreSchema = z.object({
  workPath: VectorPathSchema.optional(),
  saved: z.array(VectorPathSchema),
  activePathId: PathIdSchema.nullable().optional(),
})
export type DocumentPathStore = z.infer<typeof DocumentPathStoreSchema>

export const EMPTY_PATH_STORE: DocumentPathStore = {
  saved: [],
  activePathId: null,
}

export function normalizePathStore(
  store: DocumentPathStore | undefined | null,
): DocumentPathStore {
  if (!store) return { ...EMPTY_PATH_STORE }
  return {
    workPath: store.workPath,
    saved: store.saved ?? [],
    activePathId: store.activePathId ?? null,
  }
}

/** Active path for panel ops, stroke, and selection (explicit id → work → first saved). */
export function resolveActivePath(
  store: DocumentPathStore | undefined | null,
): VectorPath | null {
  const paths = normalizePathStore(store)
  if (paths.activePathId) {
    if (paths.workPath?.id === paths.activePathId) return paths.workPath
    const saved = paths.saved.find((entry) => entry.id === paths.activePathId)
    if (saved) return saved
  }
  return paths.workPath ?? paths.saved[0] ?? null
}

/** Flat knot list across all subpaths (for panel counts / simple ops). */
export function vectorPathKnotCount(path: VectorPath): number {
  return path.subpaths.reduce((sum, sp) => sum + sp.knots.length, 0)
}

/** True when every subpath is closed and the path has fillable geometry. */
export function vectorPathIsClosed(path: VectorPath): boolean {
  return path.subpaths.length > 0 && path.subpaths.every((sp) => sp.closed)
}

export function translateVectorPath(
  path: VectorPath,
  dx: number,
  dy: number,
): VectorPath {
  if (dx === 0 && dy === 0) return path
  return {
    ...path,
    subpaths: path.subpaths.map((sp) => ({
      ...sp,
      knots: sp.knots.map((knot) => ({
        ...knot,
        x: knot.x + dx,
        y: knot.y + dy,
      })),
    })),
  }
}

export function translateSubpath(
  path: VectorPath,
  subpathIndex: number,
  dx: number,
  dy: number,
): VectorPath {
  if (dx === 0 && dy === 0) return path
  return {
    ...path,
    subpaths: path.subpaths.map((sp, i) =>
      i !== subpathIndex
        ? sp
        : {
            ...sp,
            knots: sp.knots.map((knot) => ({
              ...knot,
              x: knot.x + dx,
              y: knot.y + dy,
            })),
          },
    ),
  }
}
