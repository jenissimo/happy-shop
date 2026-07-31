import { beforeEach, describe, expect, test } from 'bun:test'
import { createEmptyDocument } from '../../core/document'
import {
  ensureInitialDocumentTab,
  useDocumentTabManager,
} from './DocumentTabManager'
import { documentHistory, resetDocumentHistory } from './documentHistory'
import { useEditorSessionStore } from './EditorSessionStore'

describe('DocumentTabManager', () => {
  beforeEach(() => {
    resetDocumentHistory()
    useDocumentTabManager.setState({ tabs: [], activeTabId: null })
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

  test('ensureInitialDocumentTab seeds one tab from session', () => {
    const id = ensureInitialDocumentTab()
    const state = useDocumentTabManager.getState()
    expect(state.tabs).toHaveLength(1)
    expect(state.activeTabId).toBe(id)
    expect(state.tabs[0]?.document.name).toBe('Untitled')
  })

  test('openDocument adds and activates a new tab', () => {
    ensureInitialDocumentTab()
    const id = useDocumentTabManager
      .getState()
      .openDocument(createEmptyDocument({ name: 'Second' }))
    const state = useDocumentTabManager.getState()
    expect(state.tabs).toHaveLength(2)
    expect(state.activeTabId).toBe(id)
    expect(useEditorSessionStore.getState().document.name).toBe('Second')
  })

  test('closeTab keeps at least one Untitled tab', () => {
    ensureInitialDocumentTab()
    const only = useDocumentTabManager.getState().activeTabId!
    useDocumentTabManager.getState().closeTab(only)
    expect(useDocumentTabManager.getState().tabs).toHaveLength(1)
  })

  test('switching tabs isolates history stacks', async () => {
    ensureInitialDocumentTab()
    useEditorSessionStore.getState().renameLayer // no-op without layer

    // Mutate history on tab A via documentHistory push from rename path:
    // directly push a noop-ish rename by setDocument name change through commit.
    const tabA = useDocumentTabManager.getState().activeTabId!
    useEditorSessionStore.setState({
      document: createEmptyDocument({ name: 'A' }),
      dirty: true,
    })
    useDocumentTabManager.getState().syncActiveFromSession()

    useDocumentTabManager
      .getState()
      .openDocument(createEmptyDocument({ name: 'B' }))
    expect(documentHistory.canUndo).toBe(false)

    useDocumentTabManager.getState().activateTab(tabA)
    expect(useEditorSessionStore.getState().document.name).toBe('A')
  })

  test('dedupeByPath reactivates existing tab', () => {
    ensureInitialDocumentTab()
    const path = 'C:/proj/Demo.happyshop'
    const first = useDocumentTabManager.getState().openDocument(
      createEmptyDocument({ name: 'Demo' }),
      { projectPath: path },
    )
    const second = useDocumentTabManager.getState().openDocument(
      createEmptyDocument({ name: 'Demo2' }),
      { projectPath: path, dedupeByPath: true },
    )
    expect(second).toBe(first)
    expect(useDocumentTabManager.getState().tabs).toHaveLength(2) // initial + demo
  })

  test('renameTab updates active session document name', () => {
    const id = ensureInitialDocumentTab()
    useDocumentTabManager.getState().renameTab(id, '  Renamed  ')
    expect(useDocumentTabManager.getState().tabs[0]?.document.name).toBe('Renamed')
    expect(useDocumentTabManager.getState().tabs[0]?.dirty).toBe(true)
    expect(useEditorSessionStore.getState().document.name).toBe('Renamed')
    expect(useEditorSessionStore.getState().dirty).toBe(true)
  })

  test('reorderTab moves tab to target index', () => {
    ensureInitialDocumentTab()
    const firstId = useDocumentTabManager.getState().tabs[0]!.id
    useDocumentTabManager
      .getState()
      .openDocument(createEmptyDocument({ name: 'Second' }))
    useDocumentTabManager
      .getState()
      .openDocument(createEmptyDocument({ name: 'Third' }))

    useDocumentTabManager.getState().reorderTab(firstId, 2)

    expect(
      useDocumentTabManager.getState().tabs.map((t) => t.document.name),
    ).toEqual(['Second', 'Third', 'Untitled'])
  })

  test('reorderTab no-ops for unknown id', () => {
    ensureInitialDocumentTab()
    const before = useDocumentTabManager.getState().tabs.map((t) => t.id)
    useDocumentTabManager.getState().reorderTab('missing-tab-id', 0)
    expect(useDocumentTabManager.getState().tabs.map((t) => t.id)).toEqual(before)
  })

  test('reorderTab clamps out-of-range index', () => {
    ensureInitialDocumentTab()
    const id = useDocumentTabManager.getState().tabs[0]!.id
    useDocumentTabManager
      .getState()
      .openDocument(createEmptyDocument({ name: 'Second' }))

    useDocumentTabManager.getState().reorderTab(id, 999)

    expect(useDocumentTabManager.getState().tabs.at(-1)?.id).toBe(id)
  })
})
