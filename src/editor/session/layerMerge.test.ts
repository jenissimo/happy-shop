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
  clearRasterSurfaceStore,
  getEditableSurface,
  getRasterSurface,
} from '../../imaging'
import { TiledRasterSurface } from '../../imaging/surfaces/TiledRasterSurface'
import { setEditableSurface } from '../../imaging/surfaces/EditableSurfaceStore'
import { documentHistory, resetDocumentHistory } from './documentHistory'
import { useEditorSessionStore } from './EditorSessionStore'
import {
  canMergeDown,
  canMergeVisible,
  mergeDownSelected,
  mergeVisibleLayers,
  registerLayerMergeCommands,
} from './layerMerge'

function solidRgba(
  w: number,
  h: number,
  rgba: [number, number, number, number],
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = rgba[0]
    out[i * 4 + 1] = rgba[1]
    out[i * 4 + 2] = rgba[2]
    out[i * 4 + 3] = rgba[3]
  }
  return out
}

function setupTwoRasters(): {
  bottom: ReturnType<typeof createRasterLayer>
  top: ReturnType<typeof createRasterLayer>
} {
  const bottom = createRasterLayer({
    name: 'Bottom',
    pixels: asRasterAssetRef('px-bottom'),
  })
  const top = createRasterLayer({
    name: 'Top',
    pixels: asRasterAssetRef('px-top'),
  })
  const a = new TiledRasterSurface('px-bottom', 16, 16)
  const b = new TiledRasterSurface('px-top', 16, 16)
  a.writeRegion(
    { x: 0, y: 0, width: 8, height: 8 },
    solidRgba(8, 8, [255, 0, 0, 255]),
  )
  b.writeRegion(
    { x: 0, y: 0, width: 8, height: 8 },
    solidRgba(8, 8, [0, 0, 255, 128]),
  )
  setEditableSurface(a)
  setEditableSurface(b)
  let doc = addLayer(createEmptyDocument({ width: 32, height: 32 }), bottom)
  doc = addLayer(doc, top)
  useEditorSessionStore.setState({
    document: doc,
    selectedLayerIds: [top.id],
    dirty: false,
    historyVersion: documentHistory.version,
    rasterEpoch: 0,
  })
  return { bottom, top }
}

describe('layerMerge', () => {
  beforeEach(() => {
    clearRasterSurfaceStore()
    clearEditableSurfaces()
    resetDocumentHistory()
    useEditorSessionStore.setState({
      document: createEmptyDocument({ width: 32, height: 32 }),
      dirty: false,
      selectedLayerIds: [],
      historyVersion: documentHistory.version,
      rasterEpoch: 0,
    })
  })

  test('mergeDown composites active into sibling below and removes above', async () => {
    const { bottom, top } = setupTwoRasters()
    expect(canMergeDown()).toBe(true)
    expect(await mergeDownSelected()).toBe(true)

    const state = useEditorSessionStore.getState()
    expect(state.document.layers[top.id]).toBeUndefined()
    expect(state.selectedLayerIds).toEqual([bottom.id])
    const merged = state.document.layers[bottom.id]
    expect(merged?.type).toBe('raster')
    if (merged?.type !== 'raster') return
    expect(getRasterSurface(merged.pixels)).toBeTruthy()
    expect(getEditableSurface(String(merged.pixels))).toBeTruthy()
    expect(documentHistory.undoLabel).toBe('Merge Down')
  })

  test('mergeDown undo restores both layers', async () => {
    const { bottom, top } = setupTwoRasters()
    expect(await mergeDownSelected()).toBe(true)
    expect(useEditorSessionStore.getState().document.layers[top.id]).toBeUndefined()

    await documentHistory.undo()
    const after = useEditorSessionStore.getState().document
    expect(after.layers[top.id]).toBeTruthy()
    expect(after.layers[bottom.id]).toBeTruthy()
    expect(after.rootChildren).toEqual(
      expect.arrayContaining([bottom.id, top.id]),
    )
  })

  test('mergeDown disabled for bottommost layer', () => {
    const { bottom } = setupTwoRasters()
    useEditorSessionStore.setState({ selectedLayerIds: [bottom.id] })
    expect(canMergeDown()).toBe(false)
  })

  test('mergeVisible flattens visible rasters into bottommost', async () => {
    const { bottom, top } = setupTwoRasters()
    const hidden = createRasterLayer({
      name: 'Hidden',
      pixels: asRasterAssetRef('px-hidden'),
      visible: false,
    })
    const h = new TiledRasterSurface('px-hidden', 8, 8)
    h.writeRegion(
      { x: 0, y: 0, width: 8, height: 8 },
      solidRgba(8, 8, [0, 255, 0, 255]),
    )
    setEditableSurface(h)
    const doc = addLayer(useEditorSessionStore.getState().document, hidden)
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [top.id],
    })

    expect(canMergeVisible()).toBe(true)
    expect(await mergeVisibleLayers()).toBe(true)

    const state = useEditorSessionStore.getState()
    expect(state.document.layers[top.id]).toBeUndefined()
    expect(state.document.layers[hidden.id]).toBeTruthy()
    expect(state.document.layers[bottom.id]?.type).toBe('raster')
    expect(state.selectedLayerIds).toEqual([bottom.id])
    expect(documentHistory.undoLabel).toBe('Merge Visible')
  })

  test('registers Mod+E and Mod+Shift+E (PS Win Merge Visible)', () => {
    const registry = new CommandRegistry()
    registerLayerMergeCommands(registry)
    expect(registry.get('layer.mergeDown')?.shortcut).toBe('Mod+E')
    expect(registry.get('layer.mergeVisible')?.shortcut).toBe('Mod+Shift+E')
  })
})
