import type { DockviewApi, IDockviewPanel } from 'dockview-react'

/** Bumped when the serialized dock layout contract changes. */
export const DOCK_LAYOUT_VERSION = 11

export const DOCK_LAYOUT_VERSION_KEY = 'dockLayoutVersion'
export const WORKSPACE_LAYOUT_ID_KEY = 'workspaceLayoutId'

type RightDockPanelId =
  | 'inspector'
  | 'hierarchy'
  | 'history'
  | 'navigator'
  | 'effects'
  | 'character'
  | 'paragraph'
  | 'paths'
  | 'info'
  | 'swatches'
  | 'brushes'

/** Upper right palette well (classic PS: Navigator / Info / Options). */
export const RIGHT_DOCK_TOP_STACK: readonly RightDockPanelId[] = [
  'navigator',
  'info',
  'paths',
  'effects',
  'character',
  'paragraph',
]

/** Lower right palette well (classic PS: Color / Swatches / Brushes → Properties / Layers / History). */
export const RIGHT_DOCK_BOTTOM_STACK: readonly RightDockPanelId[] = [
  'inspector',
  'hierarchy',
  'history',
  'swatches',
  'brushes',
]

export const RIGHT_DOCK_PANEL_IDS: readonly RightDockPanelId[] = [
  ...RIGHT_DOCK_TOP_STACK,
  ...RIGHT_DOCK_BOTTOM_STACK,
]

export function getRightDockStack(panelId: string): 'top' | 'bottom' | null {
  if ((RIGHT_DOCK_TOP_STACK as readonly string[]).includes(panelId)) return 'top'
  if ((RIGHT_DOCK_BOTTOM_STACK as readonly string[]).includes(panelId)) return 'bottom'
  return null
}

export const WORKSPACE_LAYOUTS = {
  essentials: {
    id: 'essentials',
    title: 'Essentials',
    activePanel: 'hierarchy',
    /** Tab order within each stack; Properties-first in the lower well. */
    topStack: ['navigator', 'info', 'paths', 'effects', 'character', 'paragraph'] satisfies readonly RightDockPanelId[],
    bottomStack: ['inspector', 'hierarchy', 'history', 'swatches', 'brushes'] satisfies readonly RightDockPanelId[],
    rightDockWidth: 280,
    bottomStackHeight: 420,
  },
  painting: {
    id: 'painting',
    title: 'Painting',
    activePanel: 'navigator',
    /** Navigator-first in the upper well (classic painting stack). */
    topStack: ['navigator', 'info', 'paths', 'effects', 'character', 'paragraph'] satisfies readonly RightDockPanelId[],
    bottomStack: ['swatches', 'brushes', 'hierarchy', 'history', 'inspector'] satisfies readonly RightDockPanelId[],
    rightDockWidth: 260,
    bottomStackHeight: 400,
  },
  typography: {
    id: 'typography',
    title: 'Typography',
    activePanel: 'character',
    topStack: ['character', 'paragraph', 'paths', 'navigator', 'info', 'effects'] satisfies readonly RightDockPanelId[],
    bottomStack: ['inspector', 'hierarchy', 'history', 'swatches', 'brushes'] satisfies readonly RightDockPanelId[],
    rightDockWidth: 300,
    bottomStackHeight: 380,
  },
  pixelArt: {
    id: 'pixelArt',
    title: 'Pixel Art',
    activePanel: 'hierarchy',
    /** Navigator-first; Character deprioritized for type panels. */
    topStack: ['navigator', 'info', 'paths', 'effects', 'paragraph', 'character'] satisfies readonly RightDockPanelId[],
    /** Layers + color/tool wells first (classic pixel stack). */
    bottomStack: ['hierarchy', 'swatches', 'brushes', 'history', 'inspector'] satisfies readonly RightDockPanelId[],
    rightDockWidth: 260,
    bottomStackHeight: 400,
  },
} as const

export type WorkspaceLayoutId = keyof typeof WORKSPACE_LAYOUTS

/** Optional view prefs applied when switching to a named preset. */
export type WorkspaceViewPrefs = {
  pixelatedPreview?: boolean
  showPixelGrid?: boolean
  /** View → Actual Pixels (100% zoom) when the view zoom command is available. */
  actualPixels?: boolean
}

export const WORKSPACE_VIEW_PREFS: Partial<
  Record<WorkspaceLayoutId, WorkspaceViewPrefs>
> = {
  pixelArt: { pixelatedPreview: true, showPixelGrid: true, actualPixels: true },
}

/** Stable preset order for menus and the title-bar workspace picker. */
export const WORKSPACE_PRESET_ORDER: readonly WorkspaceLayoutId[] = [
  'essentials',
  'painting',
  'typography',
  'pixelArt',
]

export function applyWorkspaceViewPrefs(
  layoutId: WorkspaceLayoutId,
  apply: {
    setPixelatedPreview: (enabled: boolean) => void
    setShowPixelGrid: (enabled: boolean) => void
    setActualPixels?: () => void
  },
): void {
  const prefs = WORKSPACE_VIEW_PREFS[layoutId]
  if (!prefs) return
  if (typeof prefs.pixelatedPreview === 'boolean') {
    apply.setPixelatedPreview(prefs.pixelatedPreview)
  }
  if (typeof prefs.showPixelGrid === 'boolean') {
    apply.setShowPixelGrid(prefs.showPixelGrid)
  }
  if (prefs.actualPixels === true && apply.setActualPixels) {
    apply.setActualPixels()
  }
}

