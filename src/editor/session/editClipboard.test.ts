import { beforeEach, describe, expect, test } from 'bun:test'
import { CommandRegistry } from '../../core/commands/registry'
import {
  addLayer,
  asRasterAssetRef,
  createEmptyDocument,
  createRasterLayer,
} from '../../core/document'
import {
  clearEditableSurfaces,
  getEditableSurface,
  setEditableSurface,
} from '../../imaging/surfaces/EditableSurfaceStore'
import { clearRasterSurfaceStore } from '../../imaging'
import { TiledRasterSurface } from '../../imaging/surfaces/TiledRasterSurface'
import { documentHistory, resetDocumentHistory } from './documentHistory'
import {
  clearHappyClipboard,
  copyMerged,
  copySelection,
  cutSelection,
  getHappyClipboard,
  pasteClipboard,
  pasteClipboardInPlace,
  registerEditClipboardCommands,
} from './editClipboard'
import { useEditorSessionStore } from './EditorSessionStore'
import { useSelectionStore } from './selectionStore'

describe('editClipboard', () => {
  beforeEach(() => {
    clearEditableSurfaces()
    clearRasterSurfaceStore()
    clearHappyClipboard()
    resetDocumentHistory()
    useEditorSessionStore.setState({
      document: createEmptyDocument({ width: 32, height: 32 }),
      dirty: false,
      selectedLayerIds: [],
      historyVersion: documentHistory.version,
      rasterEpoch: 0,
    })
    useSelectionStore.setState({
      marquee: null,
      lastMarquee: null,
      mask: null,
      lastMask: null,
    })
  })

  function setupRasterLayer(fill: {
    x: number
    y: number
    w: number
    h: number
    color: [number, number, number, number]
  }) {
    const layer = createRasterLayer({
      name: 'L',
      pixels: asRasterAssetRef('px-clip'),
    })
    const surface = new TiledRasterSurface('px-clip', 32, 32)
    const rgba = new Uint8ClampedArray(fill.w * fill.h * 4)
    for (let i = 0; i < fill.w * fill.h; i++) {
      rgba[i * 4] = fill.color[0]
      rgba[i * 4 + 1] = fill.color[1]
      rgba[i * 4 + 2] = fill.color[2]
      rgba[i * 4 + 3] = fill.color[3]
    }
    surface.writeRegion({ x: fill.x, y: fill.y, width: fill.w, height: fill.h }, rgba)
    setEditableSurface(surface)
    const doc = addLayer(createEmptyDocument({ width: 32, height: 32 }), layer)
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [layer.id],
    })
    return layer
  }

  test('copy under selection stores HappyClipboard pixels', async () => {
    setupRasterLayer({
      x: 0,
      y: 0,
      w: 32,
      h: 32,
      color: [0, 255, 0, 255],
    })
    useSelectionStore.getState().setMarquee({
      x: 4,
      y: 4,
      width: 4,
      height: 4,
    })

    expect(await copySelection()).toBe(true)
    const clip = getHappyClipboard()
    expect(clip).not.toBeNull()
    expect(clip!.width).toBe(4)
    expect(clip!.height).toBe(4)
    expect(clip!.originX).toBe(4)
    expect(clip!.originY).toBe(4)
    expect(clip!.rgba![3]).toBe(255)
    expect(clip!.rgba![1]).toBe(255)
  })

  test('cut clears selection pixels and keeps clipboard', async () => {
    setupRasterLayer({
      x: 0,
      y: 0,
      w: 32,
      h: 32,
      color: [255, 0, 0, 255],
    })
    useSelectionStore.getState().setMarquee({
      x: 2,
      y: 2,
      width: 4,
      height: 4,
    })

    expect(await cutSelection()).toBe(true)
    expect(getHappyClipboard()?.width).toBe(4)
    const after = getEditableSurface('px-clip')!
    const img = after.toRgbaBuffer()
    expect(img.data[(3 * 32 + 3) * 4 + 3]).toBe(0)
    expect(img.data[(0 * 32 + 0) * 4 + 3]).toBe(255)
  })

  test('paste creates a new raster layer above active', async () => {
    const layer = setupRasterLayer({
      x: 0,
      y: 0,
      w: 8,
      h: 8,
      color: [10, 20, 30, 255],
    })
    useSelectionStore.getState().setMarquee({
      x: 0,
      y: 0,
      width: 8,
      height: 8,
    })
    expect(await copySelection()).toBe(true)

    const beforeCount = Object.keys(
      useEditorSessionStore.getState().document.layers,
    ).length
    expect(await pasteClipboard()).toBe(true)
    const session = useEditorSessionStore.getState()
    expect(Object.keys(session.document.layers).length).toBe(beforeCount + 1)
    const pastedId = session.selectedLayerIds[0]!
    expect(pastedId).not.toBe(layer.id)
    const pasted = session.document.layers[pastedId]!
    expect(pasted.type).toBe('raster')
    if (pasted.type === 'raster') {
      // Centered on 32×32 with 8×8 payload → (12, 12)
      expect(pasted.transform.x).toBe(12)
      expect(pasted.transform.y).toBe(12)
    }
    const siblings = session.document.rootChildren
    expect(siblings.indexOf(pastedId)).toBeGreaterThan(siblings.indexOf(layer.id))
  })

  test('paste in place uses copied origin', async () => {
    setupRasterLayer({
      x: 0,
      y: 0,
      w: 32,
      h: 32,
      color: [1, 2, 3, 255],
    })
    useSelectionStore.getState().setMarquee({
      x: 6,
      y: 10,
      width: 4,
      height: 4,
    })
    expect(await copySelection()).toBe(true)
    expect(await pasteClipboardInPlace()).toBe(true)
    const pastedId = useEditorSessionStore.getState().selectedLayerIds[0]!
    const pasted = useEditorSessionStore.getState().document.layers[pastedId]!
    expect(pasted.transform.x).toBe(6)
    expect(pasted.transform.y).toBe(10)
  })

  test('copyMerged composites visible rasters under selection', async () => {
    const bottom = createRasterLayer({
      name: 'Bottom',
      pixels: asRasterAssetRef('px-a'),
    })
    const top = createRasterLayer({
      name: 'Top',
      pixels: asRasterAssetRef('px-b'),
      transform: { x: 0, y: 0 },
    })
    const a = new TiledRasterSurface('px-a', 32, 32)
    const b = new TiledRasterSurface('px-b', 32, 32)
    const red = new Uint8ClampedArray(4 * 4 * 4)
    const blue = new Uint8ClampedArray(4 * 4 * 4)
    for (let i = 0; i < 16; i++) {
      red[i * 4] = 255
      red[i * 4 + 3] = 255
      blue[i * 4 + 2] = 255
      blue[i * 4 + 3] = 128
    }
    a.writeRegion({ x: 0, y: 0, width: 4, height: 4 }, red)
    b.writeRegion({ x: 0, y: 0, width: 4, height: 4 }, blue)
    setEditableSurface(a)
    setEditableSurface(b)
    let doc = addLayer(createEmptyDocument({ width: 32, height: 32 }), bottom)
    doc = addLayer(doc, top)
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [top.id],
    })
    useSelectionStore.getState().setMarquee({
      x: 0,
      y: 0,
      width: 4,
      height: 4,
    })

    expect(await copyMerged()).toBe(true)
    const clip = getHappyClipboard()!
    // Semi-transparent blue over opaque red → blue channel elevated, red reduced.
    expect(clip.rgba![2]!).toBeGreaterThan(0)
    expect(clip.rgba![0]!).toBeGreaterThan(0)
  })

  test('registers Edit clipboard commands with shortcuts', () => {
    const registry = new CommandRegistry()
    registerEditClipboardCommands(registry)
    expect(registry.get('edit.copy')?.shortcut).toBe('Mod+C')
    expect(registry.get('edit.cut')?.shortcut).toBe('Mod+X')
    expect(registry.get('edit.copyMerged')?.shortcut).toBe('Mod+Shift+C')
    expect(registry.get('edit.paste')?.shortcut).toBe('Mod+V')
    expect(registry.get('edit.pasteInPlace')?.shortcut).toBe('Mod+Shift+V')
  })
})
