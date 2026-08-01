import { create } from 'zustand'
import {
  createEmptyDocument,
  type HappyDocument,
  type LayerId,
} from '../../core/document'
import { TransactionalHistory } from '../../core/history'
import {
  DEFAULT_TOOL_ID,
  type EditorToolId,
} from '../toolbar/tools'
import {
  getActiveDocumentHistory,
  setActiveDocumentHistory,
} from './documentHistory'
import {
  normalizeLayerSelection,
  setActiveTabSyncHandler,
  useEditorSessionStore,
} from './EditorSessionStore'
import { rehydrateDocumentGoogleFonts } from '../tools/text/rehydrateDocumentGoogleFonts'

export type DocumentTabId = string

export type DocumentTab = {
  id: DocumentTabId
  document: HappyDocument
  dirty: boolean
  projectPath: string | null
  revision: string | null
  selectedLayerIds: LayerId[]
  activeToolId: EditorToolId
  history: TransactionalHistory
}

type DocumentTabManagerState = {
  tabs: DocumentTab[]
  activeTabId: DocumentTabId | null

  openDocument: (
    document: HappyDocument,
    options?: {
      projectPath?: string | null
      revision?: string | null
      activate?: boolean
      dedupeByPath?: boolean
    },
  ) => DocumentTabId
  closeTab: (id: DocumentTabId) => void
  activateTab: (id: DocumentTabId) => void
  renameTab: (id: DocumentTabId, name: string) => void
  reorderTab: (id: DocumentTabId, toIndex: number) => void
  nextTab: () => void
  prevTab: () => void
  syncActiveFromSession: () => void
  pushActiveToSession: () => void
}

function newTabId(): DocumentTabId {
  return crypto.randomUUID()
}

function createTab(
  document: HappyDocument,
  options?: {
    projectPath?: string | null
    revision?: string | null
    history?: TransactionalHistory
  },
): DocumentTab {
  return {
    id: newTabId(),
    document,
    dirty: false,
    projectPath: options?.projectPath ?? null,
    revision: options?.revision ?? null,
    selectedLayerIds: normalizeLayerSelection(document, []),
    activeToolId: DEFAULT_TOOL_ID,
    history: options?.history ?? new TransactionalHistory(),
  }
}

function ensureAtLeastOneTab(tabs: DocumentTab[]): DocumentTab[] {
  if (tabs.length > 0) return tabs
  return [createTab(createEmptyDocument({ name: 'Untitled' }))]
}

/**
 * Multi-document tab manager (SPECS/MULTI-DOC-AND-TOOLBAR.md).
 * Raster bytes stay in RasterSurfaceStore keyed by asset id — never in tabs.
 */