export function isWorkspaceLayoutId(value: unknown): value is WorkspaceLayoutId {
  return typeof value === 'string' && value in WORKSPACE_LAYOUTS
}

/**
 * Legacy workspaces predate named presets. Their serialized dock arrangement
 * remains authoritative; label it Essentials rather than rebuilding it.
 */
export function readWorkspaceLayoutId(
  preferences: Record<string, unknown> | undefined | null,
): WorkspaceLayoutId {
  const value = preferences?.[WORKSPACE_LAYOUT_ID_KEY]
  return isWorkspaceLayoutId(value) ? value : 'essentials'
}

/**
 * Document identity lives in `DocumentTabStrip` (Demo / multi-doc), not in
 * dockview's native panel title bar. Hide the viewport group's header so we
 * don't show a redundant "Document" tab + close X under the doc strip.
 * Lock the group so other panels can't stack into a headerless group.
 */
export function hideViewportDockChrome(api: DockviewApi): void {
  const viewport = api.getPanel('viewport')
  if (!viewport) return
  viewport.group.header.hidden = true
  viewport.group.api.locked = true
}

const PANEL_DEFS = {
  inspector: { component: 'inspector' as const, title: 'Properties' },
  hierarchy: { component: 'hierarchy' as const, title: 'Layers' },
  history: { component: 'history' as const, title: 'History' },
  navigator: { component: 'navigator' as const, title: 'Navigator' },
  effects: { component: 'effects' as const, title: 'Effects' },
  character: { component: 'character' as const, title: 'Character' },
  paragraph: { component: 'paragraph' as const, title: 'Paragraph' },
  paths: { component: 'paths' as const, title: 'Paths' },
  info: { component: 'info' as const, title: 'Info' },
  swatches: { component: 'swatches' as const, title: 'Swatches' },
  brushes: { component: 'brushes' as const, title: 'Brushes' },
} as const

function addStackPanels(
  api: DockviewApi,
  panelIds: readonly RightDockPanelId[],
  position:
    | { referencePanel: IDockviewPanel; direction: 'right' | 'below' }
    | { referencePanel: IDockviewPanel },
  sizing: { initialWidth?: number; initialHeight?: number },
): Partial<Record<RightDockPanelId, { focus: () => void }>> {
  const panelRefs: Partial<Record<RightDockPanelId, { focus: () => void }>> = {}
  let stackAnchorId: RightDockPanelId | null = null

  for (const panelId of panelIds) {
    const def = PANEL_DEFS[panelId]
    const isFirstInStack = stackAnchorId === null
    const panel = api.addPanel({
      id: panelId,
      component: def.component,
      title: def.title,
      position: isFirstInStack
        ? position
        : { referencePanel: api.getPanel(stackAnchorId!)! },
      inactive: !isFirstInStack,
      initialWidth: isFirstInStack ? sizing.initialWidth : undefined,
      initialHeight: isFirstInStack ? sizing.initialHeight : undefined,
    })
    if (isFirstInStack) stackAnchorId = panelId
    panelRefs[panelId] = panel
  }

  return panelRefs
}

/**
 * Each preset uses stable panel ids and a dual-stack right dock (upper nav /
 * utility well above lower Properties / Layers / History). Preset differs by
 * tab order within each stack, default focus, width, and split height.
 * Document/tool chrome stays outside Dockview.
 */
export function buildWorkspaceLayout(
  api: DockviewApi,
  layoutId: WorkspaceLayoutId,
): void {
  const preset = WORKSPACE_LAYOUTS[layoutId]
  api.clear()
  const viewport = api.addPanel({
    id: 'viewport',
    component: 'viewport',
    // Internal/a11y label only — header is hidden (see hideViewportDockChrome).
    title: 'Document',
  })
  hideViewportDockChrome(api)

  const topRefs = addStackPanels(
    api,
    preset.topStack,
    { referencePanel: viewport, direction: 'right' },
    { initialWidth: preset.rightDockWidth },
  )

  const topAnchor = api.getPanel(preset.topStack[0])!
  const bottomRefs = addStackPanels(
    api,
    preset.bottomStack,
    { referencePanel: topAnchor, direction: 'below' },
    { initialHeight: preset.bottomStackHeight },
  )

  const panelRefs = { ...topRefs, ...bottomRefs }
  panelRefs[preset.activePanel]?.focus()
}

/** Backward-compatible name for the Essentials preset. */
export function buildDefaultLayout(api: DockviewApi): void {
  buildWorkspaceLayout(api, 'essentials')
}

export function readDockLayoutVersion(
  preferences: Record<string, unknown> | undefined | null,
): number | null {
  const raw = preferences?.[DOCK_LAYOUT_VERSION_KEY]
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

/**
 * Old versions are migrated in place: Dockview JSON is still valid and may
 * contain a user's arrangement, so only an absent layout needs rebuilding.
 * `fromJSON` remains guarded by the caller for malformed data.
 */
export function shouldApplyDefaultLayout(
  layout: unknown,
  _preferences: Record<string, unknown> | undefined | null,
): boolean {
  return layout == null
}
