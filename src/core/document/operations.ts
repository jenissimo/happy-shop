import { produce } from 'immer'
import type { Draft } from 'immer'
import {
  canAddEffectType,
  normalizeEffectStack,
} from './effectMultiplicity'
import { canonicalInsertIndex, wouldCrossEffectPhase } from './effectStackOrder'
import { createLayerId } from './ids'
import { getChildrenIds, isSelfOrDescendant } from './query'
import type {
  Adjustment,
  BlendMode,
  GroupLayer,
  HappyDocument,
  Layer,
  LayerEffect,
  LayerId,
  LayerLockFlags,
  RasterMaskRef,
  TextLayer,
  Transform,
} from './schema'

/**
 * Pure, immutable document editing helpers built on `immer`. Every function
 * returns a new `HappyDocument`; the input is never mutated. These are
 * building blocks for higher-level commands/history (SPEC §12), not the
 * command layer itself.
 */

function getMutableChildren(
  draft: Draft<HappyDocument>,
  containerId: LayerId | null,
): LayerId[] {
  if (containerId === null) return draft.rootChildren
  const container = draft.layers[containerId]
  if (!container || container.type !== 'group') {
    throw new Error(`container "${containerId}" is not a group layer`)
  }
  return container.children
}

function collectSubtreeIds(doc: HappyDocument, id: LayerId): LayerId[] {
  const layer = doc.layers[id]
  if (!layer) return [id]
  const ids = [id]
  if (layer.type === 'group') {
    for (const childId of layer.children) {
      ids.push(...collectSubtreeIds(doc, childId))
    }
  }
  return ids
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length))
}

export type AddLayerOptions = {
  /** `null` (default) inserts under the document root. */
  parentId?: LayerId | null
  /** Defaults to the top of the stack (end of the array). */
  index?: number
}

/** Inserts a new layer, overriding its `parentId` to match `options.parentId`. */
export function addLayer(
  doc: HappyDocument,
  layer: Layer,
  options: AddLayerOptions = {},
): HappyDocument {
  const parentId = options.parentId ?? null
  if (doc.layers[layer.id]) {
    throw new Error(`layer "${layer.id}" already exists`)
  }
  return produce(doc, (draft) => {
    const children = getMutableChildren(draft, parentId)
    const index = clampIndex(options.index ?? children.length, children.length)
    children.splice(index, 0, layer.id)
    draft.layers[layer.id] = { ...layer, parentId }
  })
}

/** Removes a layer and, if it is a group, all of its descendants. */
export function removeLayer(doc: HappyDocument, layerId: LayerId): HappyDocument {
  const layer = doc.layers[layerId]
  if (!layer) return doc
  const idsToRemove = collectSubtreeIds(doc, layerId)
  // A document must always retain one layer node. Command callers can treat
  // this as a no-op; the core guard also protects merge and future operations.
  if (idsToRemove.length >= Object.keys(doc.layers).length) return doc
  return produce(doc, (draft) => {
    const children = getMutableChildren(draft, layer.parentId)
    const index = children.indexOf(layerId)
    if (index !== -1) children.splice(index, 1)
    for (const id of idsToRemove) delete draft.layers[id]
  })
}

/** Moves a layer to a new index within its current parent's children. */
export function reorderLayer(
  doc: HappyDocument,
  layerId: LayerId,
  targetIndex: number,
): HappyDocument {
  const layer = doc.layers[layerId]
  if (!layer) return doc
  return produce(doc, (draft) => {
    const children = getMutableChildren(draft, layer.parentId)
    const currentIndex = children.indexOf(layerId)
    if (currentIndex === -1) return
    children.splice(currentIndex, 1)
    children.splice(clampIndex(targetIndex, children.length), 0, layerId)
  })
}

export type MoveLayerOptions = {
  /** `null` reparents under the document root. */
  parentId: LayerId | null
  index?: number
}

/** Reparents a layer, guarding against moving a group into its own subtree. */
export function moveLayer(
  doc: HappyDocument,
  layerId: LayerId,
  options: MoveLayerOptions,
): HappyDocument {
  const layer = doc.layers[layerId]
  if (!layer) return doc
  if (
    options.parentId !== null &&
    isSelfOrDescendant(doc, layerId, options.parentId)
  ) {
    throw new Error(
      `cannot move layer "${layerId}" into itself or one of its descendants`,
    )
  }

  return produce(doc, (draft) => {
    const oldChildren = getMutableChildren(draft, layer.parentId)
    const oldIndex = oldChildren.indexOf(layerId)
    if (oldIndex !== -1) oldChildren.splice(oldIndex, 1)

    const newChildren = getMutableChildren(draft, options.parentId)
    newChildren.splice(
      clampIndex(options.index ?? newChildren.length, newChildren.length),
      0,
      layerId,
    )

    const movedLayer = draft.layers[layerId]
    if (movedLayer) movedLayer.parentId = options.parentId
  })
}

