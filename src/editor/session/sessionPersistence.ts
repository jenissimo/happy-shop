import type { LayerId } from '../../core/document'
import { getBridgeProjectStore } from '../../persistence'
import { readRecoveryJournal } from '../../persistence/recoveryJournal'
import { registerRasterSurface } from '../../imaging/RasterSurfaceStore'
import { useColorStore } from '../color/colorStore'
import { useBrushSettingsStore, type BrushToolPrefs } from '../tools/brush/brushSettingsStore'
import { isPressureCurveKind } from '../tools/brush/pointerPressure'
import type { EditorToolId } from '../toolbar/tools'
import { getViewportCameraHandle } from '../viewport/viewportCameraAccess'
import type { CameraState } from '../viewport/ViewportCamera'
import { parseGuides, useGuidesStore, type DocumentGuide } from '../viewport/guides'
import {
  ensureInitialDocumentTab,
  useDocumentTabManager,
} from './DocumentTabManager'
import { normalizeLayerSelection, useEditorSessionStore } from './EditorSessionStore'

const SESSION_KEY = 'happy-shop:editor-session:v1'
const SESSION_VERSION = 1
const MAX_TABS = 20
const MAX_SELECTED_LAYERS = 32

type PersistedTab = {
  projectPath: string | null
  revision: string | null
  documentId: string
  documentName: string
  selectedLayerIds: string[]
  activeToolId: EditorToolId
}

export type EditorSessionSnapshot = {
  version: typeof SESSION_VERSION
  savedAt: string
  activeTab: number
  tabs: PersistedTab[]
  activeToolId: EditorToolId
  selectedLayerIds: string[]
  camera: CameraState | null
  colors: { foreground: string; background: string }
  brush: BrushToolPrefs
  guides: DocumentGuide[]
  dirty: boolean
}

function isToolId(value: unknown): value is EditorToolId {
  return typeof value === 'string' && [
    'move', 'marquee', 'lasso', 'magicWand', 'crop', 'brush', 'eraser',
    'text', 'hand', 'zoom', 'shape',
  ].includes(value)
}

function isColor(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64
}

function isCamera(value: unknown): value is CameraState {
  if (!value || typeof value !== 'object') return false
  const camera = value as Record<string, unknown>
  return ['zoom', 'offsetX', 'offsetY'].every(
    (key) => typeof camera[key] === 'number' && Number.isFinite(camera[key]),
  )
}

function toSelectedLayers(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_SELECTED_LAYERS) return null
  return value.every((id) => typeof id === 'string' && id.length <= 200)
    ? [...new Set(value)]
    : null
}

function isBrushPrefs(value: unknown): value is BrushToolPrefs {
  if (!value || typeof value !== 'object') return false
  const prefs = value as Record<string, unknown>
  return (
    typeof prefs.tipId === 'string' &&
    typeof prefs.color === 'string' &&
    ['size', 'hardness', 'opacity', 'flow', 'spacing', 'angle', 'roundness'].every(
      (key) => typeof prefs[key] === 'number' && Number.isFinite(prefs[key]),
    ) &&
    (prefs.pressureControlsSize === undefined ||
      typeof prefs.pressureControlsSize === 'boolean') &&
    (prefs.pressureControlsOpacity === undefined ||
      typeof prefs.pressureControlsOpacity === 'boolean') &&
    (prefs.pressureControlsFlow === undefined ||
      typeof prefs.pressureControlsFlow === 'boolean') &&
    (prefs.pressureSizeCurve === undefined ||
      isPressureCurveKind(prefs.pressureSizeCurve)) &&
    (prefs.pressureOpacityCurve === undefined ||
      isPressureCurveKind(prefs.pressureOpacityCurve)) &&
    (prefs.pressureFlowCurve === undefined ||
      isPressureCurveKind(prefs.pressureFlowCurve)) &&
    (prefs.pencilPixelPerfect === undefined ||
      typeof prefs.pencilPixelPerfect === 'boolean') &&
    Array.isArray(prefs.recentTipIds) &&
    prefs.recentTipIds.length <= 8 &&
    prefs.recentTipIds.every((id) => typeof id === 'string')
  )
}

