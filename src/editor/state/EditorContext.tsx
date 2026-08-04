import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  createEmptyDocument,
  createRectNode,
  findNode,
  newNodeId,
  type EditorDocument,
  type RectNode,
} from '../../core/legacyDocument'
import {
  CommandRegistry,
  findCommandByShortcut,
} from '../../core/commands/registry'
import { HistoryStack } from '../../core/history'
import {
  projectClient,
  type DocumentListItem,
  type WorkspaceFile,
  ProjectBridgeUnavailableError,
} from '../project/ProjectClient'
import { DEFAULT_SNAP, type SnapSettings } from '../geometry'
import { isEditableEventTarget } from '../../lib/editableTarget'
import {
  installClipboardEventBridge,
  isNativeClipboardShortcut,
} from '../session/clipboardEvents'
import { nudgeSelectedLayers } from '../session/nudgeLayers'
import { useEditorSessionStore } from '../session/EditorSessionStore'
import { documentHistory } from '../session/documentHistory'
import { canUndoPenDraftAnchor } from '../tools/pen/penWorkPathUndo'
import {
  saveActiveProject,
  saveActiveProjectAs,
  type SaveProjectResult,
} from '../session/saveProject'
import { useSnapPreferencesStore } from '../viewport/snapPreferences'
import { useViewPreferencesStore } from '../viewport/viewPreferencesStore'

export type ConflictState = {
  revision: string
  document: EditorDocument
} | null

type EditorContextValue = {
  ready: boolean
  document: EditorDocument
  revision: string | null
  dirty: boolean
  conflict: ConflictState
  selectedIds: string[]
  selected: RectNode | null
  status: string
  history: HistoryStack
  commands: CommandRegistry
  workspace: WorkspaceFile | null
  documents: DocumentListItem[]
  showGrid: boolean
  showPixelGrid: boolean
  showRulers: boolean
  snap: SnapSettings
  setShowGrid: (v: boolean | ((p: boolean) => boolean)) => void
  setShowPixelGrid: (v: boolean | ((p: boolean) => boolean)) => void
  setShowRulers: (v: boolean | ((p: boolean) => boolean)) => void
  setSnap: (s: SnapSettings | ((prev: SnapSettings) => SnapSettings)) => void
  setSelectedIds: (ids: string[]) => void
  selectOne: (id: string | null, additive?: boolean) => void
  mutate: (label: string, mutator: (doc: EditorDocument) => EditorDocument) => void
  patchNode: (id: string, patch: Partial<RectNode>, label?: string) => void
  patchNodesLive: (patches: Record<string, Partial<RectNode>>) => void
  commitLiveGesture: (label: string, before: EditorDocument) => void
  addNode: () => void
  deleteSelected: () => void
  duplicateSelected: () => void
  renameNode: (id: string, name: string) => void
  save: () => Promise<void>
  saveAs: (destination: string) => Promise<SaveProjectResult>
  reloadFromDisk: () => Promise<void>
  keepMine: () => void
  undo: () => void
  redo: () => void
  saveWorkspace: (patch: Partial<WorkspaceFile>) => Promise<void>
  getDocumentSnapshot: () => EditorDocument
}

const EditorContext = createContext<EditorContextValue | null>(null)

export function useEditorContext(): EditorContextValue {
  const ctx = useContext(EditorContext)
  if (!ctx) throw new Error('useEditorContext outside provider')
  return ctx
}

