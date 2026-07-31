import { describe, expect, test } from 'bun:test'
import {
  createAdjustmentLayer,
  createEmptyDocument,
  createGroupLayer,
  createRasterLayer,
} from './factories'
import { asRasterAssetRef, asRasterMaskRef } from './ids'
import { validateDocumentInvariants } from './invariants'
import {
  addEffect,
  addLayer,
  groupLayers,
  moveLayer,
  removeEffect,
  removeLayer,
  renameLayer,
  reorderLayer,
  replaceEffect,
  setAdjustment,
  setBlendMode,
  setGroupIsolated,
  setLocked,
  setLayerLockFlag,
  setMask,
  setMaskEnabled,
  setOpacity,
  setTransform,
  setVisibility,
  ungroupLayer,
} from './operations'
import type { HappyDocument } from './schema'

function docWithRaster(): { doc: HappyDocument; layerId: string } {
  const layer = createRasterLayer({ pixels: asRasterAssetRef('asset-1') })
  const doc = addLayer(createEmptyDocument(), layer)
  return { doc, layerId: layer.id }
}

describe('addLayer', () => {
  test('inserts under the root by default and keeps the doc valid', () => {
    const layer = createRasterLayer({ pixels: asRasterAssetRef('asset-1') })
    const before = createEmptyDocument()
    const after = addLayer(before, layer)

    expect(after.rootChildren).toEqual([...before.rootChildren, layer.id])
    expect(after.layers[layer.id]).toEqual(layer)
    expect(validateDocumentInvariants(after).ok).toBe(true)
    // Original is untouched.
    expect(before.rootChildren).toHaveLength(1)
    expect(Object.keys(before.layers)).toHaveLength(1)
  })

  test('inserts under a group and stamps parentId', () => {
    const group = createGroupLayer()
    const raster = createRasterLayer({ pixels: asRasterAssetRef('asset-1') })
    let doc = addLayer(createEmptyDocument(), group)
    doc = addLayer(doc, raster, { parentId: group.id })

    expect((doc.layers[group.id] as { children: string[] }).children).toEqual([
      raster.id,
    ])
    expect(doc.layers[raster.id]?.parentId).toBe(group.id)
    expect(validateDocumentInvariants(doc).ok).toBe(true)
  })

  test('throws when the layer id already exists', () => {
    const { doc, layerId } = docWithRaster()
    const dup = { ...doc.layers[layerId]!, name: 'dup' }
    expect(() => addLayer(doc, dup)).toThrow()
  })

  test('respects an explicit insertion index', () => {
    const a = createRasterLayer({ pixels: asRasterAssetRef('a') })
    const b = createRasterLayer({ pixels: asRasterAssetRef('b') })
    let doc = addLayer(createEmptyDocument(), a)
    doc = addLayer(doc, b, { index: 0 })
    expect(doc.rootChildren).toEqual([b.id, doc.rootChildren[1]!, a.id])
  })
})

describe('removeLayer', () => {
  test('refuses to remove the final layer node', () => {
    const doc = createEmptyDocument()
    const onlyLayerId = doc.rootChildren[0]!

    expect(removeLayer(doc, onlyLayerId)).toBe(doc)
  })

  test('removes a leaf layer while retaining the initial layer', () => {
    const { doc, layerId } = docWithRaster()
    const after = removeLayer(doc, layerId)
    expect(after.rootChildren).toHaveLength(1)
    expect(after.layers[layerId]).toBeUndefined()
  })

  test('cascades into descendants of a group', () => {
    const group = createGroupLayer()
    const raster = createRasterLayer({ pixels: asRasterAssetRef('asset-1') })
    let doc = addLayer(createEmptyDocument(), group)
    doc = addLayer(doc, raster, { parentId: group.id })

    const after = removeLayer(doc, group.id)
    expect(after.layers[group.id]).toBeUndefined()
    expect(after.layers[raster.id]).toBeUndefined()
    expect(after.rootChildren).toHaveLength(1)
    expect(validateDocumentInvariants(after).ok).toBe(true)
  })

  test('is a no-op for an unknown id', () => {
    const { doc } = docWithRaster()
    expect(removeLayer(doc, 'nope' as never)).toBe(doc)
  })
})

