import {
  getLayer,
  isLayerPositionLocked,
  setTransform as setTransformOp,
  type HappyDocument,
  type LayerId,
  type Transform,
} from '../../../core/document'
import { createMetadataEntry } from '../../../core/history'
import { documentHistory } from '../../session/documentHistory'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { isTransformableLayer } from './layerLocalBounds'
import { useTransformStore } from './transformStore'

function applyDoc(doc: HappyDocument): void {
  useEditorSessionStore.setState({ document: doc, dirty: true })
}

function pushMetadata(
  label: string,
  before: HappyDocument,
  after: HappyDocument,
  mergeKey: string,
  mergeWindowMs = 60_000,
): void {
  if (before === after) return
  documentHistory.push(
    createMetadataEntry({
      label,
      before,
      after,
      apply: applyDoc,
      mergeKey,
      mergeWindowMs,
    }),
  )
  useEditorSessionStore.setState({
    document: after,
    dirty: true,
    historyVersion: documentHistory.version,
  })
}

export function applyLayerTransforms(
  updates: Array<{ id: LayerId; transform: Transform }>,
): HappyDocument {
  let doc = useEditorSessionStore.getState().document
  for (const u of updates) {
    const layer = getLayer(doc, u.id)
    if (!layer || isLayerPositionLocked(layer)) continue
    doc = setTransformOp(doc, u.id, u.transform)
  }
  return doc
}

/**
 * Live draft apply (no history) — used inside Free Transform modal session.
 */
export function applyTransformsLive(
  updates: Array<{ id: LayerId; transform: Transform }>,
): void {
  const after = applyLayerTransforms(updates)
  useEditorSessionStore.setState({ document: after, dirty: true })
}

/**
 * Coalesced history txn for one gesture (move / scale / rotate).
 */
export function commitTransformGesture(
  label: string,
  updates: Array<{ id: LayerId; transform: Transform }>,
  mergeKey: string,
): void {
  const before = useEditorSessionStore.getState().document
  const after = applyLayerTransforms(updates)
  if (after === before) return
  pushMetadata(label, before, after, mergeKey)
}

export function transformableSelection(): LayerId[] {
  const { document, selectedLayerIds } = useEditorSessionStore.getState()
  return selectedLayerIds.filter((id) => {
    const layer = getLayer(document, id)
    return layer != null && isTransformableLayer(layer)
  })
}

/** Enter Free Transform (Mod+T / Edit → Free Transform). */
export function beginFreeTransform(): boolean {
  const ids = transformableSelection()
  if (ids.length === 0) return false
  const doc = useEditorSessionStore.getState().document
  const baselines: Record<string, Transform> = {}
  for (const id of ids) {
    const layer = getLayer(doc, id)
    if (layer) baselines[id] = { ...layer.transform }
  }
  useEditorSessionStore.getState().setActiveToolId('move')
  useTransformStore.getState().beginFreeTransformSession({
    layerIds: ids,
    baselines,
  })
  return true
}

/** Commit Free Transform session (Enter / click outside / other tool). */
export function commitFreeTransformSession(): boolean {
  const session = useTransformStore.getState().session
  if (!session) return false
  const before = structuredCloneLike(useEditorSessionStore.getState().document)
  // Rebuild "before" with baseline transforms for history.
  let baselineDoc = before
  for (const id of session.layerIds) {
    const t = session.baselines[id]
    if (t) baselineDoc = setTransformOp(baselineDoc, id, t)
  }
  const after = useEditorSessionStore.getState().document
  if (docsTransformsEqual(baselineDoc, after, session.layerIds)) {
    useTransformStore.getState().endFreeTransformSession()
    return true
  }
  // History should undo back to baselines, not to mid-session live drafts.
  documentHistory.push(
    createMetadataEntry({
      label: 'Free Transform',
      before: baselineDoc,
      after,
      apply: applyDoc,
      mergeKey: `free-transform:${session.layerIds.join(',')}`,
      mergeWindowMs: 60_000,
    }),
  )
  useEditorSessionStore.setState({
    dirty: true,
    historyVersion: documentHistory.version,
  })
  useTransformStore.getState().endFreeTransformSession()
  return true
}

/** Esc — restore baselines and exit session. */
export function cancelFreeTransformSession(): boolean {
  const session = useTransformStore.getState().session
  if (!session) return false
  const updates = session.layerIds.map((id) => ({
    id,
    transform: session.baselines[id]!,
  })).filter((u) => u.transform)
  applyTransformsLive(updates)
  useTransformStore.getState().endFreeTransformSession()
  return true
}

function docsTransformsEqual(
  a: HappyDocument,
  b: HappyDocument,
  ids: LayerId[],
): boolean {
  for (const id of ids) {
    const la = a.layers[id]
    const lb = b.layers[id]
    if (!la || !lb) continue
    const ta = la.transform
    const tb = lb.transform
    if (
      ta.x !== tb.x ||
      ta.y !== tb.y ||
      ta.scaleX !== tb.scaleX ||
      ta.scaleY !== tb.scaleY ||
      ta.rotationDeg !== tb.rotationDeg ||
      ta.skewXDeg !== tb.skewXDeg ||
      ta.skewYDeg !== tb.skewYDeg ||
      ta.pivotX !== tb.pivotX ||
      ta.pivotY !== tb.pivotY
    ) {
      return false
    }
  }
  return true
}

/** Cheap structured clone for HappyDocument metadata (no pixels). */
function structuredCloneLike(doc: HappyDocument): HappyDocument {
  return JSON.parse(JSON.stringify(doc)) as HappyDocument
}
