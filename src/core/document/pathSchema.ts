/**
 * Shared vector-path contract for Pen tool, Paths panel, stroke, and selection.
 *
 * Kept separate from the main layer union so path geometry can evolve without
 * forcing unrelated schema churn. `HappyDocument.paths` is an optional v6 field.
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
})
export type PathKnot = z.infer<typeof PathKnotSchema>

export const VectorPathSchema = z.object({
  id: PathIdSchema,
  name: z.string().min(1),
  closed: z.boolean(),
  knots: z.array(PathKnotSchema).min(1),
  fillRule: z.enum(['nonzero', 'evenodd']).optional(),
})
export type VectorPath = z.infer<typeof VectorPathSchema>

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

export function translateVectorPath(
  path: VectorPath,
  dx: number,
  dy: number,
): VectorPath {
  if (dx === 0 && dy === 0) return path
  return {
    ...path,
    knots: path.knots.map((knot) => ({
      ...knot,
      x: knot.x + dx,
      y: knot.y + dy,
    })),
  }
}