describe('reorderLayer', () => {
  test('moves a layer within its siblings', () => {
    const a = createRasterLayer({ pixels: asRasterAssetRef('a') })
    const b = createRasterLayer({ pixels: asRasterAssetRef('b') })
    const c = createRasterLayer({ pixels: asRasterAssetRef('c') })
    let doc = addLayer(createEmptyDocument(), a)
    doc = addLayer(doc, b)
    doc = addLayer(doc, c)
    // [a, b, c] -> move c to index 0
    const after = reorderLayer(doc, c.id, 0)
    expect(after.rootChildren[0]).toBe(c.id)
    expect(after.rootChildren).toEqual(
      expect.arrayContaining([a.id, b.id, c.id]),
    )
  })
})

describe('moveLayer', () => {
  test('reparents a layer and updates parentId', () => {
    const group = createGroupLayer()
    const raster = createRasterLayer({ pixels: asRasterAssetRef('a') })
    let doc = addLayer(createEmptyDocument(), group)
    doc = addLayer(doc, raster)

    const after = moveLayer(doc, raster.id, { parentId: group.id })
    expect(after.rootChildren).toContain(group.id)
    expect((after.layers[group.id] as { children: string[] }).children).toEqual([
      raster.id,
    ])
    expect(after.layers[raster.id]?.parentId).toBe(group.id)
    expect(validateDocumentInvariants(after).ok).toBe(true)
  })

  test('throws when moving a group into its own descendant', () => {
    const outer = createGroupLayer()
    const inner = createGroupLayer()
    let doc = addLayer(createEmptyDocument(), outer)
    doc = addLayer(doc, inner, { parentId: outer.id })

    expect(() => moveLayer(doc, outer.id, { parentId: inner.id })).toThrow()
  })

  test('throws when moving a layer into itself', () => {
    const group = createGroupLayer()
    const doc = addLayer(createEmptyDocument(), group)
    expect(() => moveLayer(doc, group.id, { parentId: group.id })).toThrow()
  })
})

describe('simple property setters', () => {
  test('setLayerLockFlag toggles granular locks', () => {
    const { doc, layerId } = docWithRaster()
    const next = setLayerLockFlag(doc, layerId, 'imagePixels', true)
    expect(next.layers[layerId]?.lockFlags?.imagePixels).toBe(true)
    expect(next.layers[layerId]?.lockFlags?.position).toBe(false)
  })

  test('setVisibility / setLocked / setBlendMode / renameLayer', () => {
    const { doc, layerId } = docWithRaster()
    let next = setVisibility(doc, layerId, false)
    expect(next.layers[layerId]?.visible).toBe(false)
    next = setLocked(next, layerId, true)
    expect(next.layers[layerId]?.locked).toBe(true)
    next = setBlendMode(next, layerId, 'multiply')
    expect(next.layers[layerId]?.blendMode).toBe('multiply')
    next = renameLayer(next, layerId, 'Background')
    expect(next.layers[layerId]?.name).toBe('Background')
    // Original document is never mutated.
    expect(doc.layers[layerId]?.visible).toBe(true)
  })

  test('setOpacity clamps to 0..1', () => {
    const { doc, layerId } = docWithRaster()
    expect(setOpacity(doc, layerId, 2).layers[layerId]?.opacity).toBe(1)
    expect(setOpacity(doc, layerId, -2).layers[layerId]?.opacity).toBe(0)
    expect(setOpacity(doc, layerId, 0.42).layers[layerId]?.opacity).toBe(0.42)
  })

  test('setGroupIsolated only updates groups', () => {
    const group = createGroupLayer()
    const doc = addLayer(createEmptyDocument(), group)
    expect(setGroupIsolated(doc, group.id, true).layers[group.id]?.isolated).toBe(true)

    const { layerId } = docWithRaster()
    expect(setGroupIsolated(doc, layerId, true)).toBe(doc)
  })

  test('setTransform merges a partial patch', () => {
    const { doc, layerId } = docWithRaster()
    const after = setTransform(doc, layerId, { x: 10, rotationDeg: 90 })
    expect(after.layers[layerId]?.transform.x).toBe(10)
    expect(after.layers[layerId]?.transform.rotationDeg).toBe(90)
    expect(after.layers[layerId]?.transform.scaleX).toBe(1)
  })

  test('setMask sets and clears', () => {
    const { doc, layerId } = docWithRaster()
    const masked = setMask(doc, layerId, asRasterMaskRef('mask-1'))
    expect(masked.layers[layerId]?.mask).toBe('mask-1')
    expect(masked.layers[layerId]?.maskEnabled).toBe(true)
    const disabled = setMaskEnabled(masked, layerId, false)
    expect(disabled.layers[layerId]?.maskEnabled).toBe(false)
    const unmasked = setMask(disabled, layerId, undefined)
    expect(unmasked.layers[layerId]?.mask).toBeUndefined()
    expect(unmasked.layers[layerId]?.maskEnabled).toBeUndefined()
  })
})

