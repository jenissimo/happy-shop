import type { HappyDocument } from '../document'
import type { HistoryEntry } from './types'

export type MetadataApplyFn = (document: HappyDocument) => void

export type CreateMetadataEntryOptions = {
  label: string
  before: HappyDocument
  after: HappyDocument
  apply: MetadataApplyFn
  /**
   * When set, consecutive entries with the same key coalesce (slider/nudge).
   * The merged entry keeps the earliest `before` and latest `after`.
   */
  mergeKey?: string
  /** Wall-clock merge window in ms (default 400). */
  mergeWindowMs?: number
}

function estimateDocumentBytes(doc: HappyDocument): number {
  // HappyDocument is metadata-only (asset refs, not pixels). JSON length is a
  // cheap, stable byteCost proxy for eviction accounting (SPEC §12).
  return JSON.stringify(doc).length
}

function newId(): string {
  return crypto.randomUUID()
}

/**
 * Metadata history entry: before/after HappyDocument patches (no raster bytes).
 */
export function createMetadataEntry(
  options: CreateMetadataEntryOptions,
): HistoryEntry {
  const {
    label,
    before,
    after,
    apply,
    mergeKey,
    mergeWindowMs = 400,
  } = options
  const createdAt = Date.now()
  const byteCost = estimateDocumentBytes(before) + estimateDocumentBytes(after)

  const entry: HistoryEntry = {
    id: newId(),
    label,
    byteCost,
    undo() {
      apply(before)
    },
    redo() {
      apply(after)
    },
    merge(next) {
      if (!mergeKey) return null
      const nextMeta = next as HistoryEntry & { __mergeKey?: string; __createdAt?: number; __after?: HappyDocument; __before?: HappyDocument; __apply?: MetadataApplyFn; __label?: string }
      if (nextMeta.__mergeKey !== mergeKey) return null
      if (
        typeof nextMeta.__createdAt === 'number' &&
        nextMeta.__createdAt - createdAt > mergeWindowMs
      ) {
        return null
      }
      if (!nextMeta.__after || !nextMeta.__apply) return null
      return createMetadataEntry({
        label: nextMeta.__label ?? label,
        before,
        after: nextMeta.__after,
        apply: nextMeta.__apply,
        mergeKey,
        mergeWindowMs,
      })
    },
  }

  // Internal fields for merge — not part of the public HistoryEntry contract.
  Object.assign(entry, {
    __mergeKey: mergeKey,
    __createdAt: createdAt,
    __before: before,
    __after: after,
    __apply: apply,
    __label: label,
  })

  return entry
}
