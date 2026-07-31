import { beforeEach, describe, expect, test } from 'bun:test'
import { CommandRegistry } from '../../core/commands/registry'
import {
  addLayer,
  asRasterAssetRef,
  createEmptyDocument,
  createGroupLayer,
  createRasterLayer,
  createShapeLayer,
} from '../../core/document'
import {
  clearRasterSurfaceStore,
  getRasterSurface,
  registerRasterSurface,
} from '../../imaging'
import { documentHistory, resetDocumentHistory } from './documentHistory'
import {
  addLayerMaskHideAll,
  addLayerMaskRevealAll,
  bringSelectedForward,
  bringSelectedToFront,
  createNewGroupLayer,
  createNewRasterLayer,
  deleteLayerMask,
  deleteSelectedLayers,
  duplicateSelectedLayer,
  duplicateLayersForMove,
  groupSelectedLayers,
  registerLayerCommands,
  sendSelectedBackward,
  sendSelectedToBack,
  toggleLayerMaskEnabled,
  toggleSelectedGroupIsolation,
  ungroupSelectedLayers,
} from './layerCommands'
import { useEditorSessionStore } from './EditorSessionStore'

describe('layerCommands', () => {
  beforeEach(() => {
    clearRasterSurfaceStore()
    resetDocumentHistory()
    useEditorSessionStore.setState({
      document: createEmptyDocument({ width: 64, height: 48 }),
      dirty: false,
      selectedLayerIds: [],
      historyVersion: documentHistory.version,
      rasterEpoch: 0,
    })
  })

  test('createNewRasterLayer adds a transparent raster and selects it', async () => {
    const id = await createNewRasterLayer()
    expect(id).toBeTruthy()
    const state = useEditorSessionStore.getState()
    expect(state.selectedLayerIds).toEqual([id!])
    const layer = state.document.layers[id!]
    expect(layer?.type).toBe('raster')
    expect(layer?.name).toBe('Layer')
    if (layer?.type === 'raster') {
      expect(getRasterSurface(layer.pixels)).toBeTruthy()
    }
    expect(state.dirty).toBe(true)
  })

  test('createNewRasterLayer inserts above the selection', async () => {
    const base = createRasterLayer({
      name: 'Base',
      pixels: asRasterAssetRef('a1'),
    })
    const doc = addLayer(createEmptyDocument(), base)
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [base.id],
    })
    const id = await createNewRasterLayer()
    expect(id).toBeTruthy()
    const after = useEditorSessionStore.getState()
    expect(after.document.layers[id!]?.type).toBe('raster')
    expect(after.document.rootChildren).toEqual(
      expect.arrayContaining([base.id, id!]),
    )
    expect(after.selectedLayerIds).toEqual([id!])
  })

  test('createNewGroupLayer inserts an empty group above the selection', () => {
    const layer = createRasterLayer({
      name: 'Base',
      pixels: asRasterAssetRef('a1'),
    })
    const doc = addLayer(createEmptyDocument(), layer)
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [layer.id],
    })
    const groupId = createNewGroupLayer()
    expect(groupId).toBeTruthy()
    const after = useEditorSessionStore.getState()
    expect(after.selectedLayerIds).toEqual([groupId!])
    expect(after.document.layers[groupId!]?.type).toBe('group')
    expect(after.document.layers[groupId!]?.name).toBe('Group')
    expect(after.document.rootChildren).toEqual(
      expect.arrayContaining([layer.id, groupId!]),
    )
    // Empty folder only — the document's blank initial raster and `Base` are
    // retained, but no raster is added by the group command.
    const group = after.document.layers[groupId!]
    expect(group?.type).toBe('group')
    if (group?.type === 'group') expect(group.children).toEqual([])
    expect(
      Object.values(after.document.layers).filter((l) => l.type === 'raster'),
    ).toHaveLength(2)
  })

  test('registerLayerCommands: layer.new → raster, layer.newGroup → group', async () => {
    const registry = new CommandRegistry()
    registerLayerCommands(registry)

    expect(registry.run('layer.new')).toBe(true)
    // Async raster path — wait a tick for the bitmap + store update.
    await new Promise((r) => setTimeout(r, 0))
    let state = useEditorSessionStore.getState()
    expect(state.selectedLayerIds).toHaveLength(1)
    const rasterId = state.selectedLayerIds[0]!
    expect(state.document.layers[rasterId]?.type).toBe('raster')

    expect(registry.run('layer.newGroup')).toBe(true)
    state = useEditorSessionStore.getState()
    const groupId = state.selectedLayerIds[0]!
    expect(groupId).not.toBe(rasterId)
    expect(state.document.layers[groupId]?.type).toBe('group')
    expect(state.document.rootChildren).toEqual(
      expect.arrayContaining([rasterId, groupId]),
    )
  })

  test('duplicateSelectedLayer clones shape metadata with a new id', async () => {
    const shape = createShapeLayer({ name: 'Box', primitive: 'rect' })
    const doc = addLayer(createEmptyDocument(), shape)
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [shape.id],
    })
    expect(await duplicateSelectedLayer()).toBe(true)
    const after = useEditorSessionStore.getState()
    expect(after.selectedLayerIds).toHaveLength(1)
    const copyId = after.selectedLayerIds[0]!
    expect(copyId).not.toBe(shape.id)
    const copy = after.document.layers[copyId]
    expect(copy?.type).toBe('shape')
    expect(copy?.name).toBe('Box copy')
  })

  test('duplicateLayersForMove clones multiple layers in paint order', async () => {
    const a = createShapeLayer({ name: 'A', primitive: 'rect' })
    const b = createShapeLayer({ name: 'B', primitive: 'rect' })
    let doc = addLayer(createEmptyDocument(), a)
    doc = addLayer(doc, b)
    useEditorSessionStore.setState({ document: doc, selectedLayerIds: [a.id, b.id] })

    const copyIds = await duplicateLayersForMove([a.id, b.id])
    expect(copyIds).toHaveLength(2)
    const after = useEditorSessionStore.getState()
    expect(after.selectedLayerIds).toEqual(copyIds)
    const children = after.document.rootChildren
    expect(children[children.indexOf(a.id) + 1]).toBe(copyIds[0])
    expect(children[children.indexOf(b.id) + 1]).toBe(copyIds[1])
    expect(documentHistory.undoLabel).toBe('Duplicate Layer')
  })

  test('duplicateSelectedLayer clones raster asset bytes into a new surface', async () => {
    const layer = createRasterLayer({
      name: 'Paint',
      pixels: asRasterAssetRef('src-pixels'),
    })
    registerRasterSurface({
      assetId: 'src-pixels',
      width: 8,
      height: 8,
      bitmap: { width: 8, height: 8, close() {} } as ImageBitmap,
    })
    const doc = addLayer(createEmptyDocument(), layer)
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [layer.id],
    })

    expect(await duplicateSelectedLayer()).toBe(true)
    const after = useEditorSessionStore.getState()
    const copyId = after.selectedLayerIds[0]!
    const copy = after.document.layers[copyId]
    expect(copy?.type).toBe('raster')
    if (copy?.type !== 'raster') return
    expect(copy.pixels).not.toBe(layer.pixels)
    expect(getRasterSurface(copy.pixels)).toBeTruthy()
    expect(getRasterSurface(layer.pixels)).toBeTruthy()
  })

  test('deleteSelectedLayers removes a layer but retains an active neighbor', () => {
    const layer = createRasterLayer({
      name: 'Gone',
      pixels: asRasterAssetRef('a1'),
    })
    registerRasterSurface({
      assetId: 'a1',
      width: 8,
      height: 8,
      bitmap: { width: 8, height: 8, close() {} } as ImageBitmap,
    })
    const doc = addLayer(createEmptyDocument(), layer)
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [layer.id],
    })
    expect(deleteSelectedLayers()).toBe(true)
    const after = useEditorSessionStore.getState()
    expect(after.document.layers[layer.id]).toBeUndefined()
    expect(after.selectedLayerIds).toHaveLength(1)
    expect(after.document.layers[after.selectedLayerIds[0]!]).toBeTruthy()
  })

  test('deleteSelectedLayers cannot remove the final layer', () => {
    const doc = createEmptyDocument()
    const onlyLayerId = doc.rootChildren[0]!
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [onlyLayerId],
    })

    expect(deleteSelectedLayers()).toBe(false)
    const after = useEditorSessionStore.getState()
    expect(Object.keys(after.document.layers)).toHaveLength(1)
    expect(after.selectedLayerIds).toEqual([onlyLayerId])
  })

  test('deleteSelectedLayers selects the layer below and undo/redo keep a valid target', async () => {
    const bottom = createRasterLayer({
      name: 'Bottom',
      pixels: asRasterAssetRef('bottom'),
    })
    const active = createRasterLayer({
      name: 'Active',
      pixels: asRasterAssetRef('active'),
    })
    let doc = addLayer(createEmptyDocument(), bottom)
    doc = addLayer(doc, active)
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [active.id],
    })

    expect(deleteSelectedLayers()).toBe(true)
    expect(useEditorSessionStore.getState().selectedLayerIds).toEqual([bottom.id])

    await useEditorSessionStore.getState().undo()
    let state = useEditorSessionStore.getState()
    expect(state.document.layers[state.selectedLayerIds[0]!]).toBeTruthy()

    await useEditorSessionStore.getState().redo()
    state = useEditorSessionStore.getState()
    expect(state.selectedLayerIds).toEqual([bottom.id])
    expect(state.document.layers[state.selectedLayerIds[0]!]).toBeTruthy()
  })

  test('arrange commands reorder within the sibling stack', () => {
    const a = createRasterLayer({ name: 'A', pixels: asRasterAssetRef('a') })
    const b = createRasterLayer({ name: 'B', pixels: asRasterAssetRef('b') })
    const c = createRasterLayer({ name: 'C', pixels: asRasterAssetRef('c') })
    let doc = addLayer(createEmptyDocument(), a)
    doc = addLayer(doc, b)
    doc = addLayer(doc, c)
    // rootChildren bottom→top: [a, b, c]
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [a.id],
    })

    expect(bringSelectedToFront()).toBe(true)
    expect(useEditorSessionStore.getState().document.rootChildren.slice(-3)).toEqual([
      b.id,
      c.id,
      a.id,
    ])

    useEditorSessionStore.setState({ selectedLayerIds: [c.id] })
    expect(sendSelectedToBack()).toBe(true)
    expect(useEditorSessionStore.getState().document.rootChildren).toEqual(
      expect.arrayContaining([a.id, b.id, c.id]),
    )

    useEditorSessionStore.setState({ selectedLayerIds: [c.id] })
    expect(bringSelectedForward()).toBe(true)
    expect(useEditorSessionStore.getState().document.rootChildren).toEqual(
      expect.arrayContaining([a.id, b.id, c.id]),
    )

    useEditorSessionStore.setState({ selectedLayerIds: [a.id] })
    expect(sendSelectedBackward()).toBe(true)
    expect(useEditorSessionStore.getState().document.rootChildren).toEqual(
      expect.arrayContaining([a.id, b.id, c.id]),
    )
  })

  test('arrange is a no-op at stack edges', () => {
    const a = createRasterLayer({ name: 'A', pixels: asRasterAssetRef('a') })
    const b = createRasterLayer({ name: 'B', pixels: asRasterAssetRef('b') })
    let doc = addLayer(createEmptyDocument(), a)
    doc = addLayer(doc, b)
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [b.id],
    })
    expect(bringSelectedToFront()).toBe(false)
    expect(bringSelectedForward()).toBe(false)

    useEditorSessionStore.setState({
      selectedLayerIds: [useEditorSessionStore.getState().document.rootChildren[0]!],
    })
    expect(sendSelectedToBack()).toBe(false)
    expect(sendSelectedBackward()).toBe(false)
  })

  test('groupSelectedLayers / ungroupSelectedLayers round-trip', () => {
    const a = createRasterLayer({ name: 'A', pixels: asRasterAssetRef('a') })
    const b = createRasterLayer({ name: 'B', pixels: asRasterAssetRef('b') })
    let doc = addLayer(createEmptyDocument(), a)
    doc = addLayer(doc, b)
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [a.id, b.id],
    })

    const groupId = groupSelectedLayers()
    expect(groupId).toBeTruthy()
    let state = useEditorSessionStore.getState()
    expect(state.document.rootChildren).toContain(groupId!)
    const group = state.document.layers[groupId!]
    expect(group?.type).toBe('group')
    if (group?.type === 'group') {
      expect(group.children).toEqual([a.id, b.id])
    }
    expect(state.selectedLayerIds).toEqual([groupId!])

    expect(ungroupSelectedLayers()).toBe(true)
    state = useEditorSessionStore.getState()
    expect(state.document.layers[groupId!]).toBeUndefined()
    expect(state.document.rootChildren).toEqual(
      expect.arrayContaining([a.id, b.id]),
    )
    expect(state.selectedLayerIds).toEqual([a.id, b.id])
  })

  test('reveal / hide / disable / delete layer mask', async () => {
    const layer = createRasterLayer({
      name: 'Paint',
      pixels: asRasterAssetRef('px'),
    })
    registerRasterSurface({
      assetId: 'px',
      width: 8,
      height: 8,
      bitmap: { width: 8, height: 8, close() {} } as ImageBitmap,
    })
    const doc = addLayer(createEmptyDocument({ width: 16, height: 12 }), layer)
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [layer.id],
    })

    expect(await addLayerMaskRevealAll()).toBe(true)
    let state = useEditorSessionStore.getState()
    expect(state.document.layers[layer.id]?.mask).toBeTruthy()
    expect(state.document.layers[layer.id]?.maskEnabled).toBe(true)

    expect(await addLayerMaskHideAll()).toBe(false)

    expect(toggleLayerMaskEnabled()).toBe(true)
    state = useEditorSessionStore.getState()
    expect(state.document.layers[layer.id]?.maskEnabled).toBe(false)

    expect(deleteLayerMask()).toBe(true)
    state = useEditorSessionStore.getState()
    expect(state.document.layers[layer.id]?.mask).toBeUndefined()

    expect(await addLayerMaskHideAll()).toBe(true)
    state = useEditorSessionStore.getState()
    expect(state.document.layers[layer.id]?.mask).toBeTruthy()
  })

  test('toggleSelectedGroupIsolation flips isolated and records history', () => {
    const group = createGroupLayer({ name: 'Folder' })
    const doc = addLayer(createEmptyDocument({ width: 64, height: 48 }), group)
    useEditorSessionStore.setState({
      document: doc,
      selectedLayerIds: [group.id],
    })

    expect(toggleSelectedGroupIsolation()).toBe(true)
    let state = useEditorSessionStore.getState()
    expect(state.document.layers[group.id]?.isolated).toBe(true)
    expect(documentHistory.canUndo).toBe(true)

    expect(toggleSelectedGroupIsolation()).toBe(true)
    state = useEditorSessionStore.getState()
    expect(state.document.layers[group.id]?.isolated).toBe(false)
  })

  test('registerLayerCommands wires group / ungroup / mask shortcuts', () => {
    const registry = new CommandRegistry()
    registerLayerCommands(registry)
    expect(registry.get('layer.group')?.shortcut).toBe('Mod+G')
    expect(registry.get('layer.ungroup')?.shortcut).toBe('Mod+Shift+G')
    expect(registry.get('layer.group.toggleIsolated')?.title).toBe('Isolate Group')
    expect(registry.get('layer.mask.add')?.title).toBe('Reveal All')
    expect(registry.get('layer.mask.hideAll')?.title).toBe('Hide All')
    expect(registry.get('layer.mask.delete')).toBeDefined()
  })
})
