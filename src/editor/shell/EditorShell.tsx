import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  themeDark,
} from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import { LayersPanel } from '../panels/layers/LayersPanel'
import { HistoryPanel } from '../panels/history'
import { NavigatorPanel } from '../panels/navigator'
import { EffectsPanel } from '../panels/effects/EffectsPanel'
import { CharacterPanel, ParagraphPanel } from '../panels/text/TextPanels'
import { PathsPanel } from '../panels/paths'
import { InfoPanel } from '../panels/info'
import { SwatchesPanel } from '../panels/swatches'
import { BrushesPanel } from '../panels/brushes'
import { ViewportHost } from '../viewport/ViewportHost'
import { InspectorPanel } from '../panels/inspector/InspectorPanel'
import { useEditorContext } from '../state/EditorContext'
import { useEditorSessionStore } from '../session/EditorSessionStore'
import { getRenderCoordinator } from '../session/RenderCoordinator'
import {
  DocumentTabStrip,
  OptionsBar,
  ToolsStrip,
  registerToolCommands,
} from '../toolbar'
import { Button } from '../../ui/base/Button'
import { CommandPalette } from '../../ui/shell/CommandPalette'
import { TitleBar } from '../../ui/shell/TitleBar'
import { WorkspaceLayoutDropdown } from '../../ui/shell/WorkspaceLayoutDropdown'
import { AboutWindow } from '../../ui/features/AboutWindow'
import { DocumentFontsWindow } from '../../ui/features/document-fonts'
import { KeyboardShortcutsWindow } from '../../ui/features/KeyboardShortcutsWindow'
import { SettingsWindow } from '../../ui/features/settings'
import { installE2EHooks } from '../e2e/testHooks'
import { CanvasSizeDialog } from '../../ui/features/canvas-size'
import { GaussianBlurDialog, SharpenDialog, NoiseDialog } from '../../ui/features/filters'
import { ImageSizeDialog } from '../../ui/features/image-size'
import { NewDocumentDialog, registerFileCommands } from '../../ui/features/new-document'
import { LayerStyleDialog, openLayerStyleDialog } from '../../ui/features/layer-style'
import { registerPhotoshopMenuCommands } from '../../core/commands/registry'
import { registerImageEditCommands } from '../tools/crop/registerImageCommands'
import { registerFilterCommands } from '../tools/crop/registerFilterCommands'
import { registerEditSelectionCommands } from '../session/editSelectionCommands'
import { registerEditClipboardCommands } from '../session/editClipboard'
import { registerLayerFxCommands } from '../session/layerFxCommands'
import { registerAdjustmentCommands } from '../session/adjustmentCommands'
import { registerLayerCommands } from '../session/layerCommands'
import { registerLayerMergeCommands } from '../session/layerMerge'
import {
  registerTextCommands,
  useTextToolStore,
} from '../tools/text'
import { registerShapeCommands } from '../tools/shape'
import { registerPenCommands } from '../tools/pen/penCommands'
import { registerPathCommands } from '../tools/paths/pathCommands'
import { registerTransformCommands } from '../tools/move'
import { registerSelectionTransformCommand } from '../tools/selection/selectionTransform'
import { registerCageTransformCommand } from '../tools/transform/cageTransform'
import { registerSelectionModifyCommands } from '../tools/selection/selectionModifyCommands'
import { registerRasterizeCommand } from '../session/registerRasterizeCommand'
import { registerColorAndBrushCommands } from '../color'
import { registerViewZoomCommands } from '../viewport/registerViewZoomCommands'
import {
  listToolPresetCommandIds,
  registerToolPresetCommands,
} from '../tools/registerToolPresetCommands'
import { useToolPresetStore } from '../tools/toolPresets'
import { StatusBar } from './StatusBar'
import { GoogleFontBakeBlockBanner } from '../tools/text/googleFonts/GoogleFontBakeBlockBanner'
import {
  discardRasterRecovery,
  getPendingRasterRecovery,
  recoverPendingRasterGeneration,
  writeRasterRecoveryGeneration,
} from '../../persistence'
import {
  DOCK_LAYOUT_VERSION,
  DOCK_LAYOUT_VERSION_KEY,
  RIGHT_DOCK_BOTTOM_STACK,
  RIGHT_DOCK_PANEL_IDS,
  RIGHT_DOCK_TOP_STACK,
  applyWorkspaceViewPrefs,
  buildWorkspaceLayout,
  getRightDockStack,
  hideViewportDockChrome,
  readDockLayoutVersion,
  readWorkspaceLayoutId,
  shouldApplyDefaultLayout,
  WORKSPACE_LAYOUTS,
  WORKSPACE_LAYOUT_ID_KEY,
  type WorkspaceLayoutId,
} from './defaultLayout'
import {
  workspaceCommandIdForCustom,
  workspaceCommandIdForPreset,
} from './workspaceDropdownModel'
import { useViewPreferencesStore } from '../viewport/viewPreferencesStore'
import styles from './EditorShell.module.css'

