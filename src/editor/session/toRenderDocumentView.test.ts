import { describe, expect, test } from 'bun:test'
import {
  addLayer,
  asRasterAssetRef,
  asRasterMaskRef,
  createAdjustmentLayer,
  createEmptyDocument,
  createGroupLayer,
  createRasterLayer,
  setMask,
  setMaskEnabled,
  type Adjustment,
} from '../../core/document'
import type { RasterSurfaceEntry } from '../../imaging'
import { toRenderDocumentView, type RenderAssetLookup } from './toRenderDocumentView'

function fakeBitmap(width = 8, height = 8): ImageBitmap {
  return {
    width,
    height,
    close() {},
  } as ImageBitmap
}

function assetsFrom(
  entries: RasterSurfaceEntry[],
): RenderAssetLookup {
  const map = new Map(entries.map((e) => [e.assetId, e]))
  return { get: (id) => map.get(id) }
}

function rasterAssets(ids: string[]): RenderAssetLookup {
  return assetsFrom(
    ids.map((assetId) => ({ assetId, width: 4, height: 4, bitmap: fakeBitmap(4, 4) })),
  )
}

const LEVELS: Adjustment = { type: 'levels', black: 10, white: 240, gamma: 1.2 }

describe('toRenderDocumentView', () => {
  test('maps raster layers with resolved assets to image-bitmap sources', () => {
    const bgRef = asRasterAssetRef('asset-bg')
    const panelRef = asRasterAssetRef('asset-panel')
    let doc = createEmptyDocument({
      name: 'Demo',
      width: 200,
      height: 100,
      background: 'transparent',
    })
    doc = addLayer(doc, createRasterLayer({ name: 'Background', pixels: bgRef }))
    doc = addLayer(
      doc,
      createRasterLayer({
        name: 'Panel',
        pixels: panelRef,
        opacity: 0.5,
        transform: { x: 10, y: 20, rotationDeg: 15 },
      }),
    )

    const assets = assetsFrom([
      { assetId: bgRef, width: 200, height: 100, bitmap: fakeBitmap(200, 100) },
      { assetId: panelRef, width: 80, height: 40, bitmap: fakeBitmap(80, 40) },
    ])

    const view = toRenderDocumentView(doc, assets)

    expect(view.id).toBe(doc.id)
    expect(view.width).toBe(200)
    expect(view.height).toBe(100)
    expect(view.background).toBe('transparent')
    expect(view.layers).toHaveLength(2)
    expect(view.layers[0]?.source.kind).toBe('image-bitmap')
    expect(view.layers[0]?.width).toBe(200)
    expect(view.layers[1]?.opacity).toBe(0.5)
    expect(view.layers[1]?.transform.x).toBe(10)
    expect(view.layers[1]?.transform.rotationDeg).toBe(15)
    expect(view.layers[1]?.width).toBe(80)
    expect(view.layers[1]?.height).toBe(40)
  })

  test('falls back to a color placeholder when an asset is missing', () => {
    const ref = asRasterAssetRef('missing')
    let doc = createEmptyDocument({ width: 64, height: 32 })
    doc = addLayer(doc, createRasterLayer({ name: 'Missing', pixels: ref }))

    const view = toRenderDocumentView(doc, { get: () => undefined })

    expect(view.layers).toHaveLength(1)
    expect(view.layers[0]?.source).toEqual({
      kind: 'color',
      color: '#5c6673',
    })
    expect(view.layers[0]?.width).toBe(64)
    expect(view.layers[0]?.height).toBe(32)
  })

  test('skips groups and only emits paint-order raster/text/shape layers', () => {
    const a = asRasterAssetRef('a')
    const b = asRasterAssetRef('b')
    let doc = createEmptyDocument()
    const group = createGroupLayer({ name: 'Group' })
    doc = addLayer(doc, group)
    doc = addLayer(
      doc,
      createRasterLayer({ name: 'Inside', pixels: a }),
      { parentId: group.id },
    )
    doc = addLayer(doc, createRasterLayer({ name: 'Top', pixels: b }))

    const assets = assetsFrom([
      { assetId: a, width: 1, height: 1, bitmap: fakeBitmap() },
      { assetId: b, width: 1, height: 1, bitmap: fakeBitmap() },
    ])
    const view = toRenderDocumentView(doc, assets)

    expect(view.layers).toHaveLength(2)
    expect(view.layers.every((l) => l.kind === 'raster')).toBe(true)
    expect(view.layers.some((l) => l.id === group.id)).toBe(false)
  })

  test('a group with effects is promoted out of pass-through and keeps its FX', () => {
    const a = asRasterAssetRef('a')
    let doc = createEmptyDocument()
    const group = createGroupLayer({
      name: 'PassThrough',
      effects: [
        {
          id: 'shadow-1',
          type: 'drop-shadow',
          enabled: true,
          blendMode: 'normal',
          color: '#000000',
          opacity: 1,
          angle: 120,
          distance: 4,
          spread: 0,
          size: 8,
          contour: 'linear',
          noise: 0,
          layerKnocksOutDropShadow: true,
        },
      ],
    })
    doc = addLayer(doc, group)
    doc = addLayer(doc, createRasterLayer({ name: 'Inside', pixels: a }), {
      parentId: group.id,
    })

    const assets = assetsFrom([
      { assetId: a, width: 1, height: 1, bitmap: fakeBitmap() },
    ])
    const view = toRenderDocumentView(doc, assets)

    expect(view.layers).toHaveLength(1)
    const groupView = view.layers[0]
    expect(groupView?.kind).toBe('group')
    expect(groupView?.effects?.[0]?.type).toBe('drop-shadow')
    if (groupView?.kind === 'group') {
      expect(groupView.children).toHaveLength(1)
      expect(groupView.children[0]?.kind).toBe('raster')
    }
  })

  test('maps an isolated group to a nested RenderGroupLayerView (SPECS/GROUP-LAYER-FX.md)', () => {
    // The initial empty Layer 1 group is non-rendering, so only the isolated
    // group and top raster appear in the root render view.
    const a = asRasterAssetRef('a')
    const b = asRasterAssetRef('b')
    let doc = createEmptyDocument()
    const group = createGroupLayer({
      name: 'Isolated',
      isolated: true,
      opacity: 0.5,
    })
    doc = addLayer(doc, group)
    doc = addLayer(doc, createRasterLayer({ name: 'Inside', pixels: a }), {
      parentId: group.id,
    })
    doc = addLayer(doc, createRasterLayer({ name: 'Top', pixels: b }))

    const assets = assetsFrom([
      { assetId: a, width: 1, height: 1, bitmap: fakeBitmap() },
      { assetId: b, width: 1, height: 1, bitmap: fakeBitmap() },
    ])
    const view = toRenderDocumentView(doc, assets)

    expect(view.layers).toHaveLength(2)
    const groupView = view.layers.find((l) => l.id === group.id)
    expect(groupView?.kind).toBe('group')
    expect(groupView?.opacity).toBe(0.5)
    if (groupView?.kind === 'group') {
      expect(groupView.children).toHaveLength(1)
      expect(groupView.children[0]?.id).toBeDefined()
      expect(groupView.children[0]?.kind).toBe('raster')
    }
    expect(view.layers.some((l) => l.kind === 'group')).toBe(true)
  })

  test('nested pass-through group inside an isolated group inlines into the isolated group children', () => {
    const a = asRasterAssetRef('a')
    let doc = createEmptyDocument()
    const outer = createGroupLayer({ name: 'Outer', isolated: true })
    doc = addLayer(doc, outer)
    const inner = createGroupLayer({ name: 'Inner' })
    doc = addLayer(doc, inner, { parentId: outer.id })
    doc = addLayer(doc, createRasterLayer({ name: 'Leaf', pixels: a }), {
      parentId: inner.id,
    })

    const assets = assetsFrom([{ assetId: a, width: 1, height: 1, bitmap: fakeBitmap() }])
    const view = toRenderDocumentView(doc, assets)

    const groupView = view.layers.find((l) => l.id === outer.id)
    expect(groupView?.kind).toBe('group')
    if (groupView?.kind === 'group') {
      expect(groupView.children).toHaveLength(1)
      expect(groupView.children[0]?.kind).toBe('raster')
    }
  })

  test('pass-through group composes its transform onto inlined children', () => {
    const a = asRasterAssetRef('a')
    let doc = createEmptyDocument()
    const group = createGroupLayer({ name: 'Moved', transform: { x: 30, y: -12 } })
    doc = addLayer(doc, group)
    doc = addLayer(
      doc,
      createRasterLayer({ name: 'Inside', pixels: a, transform: { x: 5, y: 5 } }),
      { parentId: group.id },
    )

    const assets = assetsFrom([{ assetId: a, width: 4, height: 4, bitmap: fakeBitmap(4, 4) }])
    const view = toRenderDocumentView(doc, assets)

    const child = view.layers.find((l) => l.kind === 'raster')
    expect(child?.transform.x).toBeCloseTo(35)
    expect(child?.transform.y).toBeCloseTo(-7)
  })

  test('pass-through group scale composes onto nested pass-through children', () => {
    const a = asRasterAssetRef('a')
    let doc = createEmptyDocument()
    const outer = createGroupLayer({ name: 'Outer', transform: { scaleX: 2, scaleY: 2 } })
    doc = addLayer(doc, outer)
    const inner = createGroupLayer({ name: 'Inner', transform: { x: 10, y: 0 } })
    doc = addLayer(doc, inner, { parentId: outer.id })
    doc = addLayer(
      doc,
      createRasterLayer({ name: 'Leaf', pixels: a, transform: { x: 3, y: 0 } }),
      { parentId: inner.id },
    )

    const assets = assetsFrom([{ assetId: a, width: 4, height: 4, bitmap: fakeBitmap(4, 4) }])
    const view = toRenderDocumentView(doc, assets)

    const leaf = view.layers.find((l) => l.kind === 'raster')
    expect(leaf?.transform.x).toBeCloseTo(26) // (10 + 3) * 2
    expect(leaf?.transform.scaleX).toBeCloseTo(2)
  })

  test.each([
    ['opacity', { opacity: 0.4 }],
    ['blend mode', { blendMode: 'multiply' as const }],
    ['fill opacity', { fillOpacity: 0.2 }],
  ])('a group with %s is composited through its own buffer', (_label, options) => {
    const a = asRasterAssetRef('a')
    let doc = createEmptyDocument()
    const group = createGroupLayer({ name: 'Buffered', ...options })
    doc = addLayer(doc, group)
    doc = addLayer(doc, createRasterLayer({ name: 'Inside', pixels: a }), {
      parentId: group.id,
    })

    const assets = assetsFrom([{ assetId: a, width: 1, height: 1, bitmap: fakeBitmap() }])
    const view = toRenderDocumentView(doc, assets)

    expect(view.layers.find((l) => l.id === group.id)?.kind).toBe('group')
  })

  test('a masked pass-through group is promoted so the group mask applies', () => {
    const a = asRasterAssetRef('a')
    const maskRef = asRasterMaskRef('group-mask')
    let doc = createEmptyDocument({ width: 8, height: 8 })
    const group = createGroupLayer({ name: 'Masked' })
    doc = addLayer(doc, group)
    doc = addLayer(doc, createRasterLayer({ name: 'Inside', pixels: a }), {
      parentId: group.id,
    })

    const assets = assetsFrom([
      { assetId: a, width: 8, height: 8, bitmap: fakeBitmap(8, 8) },
      { assetId: maskRef, width: 8, height: 8, bitmap: fakeBitmap(8, 8) },
    ])
    expect(toRenderDocumentView(doc, assets).layers[0]?.kind).toBe('raster')

    doc = setMask(doc, group.id, maskRef)
    const masked = toRenderDocumentView(doc, assets).layers[0]
    expect(masked?.kind).toBe('group')
    expect(masked?.mask?.width).toBe(8)
  })

  test('a clipping run becomes one clip group that hoists the base compositing', () => {
    const baseRef = asRasterAssetRef('base')
    const clipRef = asRasterAssetRef('clip')
    const topRef = asRasterAssetRef('top')
    let doc = createEmptyDocument()
    const base = createRasterLayer({
      name: 'Base',
      pixels: baseRef,
      opacity: 0.5,
      blendMode: 'multiply',
    })
    doc = addLayer(doc, base)
    doc = addLayer(doc, createRasterLayer({ name: 'Clipped', pixels: clipRef, clipping: true }))
    doc = addLayer(doc, createRasterLayer({ name: 'Top', pixels: topRef }))

    const assets = assetsFrom([
      { assetId: baseRef, width: 4, height: 4, bitmap: fakeBitmap(4, 4) },
      { assetId: clipRef, width: 4, height: 4, bitmap: fakeBitmap(4, 4) },
      { assetId: topRef, width: 4, height: 4, bitmap: fakeBitmap(4, 4) },
    ])
    const view = toRenderDocumentView(doc, assets)

    const clipGroup = view.layers.find((l) => l.kind === 'group')
    expect(clipGroup).toBeDefined()
    expect(clipGroup?.opacity).toBe(0.5)
    expect(clipGroup?.blendMode).toBe('multiply')
    if (clipGroup?.kind === 'group') {
      expect(clipGroup.clipBaseCount).toBe(1)
      expect(clipGroup.children.map((c) => c.id)).toEqual([base.id, clipGroup.children[1]!.id])
      // Hoisted onto the group, so the base does not apply them twice.
      expect(clipGroup.children[0]?.opacity).toBe(1)
      expect(clipGroup.children[0]?.blendMode).toBe('normal')
    }
    // The unclipped layer above stays a sibling.
    expect(view.layers.at(-1)?.kind).toBe('raster')
  })

  test('consecutive clipping layers share one base', () => {
    const refs = ['b', 'c1', 'c2'].map((n) => asRasterAssetRef(n))
    let doc = createEmptyDocument()
    doc = addLayer(doc, createRasterLayer({ name: 'Base', pixels: refs[0]! }))
    doc = addLayer(doc, createRasterLayer({ name: 'C1', pixels: refs[1]!, clipping: true }))
    doc = addLayer(doc, createRasterLayer({ name: 'C2', pixels: refs[2]!, clipping: true }))

    const assets = assetsFrom(
      refs.map((assetId) => ({ assetId, width: 2, height: 2, bitmap: fakeBitmap(2, 2) })),
    )
    const clipGroup = toRenderDocumentView(doc, assets).layers.find((l) => l.kind === 'group')
    expect(clipGroup?.kind).toBe('group')
    if (clipGroup?.kind === 'group') {
      expect(clipGroup.clipBaseCount).toBe(1)
      expect(clipGroup.children).toHaveLength(3)
    }
  })

  test('a clipping flag with no layer below it is ignored', () => {
    const ref = asRasterAssetRef('only')
    let doc = createEmptyDocument()
    doc = addLayer(doc, createRasterLayer({ name: 'Lonely', pixels: ref, clipping: true }))

    const assets = assetsFrom([{ assetId: ref, width: 2, height: 2, bitmap: fakeBitmap(2, 2) }])
    const view = toRenderDocumentView(doc, assets)

    expect(view.layers.every((l) => l.kind === 'raster')).toBe(true)
  })

  test('an adjustment layer swallows the layers beneath it as its backdrop', () => {
    const bottom = asRasterAssetRef('bottom')
    const middle = asRasterAssetRef('middle')
    let doc = createEmptyDocument()
    doc = addLayer(doc, createRasterLayer({ name: 'Bottom', pixels: bottom }))
    doc = addLayer(doc, createRasterLayer({ name: 'Middle', pixels: middle }))
    const adjustment = createAdjustmentLayer({
      name: 'Levels',
      adjustment: LEVELS,
      opacity: 0.6,
      blendMode: 'multiply',
    })
    doc = addLayer(doc, adjustment)

    const view = toRenderDocumentView(doc, rasterAssets([bottom, middle]))

    expect(view.layers).toHaveLength(1)
    const node = view.layers[0]
    expect(node?.kind).toBe('adjustment')
    expect(node?.id).toBe(adjustment.id)
    expect(node?.opacity).toBe(0.6)
    expect(node?.blendMode).toBe('multiply')
    if (node?.kind === 'adjustment') {
      expect(node.adjustment).toEqual(LEVELS)
      expect(node.children.map((c) => c.kind)).toEqual(['raster', 'raster'])
    }
  })

  test('layers above an adjustment layer stay outside its backdrop', () => {
    const below = asRasterAssetRef('below')
    const above = asRasterAssetRef('above')
    let doc = createEmptyDocument()
    doc = addLayer(doc, createRasterLayer({ name: 'Below', pixels: below }))
    doc = addLayer(doc, createAdjustmentLayer({ name: 'Adj', adjustment: LEVELS }))
    doc = addLayer(doc, createRasterLayer({ name: 'Above', pixels: above }))

    const view = toRenderDocumentView(doc, rasterAssets([below, above]))

    expect(view.layers.map((l) => l.kind)).toEqual(['adjustment', 'raster'])
  })

  test('stacked adjustment layers nest, so the upper one sees the lower result', () => {
    const px = asRasterAssetRef('px')
    let doc = createEmptyDocument()
    doc = addLayer(doc, createRasterLayer({ name: 'Base', pixels: px }))
    const lower = createAdjustmentLayer({ name: 'Lower', adjustment: LEVELS })
    const upper = createAdjustmentLayer({ name: 'Upper', adjustment: LEVELS })
    doc = addLayer(doc, lower)
    doc = addLayer(doc, upper)

    const view = toRenderDocumentView(doc, rasterAssets([px]))

    expect(view.layers).toHaveLength(1)
    const outer = view.layers[0]
    expect(outer?.id).toBe(upper.id)
    if (outer?.kind === 'adjustment') {
      expect(outer.children).toHaveLength(1)
      expect(outer.children[0]?.id).toBe(lower.id)
    }
  })

  test('a hidden adjustment layer leaves its backdrop untouched', () => {
    const px = asRasterAssetRef('px')
    let doc = createEmptyDocument()
    doc = addLayer(doc, createRasterLayer({ name: 'Base', pixels: px }))
    doc = addLayer(
      doc,
      createAdjustmentLayer({ name: 'Adj', adjustment: LEVELS, visible: false }),
    )

    const view = toRenderDocumentView(doc, rasterAssets([px]))

    expect(view.layers.every((l) => l.kind === 'raster')).toBe(true)
  })

  test('an adjustment layer with nothing beneath it is dropped', () => {
    const px = asRasterAssetRef('px')
    let doc = createEmptyDocument()
    doc = addLayer(doc, createAdjustmentLayer({ name: 'Adj', adjustment: LEVELS }))
    doc = addLayer(doc, createRasterLayer({ name: 'Above', pixels: px }))

    const view = toRenderDocumentView(doc, rasterAssets([px]))

    expect(view.layers.every((l) => l.kind === 'raster')).toBe(true)
  })

  test('an adjustment layer mask rides on the node, not on the backdrop', () => {
    const px = asRasterAssetRef('px')
    const maskRef = asRasterMaskRef('adj-mask')
    let doc = createEmptyDocument({ width: 8, height: 8 })
    doc = addLayer(doc, createRasterLayer({ name: 'Base', pixels: px }))
    const adjustment = createAdjustmentLayer({ name: 'Adj', adjustment: LEVELS })
    doc = addLayer(doc, adjustment)
    doc = setMask(doc, adjustment.id, maskRef)

    const assets = assetsFrom([
      { assetId: px, width: 8, height: 8, bitmap: fakeBitmap(8, 8) },
      { assetId: maskRef, width: 8, height: 8, bitmap: fakeBitmap(8, 8) },
    ])
    const node = toRenderDocumentView(doc, assets).layers[0]

    expect(node?.kind).toBe('adjustment')
    expect(node?.mask?.width).toBe(8)
    if (node?.kind === 'adjustment') {
      expect(node.children[0]?.mask).toBeUndefined()
    }
  })

  test('an adjustment inside a buffered group is scoped to that group', () => {
    const inside = asRasterAssetRef('inside')
    const outside = asRasterAssetRef('outside')
    let doc = createEmptyDocument()
    doc = addLayer(doc, createRasterLayer({ name: 'Outside', pixels: outside }))
    const group = createGroupLayer({ name: 'Isolated', isolated: true })
    doc = addLayer(doc, group)
    doc = addLayer(doc, createRasterLayer({ name: 'Inside', pixels: inside }), {
      parentId: group.id,
    })
    doc = addLayer(doc, createAdjustmentLayer({ name: 'Adj', adjustment: LEVELS }), {
      parentId: group.id,
    })

    const view = toRenderDocumentView(doc, rasterAssets([inside, outside]))

    expect(view.layers.map((l) => l.kind)).toEqual(['raster', 'group'])
    const groupView = view.layers[1]
    if (groupView?.kind === 'group') {
      expect(groupView.children).toHaveLength(1)
      expect(groupView.children[0]?.kind).toBe('adjustment')
    }
  })

  test('an adjustment inside a pass-through group also adjusts layers below the group', () => {
    const inside = asRasterAssetRef('inside')
    const outside = asRasterAssetRef('outside')
    let doc = createEmptyDocument()
    doc = addLayer(doc, createRasterLayer({ name: 'Outside', pixels: outside }))
    const group = createGroupLayer({ name: 'PassThrough' })
    doc = addLayer(doc, group)
    doc = addLayer(doc, createRasterLayer({ name: 'Inside', pixels: inside }), {
      parentId: group.id,
    })
    doc = addLayer(doc, createAdjustmentLayer({ name: 'Adj', adjustment: LEVELS }), {
      parentId: group.id,
    })

    const view = toRenderDocumentView(doc, rasterAssets([inside, outside]))

    expect(view.layers).toHaveLength(1)
    const node = view.layers[0]
    if (node?.kind === 'adjustment') {
      // Both the group's own child and the layer below the group.
      expect(node.children).toHaveLength(2)
    }
  })

  test('a clipped adjustment layer is scoped to the clipping group base', () => {
    const baseRef = asRasterAssetRef('base')
    const belowRef = asRasterAssetRef('below')
    let doc = createEmptyDocument()
    doc = addLayer(doc, createRasterLayer({ name: 'Below', pixels: belowRef }))
    const base = createRasterLayer({ name: 'Base', pixels: baseRef, opacity: 0.5 })
    doc = addLayer(doc, base)
    const adjustment = createAdjustmentLayer({
      name: 'Adj',
      adjustment: LEVELS,
      clipping: true,
    })
    doc = addLayer(doc, adjustment)

    const view = toRenderDocumentView(doc, rasterAssets([baseRef, belowRef]))

    expect(view.layers.map((l) => l.kind)).toEqual(['raster', 'group'])
    const clipGroup = view.layers[1]
    if (clipGroup?.kind === 'group') {
      // Base compositing is hoisted onto the clip group, as for any clip run.
      expect(clipGroup.opacity).toBe(0.5)
      expect(clipGroup.clipBaseCount).toBe(1)
      expect(clipGroup.children).toHaveLength(1)
      const node = clipGroup.children[0]
      expect(node?.kind).toBe('adjustment')
      if (node?.kind === 'adjustment') {
        expect(node.children.map((c) => c.id)).toEqual([base.id])
      }
    }
  })

  test('clipping onto an adjustment layer renders the run unclipped', () => {
    const belowRef = asRasterAssetRef('below')
    const clipRef = asRasterAssetRef('clip')
    let doc = createEmptyDocument()
    doc = addLayer(doc, createRasterLayer({ name: 'Below', pixels: belowRef }))
    doc = addLayer(doc, createAdjustmentLayer({ name: 'Adj', adjustment: LEVELS }))
    doc = addLayer(
      doc,
      createRasterLayer({ name: 'Clipped', pixels: clipRef, clipping: true }),
    )

    const view = toRenderDocumentView(doc, rasterAssets([belowRef, clipRef]))

    expect(view.layers.map((l) => l.kind)).toEqual(['adjustment', 'raster'])
  })

  test('includes enabled layer masks and omits disabled ones', () => {
    const px = asRasterAssetRef('px')
    const mask = asRasterMaskRef('mask')
    let doc = createEmptyDocument({ width: 8, height: 8 })
    const layer = createRasterLayer({ name: 'Masked', pixels: px })
    doc = addLayer(doc, layer)
    doc = setMask(doc, layer.id, mask)

    const assets = assetsFrom([
      { assetId: px, width: 8, height: 8, bitmap: fakeBitmap(8, 8) },
      { assetId: mask, width: 8, height: 8, bitmap: fakeBitmap(8, 8) },
    ])

    let view = toRenderDocumentView(doc, assets)
    expect(view.layers[0]?.mask?.width).toBe(8)

    doc = setMaskEnabled(doc, layer.id, false)
    view = toRenderDocumentView(doc, assets)
    expect(view.layers[0]?.mask).toBeUndefined()
  })
})