function updateLayer(
  doc: HappyDocument,
  layerId: LayerId,
  recipe: (layer: Draft<Layer>) => void,
): HappyDocument {
  if (!doc.layers[layerId]) return doc
  return produce(doc, (draft) => {
    const layer = draft.layers[layerId]
    if (layer) recipe(layer)
  })
}

export function setVisibility(
  doc: HappyDocument,
  layerId: LayerId,
  visible: boolean,
): HappyDocument {
  return updateLayer(doc, layerId, (layer) => {
    layer.visible = visible
  })
}

export function setLocked(
  doc: HappyDocument,
  layerId: LayerId,
  locked: boolean,
): HappyDocument {
  return updateLayer(doc, layerId, (layer) => {
    layer.locked = locked
  })
}

export function setLayerLockFlag(
  doc: HappyDocument,
  layerId: LayerId,
  flag: keyof LayerLockFlags,
  locked: boolean,
): HappyDocument {
  return updateLayer(doc, layerId, (layer) => {
    layer.lockFlags = {
      transparentPixels: layer.lockFlags?.transparentPixels ?? false,
      imagePixels: layer.lockFlags?.imagePixels ?? false,
      position: layer.lockFlags?.position ?? false,
      [flag]: locked,
    }
  })
}

/** Clamps to the 0..1 range required by SPEC §8.2. */
export function setOpacity(
  doc: HappyDocument,
  layerId: LayerId,
  opacity: number,
): HappyDocument {
  const clamped = Math.max(0, Math.min(1, opacity))
  return updateLayer(doc, layerId, (layer) => {
    layer.opacity = clamped
  })
}

/** Photoshop Fill Opacity (layer pixels; styles keep shape — see LAYER-STYLES.md). */
export function setFillOpacity(
  doc: HappyDocument,
  layerId: LayerId,
  fillOpacity: number,
): HappyDocument {
  const clamped = Math.max(0, Math.min(1, fillOpacity))
  return updateLayer(doc, layerId, (layer) => {
    layer.fillOpacity = clamped
  })
}

export function setBlendMode(
  doc: HappyDocument,
  layerId: LayerId,
  blendMode: BlendMode,
): HappyDocument {
  return updateLayer(doc, layerId, (layer) => {
    layer.blendMode = blendMode
  })
}

/** Enables flatten-then-FX compositing for a group; non-group layers are unchanged. */
export function setGroupIsolated(
  doc: HappyDocument,
  layerId: LayerId,
  isolated: boolean,
): HappyDocument {
  const layer = doc.layers[layerId]
  if (!layer || layer.type !== 'group' || layer.isolated === isolated) return doc
  return updateLayer(doc, layerId, (draftLayer) => {
    if (draftLayer.type === 'group') draftLayer.isolated = isolated
  })
}

export function renameLayer(
  doc: HappyDocument,
  layerId: LayerId,
  name: string,
): HappyDocument {
  return updateLayer(doc, layerId, (layer) => {
    layer.name = name
  })
}

export function setTransform(
  doc: HappyDocument,
  layerId: LayerId,
  patch: Partial<Transform>,
): HappyDocument {
  return updateLayer(doc, layerId, (layer) => {
    Object.assign(layer.transform, patch)
  })
}

export function setMask(
  doc: HappyDocument,
  layerId: LayerId,
  mask: RasterMaskRef | undefined,
): HappyDocument {
  return updateLayer(doc, layerId, (layer) => {
    layer.mask = mask
    if (mask == null) {
      delete layer.maskEnabled
    } else {
      layer.maskEnabled = true
    }
  })
}

/** No-op when the layer has no mask. */
export function setMaskEnabled(
  doc: HappyDocument,
  layerId: LayerId,
  enabled: boolean,
): HappyDocument {
  const layer = doc.layers[layerId]
  if (!layer?.mask) return doc
  if ((layer.maskEnabled ?? true) === enabled) return doc
  return updateLayer(doc, layerId, (draftLayer) => {
    draftLayer.maskEnabled = enabled
  })
}

/** Toggle whether the layer mask clips effects or only pre-FX content alpha. */
export function setMaskHidesEffects(
  doc: HappyDocument,
  layerId: LayerId,
  maskHidesEffects: boolean,
): HappyDocument {
  const layer = doc.layers[layerId]
  if (!layer?.mask) return doc
  if ((layer.maskHidesEffects ?? false) === maskHidesEffects) return doc
  return updateLayer(doc, layerId, (draftLayer) => {
    if (maskHidesEffects) draftLayer.maskHidesEffects = true
    else delete draftLayer.maskHidesEffects
  })
}