export const useDocumentTabManager = create<DocumentTabManagerState>(
  (set, get) => ({
    tabs: [],
    activeTabId: null,

    openDocument: (document, options) => {
      get().syncActiveFromSession()

      if (options?.dedupeByPath && options.projectPath) {
        const existing = get().tabs.find(
          (t) => t.projectPath === options.projectPath,
        )
        if (existing) {
          get().activateTab(existing.id)
          return existing.id
        }
      }

      const tab = createTab(document, {
        projectPath: options?.projectPath,
        revision: options?.revision,
      })
      const activate = options?.activate !== false
      set((state) => ({
        tabs: [...state.tabs, tab],
        activeTabId: activate ? tab.id : (state.activeTabId ?? tab.id),
      }))
      if (activate) get().pushActiveToSession()
      return tab.id
    },

    closeTab: (id) => {
      get().syncActiveFromSession()
      set((state) => {
        const idx = state.tabs.findIndex((t) => t.id === id)
        if (idx === -1) return state
        const nextTabs = ensureAtLeastOneTab(
          state.tabs.filter((t) => t.id !== id),
        )
        let activeTabId = state.activeTabId
        if (activeTabId === id) {
          const fallback = nextTabs[Math.min(idx, nextTabs.length - 1)]!
          activeTabId = fallback.id
        }
        return { tabs: nextTabs, activeTabId }
      })
      get().pushActiveToSession()
    },

    activateTab: (id) => {
      if (get().activeTabId === id) return
      get().syncActiveFromSession()
      if (!get().tabs.some((t) => t.id === id)) return
      set({ activeTabId: id })
      get().pushActiveToSession()
    },

    renameTab: (id, name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      get().syncActiveFromSession()
      if (!get().tabs.some((t) => t.id === id)) return
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === id
            ? {
                ...t,
                dirty: true,
                document: { ...t.document, name: trimmed },
              }
            : t,
        ),
      }))
      if (get().activeTabId === id) {
        const session = useEditorSessionStore.getState()
        useEditorSessionStore.setState({
          document: { ...session.document, name: trimmed },
          dirty: true,
        })
      }
    },

    /** Move a tab to `toIndex` (clamped); active tab id is unchanged. */
    reorderTab: (id, toIndex) => {
      set((state) => {
        const from = state.tabs.findIndex((t) => t.id === id)
        if (from === -1) return state
        const tabs = [...state.tabs]
        const [tab] = tabs.splice(from, 1)
        if (!tab) return state
        const clamped = Math.max(0, Math.min(toIndex, tabs.length))
        tabs.splice(clamped, 0, tab)
        return { tabs }
      })
    },

    nextTab: () => {
      const { tabs, activeTabId } = get()
      if (tabs.length < 2 || !activeTabId) return
      const idx = tabs.findIndex((t) => t.id === activeTabId)
      const next = tabs[(idx + 1) % tabs.length]
      if (next) get().activateTab(next.id)
    },

    prevTab: () => {
      const { tabs, activeTabId } = get()
      if (tabs.length < 2 || !activeTabId) return
      const idx = tabs.findIndex((t) => t.id === activeTabId)
      const prev = tabs[(idx - 1 + tabs.length) % tabs.length]
      if (prev) get().activateTab(prev.id)
    },

    syncActiveFromSession: () => {
      const { activeTabId, tabs } = get()
      if (!activeTabId) return
      const session = useEditorSessionStore.getState()
      set({
        tabs: tabs.map((t) =>
          t.id === activeTabId
            ? {
                ...t,
                document: session.document,
                dirty: session.dirty,
                projectPath: session.project.projectPath,
                revision: session.project.revision,
                selectedLayerIds: normalizeLayerSelection(
                  session.document,
                  session.selectedLayerIds,
                ),
                activeToolId: session.activeToolId,
                history: getActiveDocumentHistory(),
              }
            : t,
        ),
      })
    },

    pushActiveToSession: () => {
      const { activeTabId, tabs } = get()
      const tab = tabs.find((t) => t.id === activeTabId)
      if (!tab) return
      setActiveDocumentHistory(tab.history)
      useEditorSessionStore.setState({
        document: tab.document,
        dirty: tab.dirty,
        selectedLayerIds: normalizeLayerSelection(
          tab.document,
          tab.selectedLayerIds,
        ),
        activeToolId: tab.activeToolId,
        project: {
          projectPath: tab.projectPath,
          revision: tab.revision,
        },
        historyVersion: tab.history.version,
      })
      void rehydrateDocumentGoogleFonts(tab.document)
    },
  }),
)

/** Bootstrap: one tab mirrors the current session (keeps existing history). */
export function ensureInitialDocumentTab(): DocumentTabId {
  setActiveTabSyncHandler(() => {
    useDocumentTabManager.getState().syncActiveFromSession()
  })

  const mgr = useDocumentTabManager.getState()
  if (mgr.tabs.length > 0 && mgr.activeTabId) return mgr.activeTabId

  const session = useEditorSessionStore.getState()
  const tab = createTab(session.document, {
    projectPath: session.project.projectPath,
    revision: session.project.revision,
    history: getActiveDocumentHistory(),
  })
  tab.dirty = session.dirty
  tab.selectedLayerIds = normalizeLayerSelection(
    session.document,
    session.selectedLayerIds,
  )
  tab.activeToolId = session.activeToolId
  useDocumentTabManager.setState({ tabs: [tab], activeTabId: tab.id })
  return tab.id
}