export { buildDefaultLayout, DOCK_LAYOUT_VERSION } from './defaultLayout'

// Panel id/component key stays `hierarchy` so previously-persisted dockview
// layouts (`workspace.json`) keep resolving — only the rendered content and
// title change (toy Hierarchy -> real Layers panel).
function HierarchyView(_props: IDockviewPanelProps) {
  return (
    <LayersPanel
      onOpenFx={(layerId) => {
        openLayerStyleDialog(layerId)
      }}
    />
  )
}
function ViewportView(_props: IDockviewPanelProps) {
  const document = useEditorSessionStore((s) => s.document)
  const rasterEpoch = useEditorSessionStore((s) => s.rasterEpoch)
  const editingTextId = useTextToolStore((s) => s.edit?.layerId ?? null)
  const [floodMaskEpoch, setFloodMaskEpoch] = useState(0)
  useEffect(
    () => getRenderCoordinator().onFloodMaskReady(() => setFloodMaskEpoch((epoch) => epoch + 1)),
    [],
  )
  const documentView = useMemo(() => {
    const view = getRenderCoordinator().buildView(document)
    if (!editingTextId) return view
    // Hide Pixi text while the HTML overlay owns the caret (avoid double glyphs).
    return {
      ...view,
      layers: view.layers.map((layer) =>
        layer.kind === 'text' && layer.id === editingTextId
          ? { ...layer, visible: false }
          : layer,
      ),
    }
    // rasterEpoch forces remapping when brush/eraser mutates bitmaps only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, rasterEpoch, editingTextId, floodMaskEpoch])
  return <ViewportHost documentView={documentView} />
}
function InspectorView(_props: IDockviewPanelProps) {
  return <InspectorPanel />
}
function HistoryView(_props: IDockviewPanelProps) {
  return <HistoryPanel />
}
function NavigatorView(_props: IDockviewPanelProps) {
  return <NavigatorPanel />
}
function EffectsView(_props: IDockviewPanelProps) {
  return <EffectsPanel />
}
function CharacterView(_props: IDockviewPanelProps) {
  return <CharacterPanel />
}
function ParagraphView(_props: IDockviewPanelProps) {
  return <ParagraphPanel />
}
function InfoView(_props: IDockviewPanelProps) {
  return <InfoPanel />
}
function SwatchesView(_props: IDockviewPanelProps) {
  return <SwatchesPanel />
}
function BrushesView(_props: IDockviewPanelProps) {
  return <BrushesPanel />
}
function PathsView(_props: IDockviewPanelProps) {
  return <PathsPanel />
}

const components = {
  hierarchy: HierarchyView,
  viewport: ViewportView,
  inspector: InspectorView,
  history: HistoryView,
  navigator: NavigatorView,
  effects: EffectsView,
  character: CharacterView,
  paragraph: ParagraphView,
  info: InfoView,
  swatches: SwatchesView,
  brushes: BrushesView,
  paths: PathsView,
}

const CUSTOM_WORKSPACES_KEY = 'customWorkspaceLayouts'
const MAX_CUSTOM_WORKSPACES = 8

type SavedWorkspace = { name: string; layout: unknown }

function readSavedWorkspaces(preferences: Record<string, unknown> | undefined): SavedWorkspace[] {
  // Layout v12 is a deliberate clean break. Do not surface stale named
  // workspaces for a frame before the refreshed Essentials layout is saved.
  if (readDockLayoutVersion(preferences) !== DOCK_LAYOUT_VERSION) return []
  const value = preferences?.[CUSTOM_WORKSPACES_KEY]
  if (!Array.isArray(value)) return []
  const names = new Set<string>()
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return []
    const { name, layout } = candidate as Record<string, unknown>
    const normalized = typeof name === 'string' ? name.trim().slice(0, 48) : ''
    if (!normalized || layout == null || names.has(normalized.toLocaleLowerCase())) return []
    names.add(normalized.toLocaleLowerCase())
    return [{ name: normalized, layout }]
  }).slice(0, MAX_CUSTOM_WORKSPACES)
}