/**
 * Wraps `layerIds` (same-parent subset, paint order) in a new group inserted
 * where the first member sat. `group` supplies id/name/flags; children/parent
 * are overwritten.
 */
export function groupLayers(
  doc: HappyDocument,
  layerIds: readonly LayerId[],
  group: GroupLayer,
): HappyDocument {
  if (layerIds.length === 0) return doc
  if (doc.layers[group.id]) {
    throw new Error(`layer "${group.id}" already exists`)
  }

  const first = doc.layers[layerIds[0]!]
  if (!first) return doc
  const parentId = first.parentId
  const siblings = getChildrenIds(doc, parentId)
  if (!siblings) return doc

  const idSet = new Set<LayerId>()
  for (const id of layerIds) {
    const layer = doc.layers[id]
    if (layer && layer.parentId === parentId) idSet.add(id)
  }
  const ordered = siblings.filter((id) => idSet.has(id))
  if (ordered.length === 0) return doc

  const insertIndex = siblings.indexOf(ordered[0]!)
  const insertAt = siblings
    .slice(0, insertIndex)
    .filter((id) => !idSet.has(id)).length

  return produce(doc, (draft) => {
    const children = getMutableChildren(draft, parentId)
    for (const id of [...ordered].reverse()) {
      const idx = children.indexOf(id)
      if (idx !== -1) children.splice(idx, 1)
    }
    children.splice(insertAt, 0, group.id)
    draft.layers[group.id] = {
      ...group,
      parentId,
      type: 'group',
      children: [...ordered],
    }
    for (const id of ordered) {
      const layer = draft.layers[id]
      if (layer) layer.parentId = group.id
    }
  })
}

/** Lifts a group's children into the group's parent and removes the group. */
export function ungroupLayer(
  doc: HappyDocument,
  groupId: LayerId,
): HappyDocument {
  const group = doc.layers[groupId]
  if (!group || group.type !== 'group') return doc

  return produce(doc, (draft) => {
    const draftGroup = draft.layers[groupId]
    if (!draftGroup || draftGroup.type !== 'group') return
    const parentId = draftGroup.parentId
    const childIds = [...draftGroup.children]
    const parentChildren = getMutableChildren(draft, parentId)
    const groupIndex = parentChildren.indexOf(groupId)
    if (groupIndex === -1) return
    parentChildren.splice(groupIndex, 1, ...childIds)
    for (const id of childIds) {
      const child = draft.layers[id]
      if (child) child.parentId = parentId
    }
    delete draft.layers[groupId]
  })
}

export function addEffect(
  doc: HappyDocument,
  layerId: LayerId,
  effect: LayerEffect,
): HappyDocument {
  const layer = doc.layers[layerId]
  if (!layer) return doc
  if (!canAddEffectType(layer.effects, effect.type)) return doc
  return updateLayer(doc, layerId, (draftLayer) => {
    const idx = canonicalInsertIndex(draftLayer.effects, effect.type)
    draftLayer.effects.splice(idx, 0, effect)
  })
}

export function removeEffect(
  doc: HappyDocument,
  layerId: LayerId,
  effectId: string,
): HappyDocument {
  return updateLayer(doc, layerId, (layer) => {
    const index = layer.effects.findIndex((e) => e.id === effectId)
    if (index !== -1) layer.effects.splice(index, 1)
  })
}

/** Replaces an existing effect by id (matched effect must share the id). */
export function replaceEffect(
  doc: HappyDocument,
  layerId: LayerId,
  effect: LayerEffect,
): HappyDocument {
  return updateLayer(doc, layerId, (layer) => {
    const index = layer.effects.findIndex((e) => e.id === effect.id)
    if (index !== -1) layer.effects[index] = effect
  })
}

/** Replaces the full effect stack (Layer Style OK / Cancel coalescing). */
export function setLayerEffects(
  doc: HappyDocument,
  layerId: LayerId,
  effects: LayerEffect[],
): HappyDocument {
  const { effects: normalized } = normalizeEffectStack(effects)
  return updateLayer(doc, layerId, (layer) => {
    layer.effects = normalized
  })
}

/** Toggle a single node enabled flag (discrete history outside the dialog). */
export function toggleEffect(
  doc: HappyDocument,
  layerId: LayerId,
  effectId: string,
  enabled?: boolean,
): HappyDocument {
  return updateLayer(doc, layerId, (layer) => {
    const effect = layer.effects.find((e) => e.id === effectId)
    if (!effect) return
    effect.enabled = enabled ?? !effect.enabled
  })
}

