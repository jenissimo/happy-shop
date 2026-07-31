import {
  createLayerId,
  setLayerEffects,
  type HappyDocument,
  type LayerEffect,
  type LayerId,
} from '../../core/document'
import { createMetadataEntry } from '../../core/history'
import { documentHistory } from './documentHistory'
import { useEditorSessionStore } from './EditorSessionStore'

let copiedEffects: LayerEffect[] | null = null

function applyDocument(document: HappyDocument): void {
  const state = useEditorSessionStore.getState()
  useEditorSessionStore.setState({
    document,
    dirty: true,
    historyVersion: documentHistory.version,
    selectedLayerIds: state.selectedLayerIds.filter((id) => document.layers[id]),
  })
}

function commit(label: string, after: HappyDocument): boolean {
  const before = useEditorSessionStore.getState().document
  if (after === before) return false
  documentHistory.push(
    createMetadataEntry({ label, before, after, apply: applyDocument }),
  )
  applyDocument(after)
  return true
}

/** Store a detached stack; paste always creates fresh node ids. */
export function copyLayerEffects(effects: readonly LayerEffect[]): void {
  copiedEffects = [...structuredClone(effects)]
}

export function hasCopiedLayerEffects(): boolean {
  return copiedEffects !== null
}

export function clearCopiedLayerEffects(): void {
  copiedEffects = null
}

export function cloneCopiedLayerEffects(): LayerEffect[] | null {
  if (!copiedEffects) return null
  return structuredClone(copiedEffects).map((effect) => ({
    ...effect,
    id: createLayerId(),
  }))
}

/**
 * Replace each target's stack from the FX clipboard in one metadata transaction.
 * `setLayerEffects` retains the document invariants (ids/caps) on every target.
 */
export function pasteCopiedLayerEffects(
  document: HappyDocument,
  targetIds: readonly LayerId[],
): HappyDocument {
  const effects = cloneCopiedLayerEffects()
  if (!effects || targetIds.length === 0) return document

  let next = document
  for (const layerId of new Set(targetIds)) {
    if (!next.layers[layerId]) continue
    // Each target needs independent node ids, including when pasting to many layers.
    const targetEffects = effects.map((effect) => ({ ...structuredClone(effect), id: createLayerId() }))
    next = setLayerEffects(next, layerId, targetEffects)
  }
  return next
}

export function copySelectedLayerEffects(): void {
  const state = useEditorSessionStore.getState()
  const layerId = state.selectedLayerIds[0]
  const layer = layerId ? state.document.layers[layerId] : null
  if (layer) copyLayerEffects(layer.effects)
}

export function pasteCopiedLayerEffectsToSelection(): boolean {
  const state = useEditorSessionStore.getState()
  return commit(
    'Paste Layer Style',
    pasteCopiedLayerEffects(state.document, state.selectedLayerIds),
  )
}

/** Shared discrete-history bridge for Effects panel structural interactions. */
export function commitLayerFxMutation(
  label: string,
  mutate: (document: HappyDocument) => HappyDocument,
): boolean {
  return commit(label, mutate(useEditorSessionStore.getState().document))
}