export function EditorShell() {
  const editor = useEditorContext()
  const sessionDocument = useEditorSessionStore((s) => s.document)
  const sessionDirty = useEditorSessionStore((s) => s.dirty)
  const rasterEpoch = useEditorSessionStore((s) => s.rasterEpoch)
  const sessionProject = useEditorSessionStore((s) => s.project)
  const apiRef = useRef<DockviewApi | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recoveryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRasterEpoch = useRef(rasterEpoch)
  const wroteRecoveryThisSession = useRef(false)
  const layoutIdRef = useRef<WorkspaceLayoutId>(
    shouldApplyDefaultLayout(editor.workspace?.layout, editor.workspace?.preferences)
      ? 'essentials'
      : readWorkspaceLayoutId(editor.workspace?.preferences),
  )
  const [activeWorkspaceCommandId, setActiveWorkspaceCommandId] = useState<string>(
    () => workspaceCommandIdForPreset(layoutIdRef.current),
  )
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [documentInfoOpen, setDocumentInfoOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [recoveryPending, setRecoveryPending] = useState(false)
  const [savedWorkspaces, setSavedWorkspaces] = useState<SavedWorkspace[]>(
    () => readSavedWorkspaces(editor.workspace?.preferences),
  )
  const toolPresets = useToolPresetStore((state) => state.presets)

  const workspacePreferences = useCallback(
    (layoutId = layoutIdRef.current) => ({
      [DOCK_LAYOUT_VERSION_KEY]: DOCK_LAYOUT_VERSION,
      [WORKSPACE_LAYOUT_ID_KEY]: layoutId,
      [CUSTOM_WORKSPACES_KEY]: savedWorkspaces,
    }),
    [savedWorkspaces],
  )

  const openSettings = useCallback(() => {
    setSettingsOpen(true)
  }, [])

  const persistLayout = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void editor.saveWorkspace({
        layout: api.toJSON(),
        preferences: workspacePreferences(),
      })
    }, 400)
  }, [editor, workspacePreferences])

  const applyLayoutAndPersist = useCallback(
    (api: DockviewApi, layoutId: WorkspaceLayoutId) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      layoutIdRef.current = layoutId
      setActiveWorkspaceCommandId(workspaceCommandIdForPreset(layoutId))
      buildWorkspaceLayout(api, layoutId)
      void editor.saveWorkspace({
        layout: api.toJSON(),
        preferences: workspacePreferences(layoutId),
      })
    },
    [editor, workspacePreferences],
  )

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      apiRef.current = event.api
      const layout = editor.workspace?.layout
      const prefs = editor.workspace?.preferences
      layoutIdRef.current = shouldApplyDefaultLayout(layout, prefs)
        ? 'essentials'
        : readWorkspaceLayoutId(prefs)
      try {
        if (shouldApplyDefaultLayout(layout, prefs)) {
          applyLayoutAndPersist(event.api, layoutIdRef.current)
        } else {
          event.api.fromJSON(layout as Parameters<DockviewApi['fromJSON']>[0])
          // Persisted layouts may still show dockview's "Document" title bar;
          // document identity is DocumentTabStrip only (PS-like).
          hideViewportDockChrome(event.api)
          // Version 6 adds only preset metadata; retain a valid user-arranged
          // Dockview tree and upgrade its envelope in place.
          if (
            readDockLayoutVersion(prefs) !== DOCK_LAYOUT_VERSION ||
            prefs?.[WORKSPACE_LAYOUT_ID_KEY] !== layoutIdRef.current
          ) {
            void editor.saveWorkspace({
              layout: event.api.toJSON(),
              preferences: workspacePreferences(),
            })
          }
        }
      } catch {
        applyLayoutAndPersist(event.api, 'essentials')
      }
      event.api.onDidLayoutChange(() => {
        persistLayout()
      })
    },
    [
      editor,
      editor.workspace?.layout,
      editor.workspace?.preferences,
      persistLayout,
      applyLayoutAndPersist,
      workspacePreferences,
    ],
  )

  const resetLayout = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    applyLayoutAndPersist(api, 'essentials')
  }, [applyLayoutAndPersist])

  const applyWorkspaceLayout = useCallback((layoutId: WorkspaceLayoutId) => {
    const api = apiRef.current
    if (!api) return
    applyLayoutAndPersist(api, layoutId)
    applyWorkspaceViewPrefs(layoutId, {
      setPixelatedPreview: (enabled) =>
        useViewPreferencesStore.getState().setPixelatedPreview(enabled),
      setShowPixelGrid: editor.setShowPixelGrid,
      setActualPixels: () => {
        editor.commands.run('view.actualPixels')
      },
    })
  }, [applyLayoutAndPersist, editor.commands, editor.setShowPixelGrid])

  const focusOrAddPanel = useCallback(
    (id: string, component: string, title: string) => {
      const api = apiRef.current
      if (!api) return
      const existing = api.getPanel(id)
      if (existing) {
        existing.focus()
        return
      }
      const viewport = api.getPanel('viewport')
      const stack = getRightDockStack(id)

      // Right-dock panels live in one of two stacked tab groups (upper nav / lower editing).
      if (stack && RIGHT_DOCK_PANEL_IDS.includes(id as (typeof RIGHT_DOCK_PANEL_IDS)[number])) {
        const stackPanelIds =
          stack === 'top' ? RIGHT_DOCK_TOP_STACK : RIGHT_DOCK_BOTTOM_STACK
        const stackAnchor = stackPanelIds.map((pid) => api.getPanel(pid)).find(Boolean)
        const layoutId = layoutIdRef.current
        const preset = WORKSPACE_LAYOUTS[layoutId]

        if (stackAnchor) {
          api.addPanel({
            id,
            component,
            title,
            position: { referencePanel: stackAnchor },
          })
        } else if (stack === 'top' && viewport) {
          api.addPanel({
            id,
            component,
            title,
            position: { referencePanel: viewport, direction: 'right' },
            initialWidth: preset.rightDockWidth,
          })
        } else if (stack === 'bottom') {
          const topAnchor = RIGHT_DOCK_TOP_STACK.map((pid) => api.getPanel(pid)).find(Boolean)
          api.addPanel({
            id,
            component,
            title,
            position: topAnchor
              ? { referencePanel: topAnchor, direction: 'below' }
              : viewport
                ? { referencePanel: viewport, direction: 'right' }
                : undefined,
            initialHeight: preset.bottomStackHeight,
            initialWidth: stack === 'bottom' && !topAnchor ? preset.rightDockWidth : undefined,
          })
        }
      } else {
        api.addPanel({
          id,
          component,
          title,
          position: viewport
            ? { referencePanel: viewport, direction: 'right' }
            : undefined,
          initialWidth: 280,
        })
      }
      void editor.saveWorkspace({
        layout: api.toJSON(),
        preferences: workspacePreferences(),
      })
    },
    [editor, workspacePreferences],
  )

  const saveCurrentWorkspace = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    const proposedName = window.prompt('Save current workspace as:')
    if (proposedName == null) return
    const name = proposedName.trim().slice(0, 48)
    if (!name) return
    setSavedWorkspaces((current) => {
      const next = [
        ...current.filter((item) => item.name.toLocaleLowerCase() !== name.toLocaleLowerCase()),
        { name, layout: api.toJSON() },
      ].slice(-MAX_CUSTOM_WORKSPACES)
      void editor.saveWorkspace({ layout: api.toJSON(), preferences: {
        ...workspacePreferences(), [CUSTOM_WORKSPACES_KEY]: next,
      } })
      return next
    })
  }, [editor, workspacePreferences])

  const applySavedWorkspace = useCallback((saved: SavedWorkspace, index: number) => {
    const api = apiRef.current
    if (!api) return
    try {
      api.fromJSON(saved.layout as Parameters<DockviewApi['fromJSON']>[0])
      hideViewportDockChrome(api)
      setActiveWorkspaceCommandId(workspaceCommandIdForCustom(index))
      persistLayout()
    } catch {
      // A saved layout may reference a removed panel; keep the active layout.
    }
  }, [persistLayout])

  useEffect(() => {
    // Stubs first; real File/panel handlers overwrite the same ids below.
    registerPhotoshopMenuCommands(editor.commands)
    registerToolCommands(editor.commands)

    editor.commands.register({
      id: 'palette.toggle',
      title: 'Command Palette',
      shortcut: 'Mod+K',
      enabled: () => true,
      run: () => setPaletteOpen((v) => !v),
    })
    editor.commands.register({
      id: 'about.open',
      title: 'About',
      enabled: () => true,
      run: () => setAboutOpen(true),
    })
    editor.commands.register({
      id: 'file.documentInfo',
      title: 'Document Info…',
      enabled: () => true,
      run: () => setDocumentInfoOpen(true),
    })
    editor.commands.register({
      id: 'help.shortcuts',
      title: 'Keyboard Shortcuts',
      enabled: () => true,
      run: () => setShortcutsOpen(true),
    })
    editor.commands.register({
      id: 'settings.open',
      title: 'Settings',
      shortcut: 'Mod+,',
      enabled: () => true,
      run: openSettings,
    })
    editor.commands.register({
      id: 'workspace.reset',
      title: 'Reset Workspace',
      enabled: () => true,
      run: resetLayout,
    })
    for (const [layoutId, preset] of Object.entries(WORKSPACE_LAYOUTS) as Array<
      [WorkspaceLayoutId, (typeof WORKSPACE_LAYOUTS)[WorkspaceLayoutId]]
    >) {
      editor.commands.register({
        id: workspaceCommandIdForPreset(layoutId),
        title: preset.title,
        enabled: () => true,
        run: () => applyWorkspaceLayout(layoutId),
      })
    }
    editor.commands.register({
      id: 'workspace.saveCurrent',
      title: 'Save Workspace…',
      enabled: () => true,
      run: saveCurrentWorkspace,
    })
    for (const [index, saved] of savedWorkspaces.entries()) {
      editor.commands.register({
        id: workspaceCommandIdForCustom(index),
        title: `Workspace: ${saved.name}`,
        enabled: () => true,
        run: () => applySavedWorkspace(saved, index),
      })
    }
    // Keep the old id working for command palette history and integrations.
    editor.commands.register({
      id: 'view.resetLayout',
      title: 'Reset Workspace',
      enabled: () => true,
      run: resetLayout,
    })
    editor.commands.register({
      id: 'panel.layers.toggle',
      title: 'Layers',
      enabled: () => true,
      run: () => focusOrAddPanel('hierarchy', 'hierarchy', 'Layers'),
    })
    editor.commands.register({
      id: 'panel.inspector.toggle',
      title: 'Properties',
      enabled: () => true,
      run: () => focusOrAddPanel('inspector', 'inspector', 'Properties'),
    })
    editor.commands.register({
      id: 'panel.history.toggle',
      title: 'History',
      enabled: () => true,
      run: () => focusOrAddPanel('history', 'history', 'History'),
    })
    editor.commands.register({
      id: 'panel.navigator.toggle',
      title: 'Navigator',
      enabled: () => true,
      run: () => focusOrAddPanel('navigator', 'navigator', 'Navigator'),
    })
    editor.commands.register({
      id: 'panel.effects.toggle',
      title: 'Effects',
      enabled: () => true,
      run: () => focusOrAddPanel('effects', 'effects', 'Effects'),
    })
    editor.commands.register({
      id: 'panel.character.toggle',
      title: 'Character',
      enabled: () => true,
      run: () => focusOrAddPanel('character', 'character', 'Character'),
    })
    editor.commands.register({
      id: 'panel.paragraph.toggle',
      title: 'Paragraph',
      enabled: () => true,
      run: () => focusOrAddPanel('paragraph', 'paragraph', 'Paragraph'),
    })
    editor.commands.register({
      id: 'panel.info.toggle',
      title: 'Info',
      enabled: () => true,
      run: () => focusOrAddPanel('info', 'info', 'Info'),
    })
    editor.commands.register({
      id: 'panel.swatches.toggle',
      title: 'Swatches',
      enabled: () => true,
      run: () => focusOrAddPanel('swatches', 'swatches', 'Swatches'),
    })
    editor.commands.register({
      id: 'panel.brushes.toggle',
      title: 'Brushes',
      enabled: () => true,
      run: () => focusOrAddPanel('brushes', 'brushes', 'Brushes'),
    })
    editor.commands.register({
      id: 'panel.paths.toggle',
      title: 'Paths',
      enabled: () => true,
      run: () => focusOrAddPanel('paths', 'paths', 'Paths'),
    })
    // File → New/New from Clipboard/Open (UX-PHOTOSHOP.md menu IA).
    registerFileCommands(editor.commands)
    registerImageEditCommands(editor.commands)
    registerFilterCommands(editor.commands)
    registerEditSelectionCommands(editor.commands)
    registerLayerFxCommands(editor.commands)
    registerAdjustmentCommands(editor.commands)
    registerLayerCommands(editor.commands)
    registerLayerMergeCommands(editor.commands)
    // After layer stubs: real Edit clipboard handlers (Wave B).
    registerEditClipboardCommands(editor.commands)
    registerTextCommands(editor.commands)
    registerShapeCommands(editor.commands)
    registerPenCommands(editor.commands)
    registerPathCommands(editor.commands)
    registerTransformCommands(editor.commands)
    registerSelectionTransformCommand(editor.commands)
    registerCageTransformCommand(editor.commands)
    registerSelectionModifyCommands(editor.commands)
    // Last: text + shape bake (overwrites stub / text-only rasterize).
    registerRasterizeCommand(editor.commands)
    registerViewZoomCommands(editor.commands)
    registerColorAndBrushCommands(editor.commands)
    registerToolPresetCommands(editor.commands, toolPresets)
    // Ensure Mod+G stays on Group Layers even if a later registrar omitted it.
    const groupCmd = editor.commands.get('layer.group')
    if (groupCmd && groupCmd.shortcut !== 'Mod+G') {
      editor.commands.register({ ...groupCmd, shortcut: 'Mod+G' })
    }
    installE2EHooks(editor.commands)
  }, [
    editor.commands,
    openSettings,
    resetLayout,
    applyWorkspaceLayout,
    applySavedWorkspace,
    focusOrAddPanel,
    saveCurrentWorkspace,
    savedWorkspaces,
    toolPresets,
  ])

  // Recovery PNG encoding happens after a completed raster flush and is
  // debounced away from pointer input. Metadata-only edits do not create a
  // pixel recovery generation.
  useEffect(() => {
    const rasterChanged = lastRasterEpoch.current !== rasterEpoch
    lastRasterEpoch.current = rasterEpoch
    if (!sessionDirty || !rasterChanged) return
    if (recoveryTimer.current) clearTimeout(recoveryTimer.current)
    recoveryTimer.current = setTimeout(() => {
      void writeRasterRecoveryGeneration(sessionDocument, sessionProject).then((result) => {
        if (result.ok) wroteRecoveryThisSession.current = true
      })
    }, 750)
    return () => {
      if (recoveryTimer.current) clearTimeout(recoveryTimer.current)
    }
  }, [rasterEpoch, sessionDirty, sessionDocument, sessionProject])

  // On a fresh reload, only a complete and target-validated generation is
  // presented. A live session never prompts for its own just-written backup.
  useEffect(() => {
    if (wroteRecoveryThisSession.current) return
    let cancelled = false
    void getPendingRasterRecovery(sessionDocument, sessionProject).then((generation) => {
      if (!cancelled) setRecoveryPending(Boolean(generation))
    })
    return () => {
      cancelled = true
    }
  }, [sessionDocument, sessionProject])

  const recoverPixels = useCallback(() => {
    void recoverPendingRasterGeneration(sessionDocument, sessionProject).then((recovered) => {
      if (recovered) {
        useEditorSessionStore.setState((state) => ({
          dirty: true,
          rasterEpoch: state.rasterEpoch + 1,
        }))
      }
      setRecoveryPending(false)
    })
  }, [sessionDocument, sessionProject])

  const discardRecovery = useCallback(() => {
    void discardRasterRecovery().then(() => setRecoveryPending(false))
  }, [])

  const dockTheme = useMemo(() => themeDark, [])
  const commandList = useMemo(
    () => editor.commands.list(),
    // Recompute when floating launchers open so lists see freshly registered cmds.
    [editor.commands, paletteOpen, shortcutsOpen, documentInfoOpen, sessionDirty, editor.selectedIds],
  )

  if (!editor.ready) {
    return <div className="boot-screen">Loading project…</div>
  }

  return (
    <div className={styles.shell}>
      <TitleBar
        title="Happy Shop"
        commands={editor.commands}
        trailing={
          <WorkspaceLayoutDropdown
            commands={editor.commands}
            activeCommandId={activeWorkspaceCommandId}
            customWorkspaces={savedWorkspaces}
            fallbackLayoutId={layoutIdRef.current}
          />
        }
        customWorkspaceCommandIds={savedWorkspaces.map(
          (_workspace, index) => workspaceCommandIdForCustom(index),
        )}
        toolPresetCommandIds={listToolPresetCommandIds(toolPresets)}
      />

      <OptionsBar />

      {editor.conflict && (
        <div className={styles.conflict}>
          <span>Document changed on disk (revision conflict).</span>
          <div className={styles.conflictActions}>
            <Button onClick={() => void editor.reloadFromDisk()}>
              Take theirs
            </Button>
            <Button variant="primary" onClick={editor.keepMine}>
              Keep mine
            </Button>
          </div>
        </div>
      )}
      {recoveryPending && (
        <div className={styles.conflict} role="status">
          <span>Unsaved raster pixels were found for this saved project.</span>
          <div className={styles.conflictActions}>
            <Button onClick={discardRecovery}>Discard recovery</Button>
            <Button variant="primary" onClick={recoverPixels}>Recover unsaved pixels</Button>
          </div>
        </div>
      )}
      <GoogleFontBakeBlockBanner />

      <div className={styles.body}>
        <ToolsStrip />
        <div className={styles.main}>
          <DocumentTabStrip />
          <div className={styles.dock}>
            <DockviewReact
              className="dockview-theme-dark"
              components={components}
              onReady={onReady}
              theme={dockTheme}
            />
          </div>
        </div>
      </div>

      <StatusBar />

      <CommandPalette
        open={paletteOpen}
        commands={commandList}
        onClose={() => setPaletteOpen(false)}
        onRun={(id) => {
          editor.commands.run(id)
        }}
      />
      <AboutWindow open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <DocumentFontsWindow
        open={documentInfoOpen}
        document={sessionDocument}
        onClose={() => setDocumentInfoOpen(false)}
      />
      <KeyboardShortcutsWindow
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
      <SettingsWindow
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <NewDocumentDialog />
      <CanvasSizeDialog />
      <GaussianBlurDialog />
      <SharpenDialog />
      <NoiseDialog />
      <ImageSizeDialog />
      <LayerStyleDialog />
    </div>
  )
}
