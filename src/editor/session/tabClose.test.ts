import { beforeEach, describe, expect, test } from 'bun:test'
import { createEmptyDocument } from '../../core/document'
import {
  ensureInitialDocumentTab,
  useDocumentTabManager,
} from './DocumentTabManager'
import { resetDocumentHistory } from './documentHistory'
import { useEditorSessionStore } from './EditorSessionStore'
import {
  requestCloseOtherTabs,
  requestCloseSavedTabs,
  requestCloseTab,
} from './tabClose'

describe('tabClose helpers', () => {
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

  test('requestCloseTab closes a clean tab', () => {
    ensureInitialDocumentTab()
    const second = useDocumentTabManager
      .getState()
      .openDocument(createEmptyDocument({ name: 'Second' }))
    expect(requestCloseTab(second)).toBe(true)
    expect(useDocumentTabManager.getState().tabs).toHaveLength(1)
    expect(useDocumentTabManager.getState().tabs[0]?.document.name).toBe('Untitled')
  })

  test('requestCloseOtherTabs leaves the keep tab', () => {
    ensureInitialDocumentTab()
    const keep = useDocumentTabManager
      .getState()
      .openDocument(createEmptyDocument({ name: 'Keep' }))
    useDocumentTabManager
      .getState()
      .openDocument(createEmptyDocument({ name: 'Other' }))
    requestCloseOtherTabs(keep)
    const tabs = useDocumentTabManager.getState().tabs
    expect(tabs).toHaveLength(1)
    expect(tabs[0]?.id).toBe(keep)
  })

  test('requestCloseSavedTabs keeps dirty tabs', () => {
    ensureInitialDocumentTab()
    const dirtyId = useDocumentTabManager
      .getState()
      .openDocument(createEmptyDocument({ name: 'Dirty' }))
    useDocumentTabManager
      .getState()
      .openDocument(createEmptyDocument({ name: 'Clean' }))
    // Mark after further openDocument calls — those syncActiveFromSession and
    // would otherwise overwrite a dirty flag set on the previously active tab.
    useDocumentTabManager.setState((s) => ({
      tabs: s.tabs.map((t) => (t.id === dirtyId ? { ...t, dirty: true } : t)),
    }))
    requestCloseSavedTabs()
    const tabs = useDocumentTabManager.getState().tabs
    expect(tabs).toHaveLength(1)
    expect(tabs[0]?.id).toBe(dirtyId)
    expect(tabs[0]?.dirty).toBe(true)
  })
})