describe('groupLayers / ungroupLayer', () => {
  test('groups same-parent siblings in paint order', () => {
    const a = createRasterLayer({ pixels: asRasterAssetRef('a') })
    const b = createRasterLayer({ pixels: asRasterAssetRef('b') })
    const c = createRasterLayer({ pixels: asRasterAssetRef('c') })
    let doc = addLayer(createEmptyDocument(), a)
    doc = addLayer(doc, b)
    doc = addLayer(doc, c)
    const group = createGroupLayer({ name: 'Folder' })
    doc = groupLayers(doc, [a.id, c.id], group)
    expect(doc.rootChildren.slice(1)).toEqual([group.id, b.id])
    const g = doc.layers[group.id]
    expect(g?.type).toBe('group')
    if (g?.type === 'group') expect(g.children).toEqual([a.id, c.id])
    expect(doc.layers[a.id]?.parentId).toBe(group.id)
    expect(doc.layers[c.id]?.parentId).toBe(group.id)
    expect(validateDocumentInvariants(doc).ok).toBe(true)
  })

  test('ungroup lifts children and removes the group', () => {
    const a = createRasterLayer({ pixels: asRasterAssetRef('a') })
    const group = createGroupLayer({ name: 'G' })
    let doc = addLayer(createEmptyDocument(), group)
    doc = addLayer(doc, a, { parentId: group.id })
    doc = ungroupLayer(doc, group.id)
    expect(doc.layers[group.id]).toBeUndefined()
    expect(doc.rootChildren).toContain(a.id)
    expect(doc.layers[a.id]?.parentId).toBeNull()
  })
})

describe('effects', () => {
  test('addEffect / replaceEffect / removeEffect', () => {
    const { doc, layerId } = docWithRaster()
    const effect = {
      id: 'fx1',
      type: 'stroke' as const,
      enabled: true,
      blendMode: 'normal' as const,
      color: '#000000',
      opacity: 1,
      overprint: false,
      size: 2,
      position: 'outside' as const,
      fillType: 'color' as const,
    }
    let next = addEffect(doc, layerId, effect)
    expect(next.layers[layerId]?.effects).toEqual([effect])

    const updated = { ...effect, size: 5 }
    next = replaceEffect(next, layerId, updated)
    expect(next.layers[layerId]?.effects).toEqual([updated])

    next = removeEffect(next, layerId, 'fx1')
    expect(next.layers[layerId]?.effects).toEqual([])
  })
})

describe('setAdjustment', () => {
  test('updates the adjustment payload on adjustment layers', () => {
    const layer = createAdjustmentLayer({
      adjustment: { type: 'levels', black: 0, white: 255, gamma: 1 },
    })
    const doc = addLayer(createEmptyDocument(), layer)
    const after = setAdjustment(doc, layer.id, {
      type: 'levels',
      black: 10,
      white: 240,
      gamma: 1.2,
    })
    const updated = after.layers[layer.id]
    expect(updated && 'adjustment' in updated ? updated.adjustment : null).toEqual(
      { type: 'levels', black: 10, white: 240, gamma: 1.2 },
    )
  })

  test('is a no-op on non-adjustment layers', () => {
    const { doc, layerId } = docWithRaster()
    const after = setAdjustment(doc, layerId, {
      type: 'levels',
      black: 0,
      white: 255,
      gamma: 1,
    })
    expect(after).toBe(doc)
  })
})
