import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  addLayer,
  asRasterAssetRef,
  createEmptyDocument,
  createRasterLayer,
  renameLayer,
  setOpacity,
} from '../../core/document'
import {
  ensureInitialDocumentTab,
  useDocumentTabManager,
} from './DocumentTabManager'
import { documentHistory, resetDocumentHistory } from './documentHistory'
import { useEditorSessionStore } from './EditorSessionStore'
import {
  commitDocumentMutation,
  commitDocumentTransaction,
  setActiveTabSyncHandler,
} from './documentTransaction'

function seedSession() {
  const a = createRasterLayer({ name: 'A', pixels: asRasterAssetRef('a') })
  const b = createRasterLayer({ name: 'B', pixels: asRasterAssetRef('b') })
  let doc = addLayer(createEmptyDocument({ name: 'Doc' }), a)
  doc = addLayer(doc, b)
  useEditorSessionStore.setState({
    document: doc,
    selectedLayerIds: [a.id],
    dirty: false,
    cameraPrefs: { fitOnLoad: true },
    project: { projectPath: null, revision: null },
    historyVersion: 0,
    rasterEpoch: 0,
    activeToolId: 'move',
  })
  return { doc, a, b }
}

describe('documentTransaction', () => {
  beforeEach(() => {
    resetDocumentHistory()
    setActiveTabSyncHandler(null)
    useDocumentTabManager.setState({ tabs: [], activeTabId: null })
    seedSession()
  })

  afterEach(() => {
    setActiveTabSyncHandler(null)
  })

  test('no-op when before === after', () => {
    const before = useEditorSessionStore.getState().document
    const committed = commitDocumentMutation('Rename Layer', (doc) => doc)

    expect(committed).toBe(false)
    expect(documentHistory.undoCount).toBe(0)
    expect(useEditorSessionStore.getState().dirty).toBe(false)
    expect(useEditorSessionStore.getState().document).toBe(before)
  })

  test('commits the mutation, marks dirty and mirrors historyVersion', () => {
    const { a } = seedSession()
    const committed = commitDocumentMutation('Rename Layer', (doc) =>
      renameLayer(doc, a.id, 'Renamed'),
    )

    const state = useEditorSessionStore.getState()
    expect(committed).toBe(true)
    expect(state.document.layers[a.id]?.name).toBe('Renamed')
    expect(state.dirty).toBe(true)
    expect(state.historyVersion).toBe(documentHistory.version)
    expect(documentHistory.undoCount).toBe(1)
  })

  test('mergeKey coalesces consecutive entries into one undo step', () => {
    const { a } = seedSession()
    commitDocumentMutation('Opacity', (doc) => setOpacity(doc, a.id, 0.5), {
      mergeKey: `opacity:${a.id}`,
    })
    commitDocumentMutation('Opacity', (doc) => setOpacity(doc, a.id, 0.25), {
      mergeKey: `opacity:${a.id}`,
    })

    expect(documentHistory.undoCount).toBe(1)
    expect(useEditorSessionStore.getState().document.layers[a.id]?.opacity).toBe(
      0.25,
    )
  })

  test('different mergeKeys stay separate history steps', () => {
    const { a, b } = seedSession()
    commitDocumentMutation('Opacity', (doc) => setOpacity(doc, a.id, 0.5), {
      mergeKey: `opacity:${a.id}`,
    })
    commitDocumentMutation('Opacity', (doc) => setOpacity(doc, b.id, 0.5), {
      mergeKey: `opacity:${b.id}`,
    })

    expect(documentHistory.undoCount).toBe(2)
  })

  test('mergeWindowMs beyond the window keeps entries separate', async () => {
    const { a } = seedSession()
    commitDocumentMutation('Opacity', (doc) => setOpacity(doc, a.id, 0.5), {
      mergeKey: `opacity:${a.id}`,
      mergeWindowMs: 0,
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
    commitDocumentMutation('Opacity', (doc) => setOpacity(doc, a.id, 0.25), {
      mergeKey: `opacity:${a.id}`,
      mergeWindowMs: 0,
    })

    expect(documentHistory.undoCount).toBe(2)
  })

  test('explicit selectedLayerIds override the carried-forward selection', () => {
    const { doc, a } = seedSession()
    const added = createRasterLayer({ name: 'C', pixels: asRasterAssetRef('c') })

    commitDocumentTransaction({
      label: 'New Layer',
      before: doc,
      after: addLayer(doc, added),
      selectedLayerIds: [added.id],
    })

    expect(useEditorSessionStore.getState().selectedLayerIds).toEqual([added.id])
    expect(useEditorSessionStore.getState().selectedLayerIds).not.toContain(a.id)
  })

  test('explicit selection is normalized against the resulting document', () => {
    const { doc } = seedSession()
    const ghost = createRasterLayer({ name: 'Ghost', pixels: asRasterAssetRef('g') })

    commitDocumentTransaction({
      label: 'Rename Doc',
      before: doc,
      after: { ...doc, name: 'Renamed' },
      // Ids the mutation never introduced must not leak into the selection.
      selectedLayerIds: [ghost.id],
    })

    expect(useEditorSessionStore.getState().selectedLayerIds).not.toContain(
      ghost.id,
    )
  })

  test('undo restores the document and drops a dangling selection', async () => {
    const { doc } = seedSession()
    const added = createRasterLayer({ name: 'C', pixels: asRasterAssetRef('c') })
    commitDocumentTransaction({
      label: 'New Layer',
      before: doc,
      after: addLayer(doc, added),
      selectedLayerIds: [added.id],
    })
    expect(useEditorSessionStore.getState().selectedLayerIds).toEqual([added.id])

    await documentHistory.undo()

    const state = useEditorSessionStore.getState()
    expect(state.document.layers[added.id]).toBeUndefined()
    // The undo `apply` path must re-normalize, not leave the deleted id active.
    expect(state.selectedLayerIds).not.toContain(added.id)
    expect(state.selectedLayerIds.length).toBe(1)
  })

  test('syncs the tab mirror on commit', () => {
    ensureInitialDocumentTab()
    const { a } = seedSession()
    const tabId = useDocumentTabManager.getState().activeTabId!

    commitDocumentMutation('Rename Layer', (doc) =>
      renameLayer(doc, a.id, 'Mirrored'),
    )

    const tab = useDocumentTabManager.getState().tabs.find((t) => t.id === tabId)!
    expect(tab.document.layers[a.id]?.name).toBe('Mirrored')
    expect(tab.dirty).toBe(true)
  })

  test('syncs the tab mirror on undo', async () => {
    ensureInitialDocumentTab()
    const { a } = seedSession()
    const tabId = useDocumentTabManager.getState().activeTabId!

    commitDocumentMutation('Rename Layer', (doc) =>
      renameLayer(doc, a.id, 'Mirrored'),
    )
    // Bare history undo (no store wrapper) — the mirror must still catch up.
    await documentHistory.undo()

    const tab = useDocumentTabManager.getState().tabs.find((t) => t.id === tabId)!
    expect(tab.document.layers[a.id]?.name).toBe('A')
  })
})
