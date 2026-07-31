import { beforeEach, describe, expect, test } from 'bun:test'
import {
  addLayer,
  asRasterAssetRef,
  createEmptyDocument,
  createRasterLayer,
} from '../../core/document'
import { useEditorSessionStore } from './EditorSessionStore'
import { documentHistory, resetDocumentHistory } from './documentHistory'

describe('EditorSessionStore', () => {
  beforeEach(() => {
    resetDocumentHistory()
    useEditorSessionStore.setState({
      document: createEmptyDocument({ name: 'Untitled' }),
      selectedLayerIds: [],
      dirty: false,
      cameraPrefs: { fitOnLoad: true },
      project: { projectPath: null, revision: null },
      historyVersion: 0,
      rasterEpoch: 0,
      activeToolId: 'move',
    })
  })

  test('setDocument selects a valid layer and defaults dirty false', () => {
    const layer = createRasterLayer({ name: 'Background', pixels: asRasterAssetRef('px') })
    const doc = addLayer(createEmptyDocument({ name: 'Loaded' }), layer)
    useEditorSessionStore.getState().selectLayer('x' as never)
    useEditorSessionStore.getState().setDocument(doc)

    const state = useEditorSessionStore.getState()
    expect(state.document.name).toBe('Loaded')
    expect(state.selectedLayerIds).toEqual([layer.id])
    expect(state.dirty).toBe(false)
  })

  test('layer mutations mark dirty; markClean clears it', () => {
    const ref = asRasterAssetRef('px')
    let doc = createEmptyDocument({ name: 'Edit' })
    const layer = createRasterLayer({ name: 'Layer', pixels: ref })
    doc = addLayer(doc, layer)
    useEditorSessionStore.getState().setDocument(doc)

    useEditorSessionStore.getState().renameLayer(layer.id, 'Renamed')
    expect(useEditorSessionStore.getState().dirty).toBe(true)
    expect(useEditorSessionStore.getState().document.layers[layer.id]?.name).toBe(
      'Renamed',
    )

    useEditorSessionStore.getState().markClean()
    expect(useEditorSessionStore.getState().dirty).toBe(false)
  })

  test('selectLayer supports additive toggle', () => {
    const a = createRasterLayer({ name: 'A', pixels: asRasterAssetRef('a') })
    const b = createRasterLayer({ name: 'B', pixels: asRasterAssetRef('b') })
    let doc = addLayer(createEmptyDocument(), a)
    doc = addLayer(doc, b)
    useEditorSessionStore.getState().setDocument(doc)
    useEditorSessionStore.getState().selectLayer(a.id)
    useEditorSessionStore.getState().selectLayer(b.id, true)
    expect(useEditorSessionStore.getState().selectedLayerIds).toEqual([a.id, b.id])
    useEditorSessionStore.getState().selectLayer(a.id, true)
    expect(useEditorSessionStore.getState().selectedLayerIds).toEqual([b.id])
    useEditorSessionStore.getState().selectLayer(b.id, true)
    expect(useEditorSessionStore.getState().selectedLayerIds).toEqual([b.id])
  })

  test('clearSelection retains an active layer', () => {
    const doc = createEmptyDocument()
    const layerId = doc.rootChildren[0]!
    useEditorSessionStore.getState().setDocument(doc)

    useEditorSessionStore.getState().clearSelection()

    expect(useEditorSessionStore.getState().selectedLayerIds).toEqual([layerId])
  })

  test('setActiveToolId updates the tools strip selection', () => {
    useEditorSessionStore.getState().setActiveToolId('brush')
    expect(useEditorSessionStore.getState().activeToolId).toBe('brush')
  })

  test('renameLayer is undoable via session history', async () => {
    const ref = asRasterAssetRef('px')
    let doc = createEmptyDocument({ name: 'Edit' })
    const layer = createRasterLayer({ name: 'Layer', pixels: ref })
    doc = addLayer(doc, layer)
    useEditorSessionStore.getState().setDocument(doc)

    useEditorSessionStore.getState().renameLayer(layer.id, 'Renamed')
    expect(documentHistory.canUndo).toBe(true)

    await useEditorSessionStore.getState().undo()
    expect(useEditorSessionStore.getState().document.layers[layer.id]?.name).toBe(
      'Layer',
    )

    await useEditorSessionStore.getState().redo()
    expect(useEditorSessionStore.getState().document.layers[layer.id]?.name).toBe(
      'Renamed',
    )
  })
})