/** Parses only the small JSON-safe metadata allowed across a reload. */
export function parseSessionSnapshot(raw: unknown): EditorSessionSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (value.version !== SESSION_VERSION || !Array.isArray(value.tabs) || value.tabs.length > MAX_TABS) {
    return null
  }
  if (!isToolId(value.activeToolId) || !isCamera(value.camera) && value.camera !== null) return null
  const selectedLayerIds = toSelectedLayers(value.selectedLayerIds)
  const colors = value.colors as Record<string, unknown> | null
  const brush = value.brush
  const guides = parseGuides(value.guides)
  if (!selectedLayerIds || !colors || !isColor(colors.foreground) || !isColor(colors.background) || !isBrushPrefs(brush)) {
    return null
  }
  const tabs: PersistedTab[] = []
  for (const candidate of value.tabs) {
    if (!candidate || typeof candidate !== 'object') return null
    const tab = candidate as Record<string, unknown>
    const layers = toSelectedLayers(tab.selectedLayerIds)
    if (
      (tab.projectPath !== null && typeof tab.projectPath !== 'string') ||
      (tab.revision !== null && typeof tab.revision !== 'string') ||
      typeof tab.documentId !== 'string' ||
      typeof tab.documentName !== 'string' ||
      !layers ||
      !isToolId(tab.activeToolId)
    ) return null
    tabs.push({
      projectPath: tab.projectPath as string | null,
      revision: tab.revision as string | null,
      documentId: tab.documentId,
      documentName: tab.documentName,
      selectedLayerIds: layers,
      activeToolId: tab.activeToolId,
    })
  }
  if (!Number.isInteger(value.activeTab) || (value.activeTab as number) < 0 || (value.activeTab as number) >= tabs.length) {
    return null
  }
  return {
    version: SESSION_VERSION,
    savedAt: typeof value.savedAt === 'string' ? value.savedAt : '',
    activeTab: value.activeTab as number,
    tabs,
    activeToolId: value.activeToolId,
    selectedLayerIds,
    camera: value.camera as CameraState | null,
    colors: { foreground: colors.foreground, background: colors.background },
    // Brush settings have their own localStorage persistence; retain a bounded
    // copy here so Vite handoff works even while that module is being replaced.
    brush,
    guides,
    dirty: value.dirty === true,
  }
}

export function captureSessionSnapshot(): EditorSessionSnapshot {
  const session = useEditorSessionStore.getState()
  const manager = useDocumentTabManager.getState()
  // Do not call syncActiveFromSession here: this function also runs from
  // Zustand subscriptions, and synchronizing would recursively notify them.
  const tabs = manager.tabs.map((tab) => tab.id === manager.activeTabId ? {
    ...tab,
    document: session.document,
    dirty: session.dirty,
    projectPath: session.project.projectPath,
    revision: session.project.revision,
    selectedLayerIds: session.selectedLayerIds,
    activeToolId: session.activeToolId,
  } : tab)
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === manager.activeTabId))
  const sourceTabs = tabs.length > 0 ? tabs : [{
    projectPath: session.project.projectPath,
    revision: session.project.revision,
    document: session.document,
    selectedLayerIds: session.selectedLayerIds,
    activeToolId: session.activeToolId,
  }]
  const camera = getViewportCameraHandle()?.camera.getState() ?? null
  const colors = useColorStore.getState()
  const brush = useBrushSettingsStore.getState()
  const guides = useGuidesStore.getState().guides
  return {
    version: SESSION_VERSION,
    savedAt: new Date().toISOString(),
    activeTab: Math.min(activeIndex, sourceTabs.length - 1),
    tabs: sourceTabs.slice(0, MAX_TABS).map((tab) => ({
      projectPath: tab.projectPath,
      revision: tab.revision,
      documentId: tab.document.id,
      documentName: tab.document.name.slice(0, 512),
      selectedLayerIds: normalizeLayerSelection(tab.document, tab.selectedLayerIds).slice(0, MAX_SELECTED_LAYERS),
      activeToolId: tab.activeToolId,
    })),
    activeToolId: session.activeToolId,
    selectedLayerIds: normalizeLayerSelection(session.document, session.selectedLayerIds).slice(0, MAX_SELECTED_LAYERS),
    camera,
    colors: { foreground: colors.foreground, background: colors.background },
    brush: {
      tipId: brush.tipId, size: brush.size, hardness: brush.hardness,
      opacity: brush.opacity, flow: brush.flow, color: brush.color,
      spacing: brush.spacing, angle: brush.angle, roundness: brush.roundness,
      pressureControlsSize: brush.pressureControlsSize,
      pressureControlsOpacity: brush.pressureControlsOpacity,
      pressureControlsFlow: brush.pressureControlsFlow,
      pressureSizeCurve: brush.pressureSizeCurve,
      pressureOpacityCurve: brush.pressureOpacityCurve,
      pressureFlowCurve: brush.pressureFlowCurve,
      recentTipIds: brush.recentTipIds.slice(0, 8),
      pencilPixelPerfect: brush.pencilPixelPerfect,
    },
    guides: guides.map((guide) => ({ ...guide })),
    dirty: session.dirty,
  }
}