export function EditorProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [document, setDocument] = useState<EditorDocument>(() =>
    createEmptyDocument('demo'),
  )
  const [revision, setRevision] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [conflict, setConflict] = useState<ConflictState>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [status, setStatus] = useState('Loading…')
  const [workspace, setWorkspace] = useState<WorkspaceFile | null>(null)
  const [documents, setDocuments] = useState<DocumentListItem[]>([])
  const [showGrid, setShowGridState] = useState(true)
  const [showPixelGrid, setShowPixelGridState] = useState(false)
  const [showRulers, setShowRulersState] = useState(true)
  const [snap, setSnapState] = useState<SnapSettings>(DEFAULT_SNAP)

  const historyRef = useRef(new HistoryStack())
  const commandsRef = useRef(new CommandRegistry())
  const documentRef = useRef(document)
  const revisionRef = useRef(revision)
  const dirtyRef = useRef(dirty)
  const workspaceRef = useRef(workspace)
  const showGridRef = useRef(showGrid)
  const showPixelGridRef = useRef(showPixelGrid)
  const showRulersRef = useRef(showRulers)
  const snapRef = useRef(snap)
  const selectedIdsRef = useRef(selectedIds)
  const savingRef = useRef(false)
  const prefsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gestureBeforeRef = useRef<EditorDocument | null>(null)
  const [, bumpHistory] = useState(0)

  documentRef.current = document
  revisionRef.current = revision
  dirtyRef.current = dirty
  workspaceRef.current = workspace
  showGridRef.current = showGrid
  showPixelGridRef.current = showPixelGrid
  showRulersRef.current = showRulers
  snapRef.current = snap
  selectedIdsRef.current = selectedIds

  const selected =
    selectedIds.length === 1
      ? (findNode(document, selectedIds[0]!) ?? null)
      : null

  const setDocAndDirty = (doc: EditorDocument, markDirty = true) => {
    setDocument(doc)
    if (markDirty) setDirty(true)
  }

  const mutate = (
    label: string,
    mutator: (doc: EditorDocument) => EditorDocument,
  ) => {
    historyRef.current.apply(
      () => documentRef.current,
      (doc) => setDocAndDirty(doc),
      mutator,
      label,
    )
    bumpHistory((n) => n + 1)
  }

  const patchNode = (
    id: string,
    patch: Partial<RectNode>,
    label = 'Edit node',
  ) => {
    mutate(label, (doc) => ({
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }))
  }

  const patchNodesLive = (patches: Record<string, Partial<RectNode>>) => {
    if (!gestureBeforeRef.current) {
      gestureBeforeRef.current = structuredClone(documentRef.current)
    }
    setDocument((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        patches[n.id] ? { ...n, ...patches[n.id] } : n,
      ),
    }))
    setDirty(true)
  }

  const commitLiveGesture = (label: string, before: EditorDocument) => {
    const after = structuredClone(documentRef.current)
    historyRef.current.push({
      label,
      undo: () => {
        setDocument(structuredClone(before))
        setDirty(true)
      },
      redo: () => {
        setDocument(structuredClone(after))
        setDirty(true)
      },
    })
    gestureBeforeRef.current = null
    bumpHistory((n) => n + 1)
  }

  const addNode = () => {
    const node = createRectNode({
      name: `Rect ${documentRef.current.nodes.length + 1}`,
      x: 40 + documentRef.current.nodes.length * 12,
      y: 40 + documentRef.current.nodes.length * 12,
    })
    mutate('Add rect', (doc) => ({
      ...doc,
      nodes: [...doc.nodes, node],
    }))
    setSelectedIds([node.id])
  }

  const deleteSelected = () => {
    if (selectedIds.length === 0) return
    const ids = new Set(selectedIds)
    mutate('Delete', (doc) => ({
      ...doc,
      nodes: doc.nodes.filter((n) => !ids.has(n.id)),
    }))
    setSelectedIds([])
  }

  const duplicateSelected = () => {
    if (selectedIds.length === 0) return
    const ids = new Set(selectedIds)
    const copies: RectNode[] = []
    for (const n of documentRef.current.nodes) {
      if (!ids.has(n.id)) continue
      copies.push({
        ...structuredClone(n),
        id: newNodeId(),
        name: `${n.name} Copy`,
        x: n.x + 16,
        y: n.y + 16,
      })
    }
    mutate('Duplicate', (doc) => ({
      ...doc,
      nodes: [...doc.nodes, ...copies],
    }))
    setSelectedIds(copies.map((c) => c.id))
  }

  const renameNode = (id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    patchNode(id, { name: trimmed }, 'Rename')
  }

  const selectOne = (id: string | null, additive = false) => {
    if (id == null) {
      setSelectedIds([])
      return
    }
    if (additive) {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      )
      return
    }
    setSelectedIds([id])
  }

  /** Shared status/dirty/revision handling for Save and Save As. */
  const applySaveResult = (result: SaveProjectResult): SaveProjectResult => {
    if (result.ok) {
      setDirty(false)
      setConflict(null)
      setRevision(result.revision)
      setStatus(`Saved ${result.path}`)
    } else if ('conflict' in result && result.conflict) {
      setStatus(
        `Revision conflict (disk ${result.currentRevision}) — resolve before saving`,
      )
    } else {
      setStatus('error' in result ? result.error : 'Save failed')
    }
    return result
  }

  /** Persist active HappyDocument + layer PNGs (SPEC §13 / M2). */
  const save = async () => {
    if (savingRef.current) return
    savingRef.current = true
    try {
      applySaveResult(await saveActiveProject())
    } finally {
      savingRef.current = false
    }
  }

  /**
   * File → Save As…: same status handling as `save`, but the result is handed
   * back so the dialog can stay open and show why a destination was refused.
   */
  const saveAs = async (destination: string): Promise<SaveProjectResult> => {
    if (savingRef.current) {
      return { ok: false, error: 'A save is already in progress' }
    }
    savingRef.current = true
    try {
      return applySaveResult(await saveActiveProjectAs(destination))
    } finally {
      savingRef.current = false
    }
  }

  const reloadFromDisk = async () => {
    const id =
      workspaceRef.current?.activeDocument ??
      documentRef.current.name ??
      'demo'
    const res = await projectClient.fetchDocument(id)
    setDocument(res.document)
    setRevision(res.revision)
    setDirty(false)
    setConflict(null)
    historyRef.current.clear()
    bumpHistory((n) => n + 1)
    setStatus(`Reloaded ${res.relativePath}`)
  }

  const keepMine = () => {
    setConflict(null)
    setRevision(null)
    setStatus('Kept local — save to overwrite')
  }

  /** HappyDocument metadata undo/redo (SPEC §12). Toy HistoryStack stays inert. */
  const undo = () => {
    void useEditorSessionStore.getState().undo().then((ok) => {
      if (ok) {
        setDirty(true)
        bumpHistory((n) => n + 1)
      }
    })
  }

  const redo = () => {
    void useEditorSessionStore.getState().redo().then((ok) => {
      if (ok) {
        setDirty(true)
        bumpHistory((n) => n + 1)
      }
    })
  }

  const saveWorkspace = async (patch: Partial<WorkspaceFile>) => {
    const base = workspaceRef.current ?? {
      version: 1,
      layout: null,
      preferences: {},
      activeDocument: documentRef.current.name,
    }
    const next: WorkspaceFile = {
      ...base,
      ...patch,
      preferences: {
        ...(base.preferences ?? {}),
        ...(patch.preferences ?? {}),
      },
    }
    setWorkspace(next)
    await projectClient.saveWorkspace(next)
  }

  const persistViewPrefs = () => {
    if (prefsTimer.current) clearTimeout(prefsTimer.current)
    prefsTimer.current = setTimeout(() => {
      void saveWorkspace({
        preferences: {
          showGrid: showGridRef.current,
          showPixelGrid: showPixelGridRef.current,
          showRulers: showRulersRef.current,
          snap: snapRef.current,
        },
      })
    }, 300)
  }

  const setShowGrid = (v: boolean | ((p: boolean) => boolean)) => {
    setShowGridState((prev) => {
      const next = typeof v === 'function' ? v(prev) : v
      showGridRef.current = next
      useViewPreferencesStore.getState().setShowGrid(next)
      persistViewPrefs()
      return next
    })
  }

  const setShowPixelGrid = (v: boolean | ((p: boolean) => boolean)) => {
    setShowPixelGridState((prev) => {
      const next = typeof v === 'function' ? v(prev) : v
      showPixelGridRef.current = next
      useViewPreferencesStore.getState().setShowPixelGrid(next)
      persistViewPrefs()
      return next
    })
  }

  const setShowRulers = (v: boolean | ((p: boolean) => boolean)) => {
    setShowRulersState((prev) => {
      const next = typeof v === 'function' ? v(prev) : v
      showRulersRef.current = next
      persistViewPrefs()
      return next
    })
  }

  const setSnap = (s: SnapSettings | ((prev: SnapSettings) => SnapSettings)) => {
    setSnapState((prev) => {
      const next = typeof s === 'function' ? s(prev) : s
      snapRef.current = next
      useSnapPreferencesStore.getState().setSettings(next)
      persistViewPrefs()
      return next
    })
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const snap = await projectClient.fetchProject()
        if (cancelled) return
        setWorkspace(snap.workspace)
        setDocuments(snap.documents)
        const prefs = snap.workspace.preferences ?? {}
        if (typeof prefs.showGrid === 'boolean') {
          setShowGridState(prefs.showGrid)
          useViewPreferencesStore.getState().setShowGrid(prefs.showGrid)
        }
        if (typeof prefs.showPixelGrid === 'boolean') {
          setShowPixelGridState(prefs.showPixelGrid)
          useViewPreferencesStore.getState().setShowPixelGrid(prefs.showPixelGrid)
        }
        if (typeof prefs.showRulers === 'boolean')
          setShowRulersState(prefs.showRulers)
        if (prefs.snap && typeof prefs.snap === 'object') {
          const nextSnap = {
            ...DEFAULT_SNAP,
            ...(prefs.snap as Partial<SnapSettings>),
          }
          setSnapState(nextSnap)
          useSnapPreferencesStore.getState().setSettings(nextSnap)
        }
        // M1: the toy rect document is no longer the editor's real content
        // (see `src/editor/session` for the HappyDocument-backed viewport/
        // layers/inspector) — stay in-memory instead of loading/creating
        // `demo.json` over the bridge. Save/undo/redo stay wired so the
        // bridge path itself isn't broken, they just have nothing to persist
        // yet.
        const active =
          snap.workspace.activeDocument ??
          (snap.project.defaultDocument as string | undefined) ??
          snap.documents[0]?.name ??
          'demo'
        setDocument(createEmptyDocument(active))
        setRevision(null)
        setStatus('Ready')
        setReady(true)
      } catch (e) {
        if (cancelled) return
        // Production / GitHub Pages has no Vite project bridge; boot in-memory.
        setWorkspace({
          version: 1,
          layout: null,
          preferences: {},
          activeDocument: 'demo',
        })
        setDocuments([])
        setDocument(createEmptyDocument('demo'))
        setRevision(null)
        setStatus(
          e instanceof ProjectBridgeUnavailableError
            ? 'Ready'
            : e instanceof Error
              ? e.message
              : 'Failed to load project',
        )
        setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return projectClient.subscribeHot({
      onDocumentChanged: (data) => {
        const name = typeof data.name === 'string' ? data.name : null
        if (!name || name !== documentRef.current.name) return
        if (dirtyRef.current) {
          setStatus('Disk changed (unsaved local edits)')
          return
        }
        void reloadFromDisk()
      },
    })
  }, [])

  useEffect(() => {
    const cmds = commandsRef.current
    cmds.register({
      id: 'doc.save',
      title: 'Save',
      shortcut: 'Mod+S',
      enabled: () => useEditorSessionStore.getState().dirty || dirtyRef.current,
      run: () => void save(),
    })
    cmds.register({
      id: 'history.undo',
      title: 'Undo',
      shortcut: 'Mod+Z',
      enabled: () => !canUndoPenDraftAnchor() && documentHistory.canUndo,
      run: undo,
    })
    cmds.register({
      id: 'history.redo',
      title: 'Redo',
      shortcut: 'Mod+Shift+Z',
      enabled: () => documentHistory.canRedo,
      run: redo,
    })
    // Photoshop Win: Ctrl+Y redo (keep Mod+Shift+Z for Mac / cross-platform).
    cmds.register({
      id: 'history.redo.modY',
      title: 'Redo',
      shortcut: 'Mod+Y',
      enabled: () => documentHistory.canRedo,
      run: redo,
    })
    // Toy rect node commands kept registered but inert for the HappyDocument
    // session — Layers panel owns real layer ops.
    cmds.register({
      id: 'node.add',
      title: 'Add Rect',
      enabled: () => false,
      run: addNode,
    })
    cmds.register({
      id: 'node.delete',
      title: 'Delete Selected',
      shortcut: 'Delete',
      enabled: () => false,
      run: deleteSelected,
    })
    cmds.register({
      id: 'view.toggleGrid',
      title: 'Toggle Grid',
      // PS-like; Mod+G reserved for Group Layers (`layer.group`).
      shortcut: "Mod+'",
      enabled: () => true,
      run: () => setShowGrid((v) => !v),
    })
    cmds.register({
      id: 'view.togglePixelGrid',
      title: 'Toggle Pixel Grid',
      enabled: () => true,
      run: () => setShowPixelGrid((v) => !v),
    })
    cmds.register({
      id: 'view.togglePixelatedPreview',
      title: 'Toggle Pixelated Preview',
      enabled: () => true,
      run: () => {
        const next = !useViewPreferencesStore.getState().pixelatedPreview
        useViewPreferencesStore.getState().setPixelatedPreview(next)
      },
    })
    // Photoshop's View → Extras master switch. Mod+H is free in this registry
    // (`findCommandByShortcut` finds no other Ctrl/Cmd+H binding) and is not
    // reserved by Chrome on Windows/Linux; macOS Cmd+H hides the window, which
    // is why the individual toggles stay reachable from the View menu.
    cmds.register({
      id: 'view.toggleExtras',
      title: 'Extras',
      shortcut: 'Mod+H',
      enabled: () => true,
      run: () => useViewPreferencesStore.getState().toggleExtras(),
    })
    cmds.register({
      id: 'view.toggleSnap',
      title: 'Toggle Snap',
      enabled: () => true,
      run: () => setSnap((s) => ({ ...s, enabled: !s.enabled })),
    })
    cmds.register({
      id: 'view.toggleRulers',
      title: 'Toggle Rulers',
      shortcut: 'Mod+R',
      enabled: () => true,
      run: () => setShowRulers((v) => !v),
    })
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A panel/overlay that already consumed the key (e.g. Layers list arrow
      // navigation) wins over global shortcuts and nudge.
      if (e.defaultPrevented) return
      if (isEditableEventTarget(e)) return
      // Mod+C/X/V are handled by the native ClipboardEvent bridge, which gets
      // the payload without a permission prompt. Running the command here too
      // would paste twice.
      if (isNativeClipboardShortcut(e)) return
      const cmd = findCommandByShortcut(commandsRef.current, e)
      if (cmd) {
        e.preventDefault()
        cmd.run()
        return
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return

      const step = e.shiftKey ? snapRef.current.grid || 10 : 1
      let dx = 0
      let dy = 0
      if (e.key === 'ArrowLeft') dx = -step
      else if (e.key === 'ArrowRight') dx = step
      else if (e.key === 'ArrowUp') dy = -step
      else if (e.key === 'ArrowDown') dy = step
      if (!dx && !dy) return

      // HappyDocument layers are the real target; the legacy `EditorDocument`
      // node model only still exists for the framework demo document.
      if (nudgeSelectedLayers(dx, dy)) {
        e.preventDefault()
        return
      }

      const ids = selectedIdsRef.current
      if (!ids.length) return
      e.preventDefault()
      mutate('Nudge', (doc) => ({
        ...doc,
        nodes: doc.nodes.map((n) =>
          ids.includes(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n,
        ),
      }))
    }
    window.addEventListener('keydown', onKey)
    const disposeClipboard = installClipboardEventBridge()
    return () => {
      window.removeEventListener('keydown', onKey)
      disposeClipboard()
    }
  }, [])

  const value: EditorContextValue = {
    ready,
    document,
    revision,
    dirty,
    conflict,
    selectedIds,
    selected,
    status,
    history: historyRef.current,
    commands: commandsRef.current,
    workspace,
    documents,
    showGrid,
    showPixelGrid,
    showRulers,
    snap,
    setShowGrid,
    setShowPixelGrid,
    setShowRulers,
    setSnap,
    setSelectedIds,
    selectOne,
    mutate,
    patchNode,
    patchNodesLive,
    commitLiveGesture,
    addNode,
    deleteSelected,
    duplicateSelected,
    renameNode,
    save,
    saveAs,
    reloadFromDisk,
    keepMine,
    undo,
    redo,
    saveWorkspace,
    getDocumentSnapshot: () => structuredClone(documentRef.current),
  }

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  )
}
