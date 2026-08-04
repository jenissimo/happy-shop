/**
 * The single document-mutation transaction path (SPEC §6.6).
 *
 * Every metadata edit — layer ops, adjustments, transform gestures, store
 * setters — funnels through `commitDocumentTransaction` so that commit and
 * undo/redo agree on what "applying a document" means: install the document,
 * mark dirty, re-normalize the layer selection and refresh the multi-document
 * tab mirror. Before this existed there were four near-duplicate copies that
 * had each dropped a different one of those steps.
 */

import type { HappyDocument, LayerId } from '../../core/document'
import { createMetadataEntry } from '../../core/history'
import { documentHistory } from './documentHistory'
import { useEditorSessionStore } from './EditorSessionStore'

/** Optional hook installed by DocumentTabManager to mirror active-tab dirty/doc. */
let activeTabSync: (() => void) | null = null

export function setActiveTabSyncHandler(handler: (() => void) | null): void {
  activeTabSync = handler
}

/** Push session state into the active tab, if the tab manager is bootstrapped. */
export function syncActiveTabMirror(): void {
  activeTabSync?.()
}

/**
 * Keeps the first selected id as the active target while preserving a valid
 * multi-selection. Documents with layers always retain an active layer.
 */
export function normalizeLayerSelection(
  document: HappyDocument,
  selectedLayerIds: readonly LayerId[],
): LayerId[] {
  const valid = [...new Set(selectedLayerIds)].filter(
    (id) => document.layers[id] != null,
  )
  if (valid.length > 0 || Object.keys(document.layers).length === 0) {
    return valid
  }

  // The topmost root layer is the Photoshop-like default target. A malformed
  // tree can still be recovered from by selecting any surviving layer.
  return [
    document.rootChildren[document.rootChildren.length - 1] ??
      (Object.keys(document.layers)[0] as LayerId),
  ]
}

/**
 * The `apply` callback handed to every metadata history entry.
 *
 * Undo/redo must land the session in exactly the shape a fresh commit would,
 * otherwise a `jumpToHistoryDepth` or a bare `documentHistory.undo()` (used by
 * the retouch surface snapshotter) leaves a dangling selection or a stale tab
 * mirror.
 */
export function applyTransactionDocument(document: HappyDocument): void {
  const { selectedLayerIds } = useEditorSessionStore.getState()
  useEditorSessionStore.setState({
    document,
    dirty: true,
    selectedLayerIds: normalizeLayerSelection(document, selectedLayerIds),
  })
  syncActiveTabMirror()
}

export type DocumentTransactionOptions = {
  label: string
  before: HappyDocument
  after: HappyDocument
  /** Consecutive entries sharing a key coalesce (sliders, drag gestures). */
  mergeKey?: string
  /** Coalescing window in ms; `createMetadataEntry` defaults to 400. */
  mergeWindowMs?: number
  /**
   * Selection to install after the mutation (e.g. the freshly created layer).
   * Omitted = carry the current selection forward. Always normalized against
   * `after`, so callers may pass ids that the mutation removed.
   */
  selectedLayerIds?: readonly LayerId[]
}

/**
 * Record one document mutation: push history, update the store, sync the tab
 * mirror. Returns false (and does nothing) when the mutation was a no-op.
 */
export function commitDocumentTransaction(
  options: DocumentTransactionOptions,
): boolean {
  const { label, before, after, mergeKey, mergeWindowMs, selectedLayerIds } =
    options
  // Reference equality is the no-op signal; document ops always return new
  // objects when they change something.
  if (before === after) return false

  documentHistory.push(
    createMetadataEntry({
      label,
      before,
      after,
      apply: applyTransactionDocument,
      mergeKey,
      mergeWindowMs,
    }),
  )

  const current = useEditorSessionStore.getState()
  useEditorSessionStore.setState({
    document: after,
    dirty: true,
    historyVersion: documentHistory.version,
    selectedLayerIds: normalizeLayerSelection(
      after,
      selectedLayerIds ?? current.selectedLayerIds,
    ),
  })
  syncActiveTabMirror()
  return true
}

/**
 * `commitDocumentTransaction` over the live session document — the common case
 * where the caller just wants to run a document op against current state.
 */
export function commitDocumentMutation(
  label: string,
  mutator: (document: HappyDocument) => HappyDocument,
  options?: Omit<DocumentTransactionOptions, 'label' | 'before' | 'after'>,
): boolean {
  const before = useEditorSessionStore.getState().document
  return commitDocumentTransaction({
    ...options,
    label,
    before,
    after: mutator(before),
  })
}
