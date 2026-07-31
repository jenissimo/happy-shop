import { describe, expect, test } from 'bun:test'
import {
  addLayer,
  asRasterAssetRef,
  asRasterMaskRef,
  createEmptyDocument,
  createGroupLayer,
  createRasterLayer,
  setMask,
  setMaskEnabled,
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

  test('pass-through group with effects inlines children and omits group FX from the view', () => {
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
    expect(view.layers[0]?.kind).toBe('raster')
    expect(view.layers.some((l) => l.kind === 'group')).toBe(false)
    expect(view.layers[0]?.effects).toEqual([])
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