export function readPersistedSession(): EditorSessionSnapshot | null {
  try {
    return parseSessionSnapshot(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null'))
  } catch {
    return null
  }
}

/** A coarse journal is enough to prevent falsely presenting a fresh demo. */
export function hasDirtyRecoveryJournal(): boolean {
  return readRecoveryJournal()?.dirty === true
}

export function persistSessionSnapshot(snapshot = captureSessionSnapshot()): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(snapshot))
  } catch {
    // sessionStorage can be unavailable in private browsing; HMR still has data.
  }
}

function applyUiSnapshot(snapshot: EditorSessionSnapshot): void {
  useColorStore.setState(snapshot.colors)
  useBrushSettingsStore.getState().setPrefs(snapshot.brush)
  useGuidesStore.getState().setGuides(snapshot.guides)
  useEditorSessionStore.setState({
    activeToolId: snapshot.activeToolId,
    cameraPrefs: { fitOnLoad: snapshot.camera == null, camera: snapshot.camera ?? undefined },
  })
}

async function hydrateProjectAssets(
  assets: Record<string, { width?: number; height?: number }>,
): Promise<void> {
  const store = getBridgeProjectStore()
  await Promise.all(Object.entries(assets).map(async ([assetId, descriptor]) => {
    const blob = await store.readAsset(assetId)
    const bitmap = await createImageBitmap(blob)
    registerRasterSurface({
      assetId,
      width: descriptor.width ?? bitmap.width,
      height: descriptor.height ?? bitmap.height,
      bitmap,
    })
  }))
}

/**
 * Reopens durable project tabs. Unsaved raster bytes are intentionally not
 * invented from metadata; a dirty recovery journal suppresses demo hydration.
 */
export async function restoreSessionSnapshot(
  snapshot: EditorSessionSnapshot,
): Promise<{ restoredDurableTab: boolean; recoveryPending: boolean }> {
  applyUiSnapshot(snapshot)
  const manager = useDocumentTabManager.getState()
  const restored: Array<{ snapshotIndex: number; tabId: string }> = []

  for (const [snapshotIndex, tab] of snapshot.tabs.entries()) {
    if (!tab.projectPath) continue
    try {
      const project = await getBridgeProjectStore().open({
        kind: 'directory',
        path: tab.projectPath,
      })
      await hydrateProjectAssets(project.assets)
      const tabId = manager.openDocument(project.document, {
        projectPath: project.locator.path,
        revision: project.revision,
        activate: false,
        dedupeByPath: true,
      })
      useDocumentTabManager.setState((state) => ({
        tabs: state.tabs.map((existing) => existing.id === tabId ? {
          ...existing,
          selectedLayerIds: normalizeLayerSelection(project.document, tab.selectedLayerIds as LayerId[]),
          activeToolId: tab.activeToolId,
        } : existing),
      }))
      restored.push({ snapshotIndex, tabId })
    } catch {
      // A missing/moved project must not block startup or erase other tabs.
    }
  }

  const active = restored.find((entry) => entry.snapshotIndex === snapshot.activeTab)
  if (active) manager.activateTab(active.tabId)
  else if (restored[0]) manager.activateTab(restored[0].tabId)

  const journal = readRecoveryJournal()
  const recoveryPending = snapshot.dirty || journal?.dirty === true
  if (!restored.length) {
    // Keep a deliberately blank, non-demo session. The journal is the only
    // honest representation of dirty work until bounded recovery assets exist.
    ensureInitialDocumentTab()
  }
  return { restoredDurableTab: restored.length > 0, recoveryPending }
}

type HotLike = {
  data: Record<string, unknown>
  dispose: (callback: (data: Record<string, unknown>) => void) => void
  accept: () => void
}

/** Registers one Vite boundary that hands off the latest metadata on replace. */
export function installSessionHmrHandoff(hot: HotLike | undefined): void {
  if (!hot) return
  hot.dispose((data) => {
    const snapshot = captureSessionSnapshot()
    data.editorSession = snapshot
    persistSessionSnapshot(snapshot)
  })
  hot.accept()
}