/** Duplicate a node (new id) and insert after the source. Respects multiplicity. */
export function duplicateEffect(
  doc: HappyDocument,
  layerId: LayerId,
  effectId: string,
): HappyDocument {
  const layer = doc.layers[layerId]
  if (!layer) return doc
  const source = layer.effects.find((e) => e.id === effectId)
  if (!source) return doc
  if (!canAddEffectType(layer.effects, source.type)) return doc
  const copy = { ...structuredClone(source), id: createLayerId() }
  return updateLayer(doc, layerId, (draftLayer) => {
    const index = draftLayer.effects.findIndex((e) => e.id === effectId)
    if (index === -1) return
    draftLayer.effects.splice(index + 1, 0, copy)
  })
}

/**
 * Swap two adjacent effect indices. Refuses key ↔ style phase crossing.
 * `toIndex` must be fromIndex ± 1 for the simple ↑↓ dialog path; arbitrary
 * reorder uses moveEffectInStack.
 */
export function reorderEffect(
  doc: HappyDocument,
  layerId: LayerId,
  fromIndex: number,
  toIndex: number,
): HappyDocument {
  const layer = doc.layers[layerId]
  if (!layer) return doc
  const n = layer.effects.length
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= n ||
    toIndex >= n ||
    fromIndex === toIndex
  ) {
    return doc
  }
  if (wouldCrossEffectPhase(layer.effects, fromIndex, toIndex)) return doc
  return updateLayer(doc, layerId, (draftLayer) => {
    const [item] = draftLayer.effects.splice(fromIndex, 1)
    if (!item) return
    draftLayer.effects.splice(toIndex, 0, item)
  })
}

/** No-op unless the target is an adjustment layer. */
export function setAdjustment(
  doc: HappyDocument,
  layerId: LayerId,
  adjustment: Adjustment,
): HappyDocument {
  const layer = doc.layers[layerId]
  if (!layer || layer.type !== 'adjustment') return doc
  return produce(doc, (draft) => {
    const draftLayer = draft.layers[layerId]
    if (draftLayer && draftLayer.type === 'adjustment') {
      draftLayer.adjustment = adjustment
    }
  })
}

export type TextLayerPropsPatch = Partial<
  Pick<
    TextLayer,
    | 'content'
    | 'textMode'
    | 'fontFamily'
    | 'fontSource'
    | 'fontSize'
    | 'fontWeight'
    | 'italic'
    | 'underline'
    | 'color'
    | 'runs'
    | 'tracking'
    | 'leading'
    | 'align'
    | 'bounds'
  >
>

/** No-op unless the target is a text layer. */
export function updateTextLayer(
  doc: HappyDocument,
  layerId: LayerId,
  patch: TextLayerPropsPatch,
): HappyDocument {
  const layer = doc.layers[layerId]
  if (!layer || layer.type !== 'text') return doc
  return produce(doc, (draft) => {
    const draftLayer = draft.layers[layerId]
    if (!draftLayer || draftLayer.type !== 'text') return
    if (patch.content !== undefined) draftLayer.content = patch.content
    if (patch.textMode !== undefined) draftLayer.textMode = patch.textMode
    if (patch.fontFamily !== undefined) draftLayer.fontFamily = patch.fontFamily
    if ('fontSource' in patch) {
      if (patch.fontSource === undefined) delete draftLayer.fontSource
      else draftLayer.fontSource = patch.fontSource
    }
    if (patch.fontSize !== undefined) draftLayer.fontSize = patch.fontSize
    if (patch.fontWeight !== undefined) draftLayer.fontWeight = patch.fontWeight
    if (patch.italic !== undefined) draftLayer.italic = patch.italic
    if (patch.underline !== undefined) draftLayer.underline = patch.underline
    if (patch.color !== undefined) draftLayer.color = patch.color
    if (patch.runs !== undefined) draftLayer.runs = patch.runs
    if (patch.tracking !== undefined) draftLayer.tracking = patch.tracking
    if (patch.leading !== undefined) draftLayer.leading = patch.leading
    if (patch.align !== undefined) draftLayer.align = patch.align
    if (patch.bounds !== undefined) {
      draftLayer.bounds = { ...draftLayer.bounds, ...patch.bounds }
    }
  })
}

/**
 * Replaces a layer in-place (same id / parent / stack index). Used by
 * `layer.rasterize` (text → raster) without disturbing paint order.
 */
export function replaceLayer(
  doc: HappyDocument,
  layer: Layer,
): HappyDocument {
  if (!doc.layers[layer.id]) return doc
  return produce(doc, (draft) => {
    const prev = draft.layers[layer.id]
    if (!prev) return
    draft.layers[layer.id] = { ...layer, parentId: prev.parentId }
  })
}
