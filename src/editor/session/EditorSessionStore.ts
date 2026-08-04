import { create } from 'zustand'
import {
  createEmptyDocument,
  getChildrenIds,
  getLayer,
  renameLayer as renameLayerOp,
  reorderLayer as reorderLayerOp,
  setBlendMode as setBlendModeOp,
  setLocked as setLockedOp,
  setOpacity as setOpacityOp,
  setFillOpacity as setFillOpacityOp,
  setGroupIsolated as setGroupIsolatedOp,
  setMaskHidesEffects as setMaskHidesEffectsOp,
  toggleClippingMask as toggleClippingMaskOp,
  setLayerLockFlag as setLayerLockFlagOp,
  setTransform as setTransformOp,
  setVisibility as setVisibilityOp,
  type BlendMode,
  type HappyDocument,
  type Layer,
  type LayerId,
  type LayerLockFlags,
  type Transform,
} from '../../core/document'
import {
  DEFAULT_TOOL_ID,
  type EditorToolId,
} from '../toolbar/tools'
import type { CameraState } from '../viewport/ViewportCamera'
import { documentHistory } from './documentHistory'
import {
  commitDocumentMutation,
  normalizeLayerSelection,
  syncActiveTabMirror,
} from './documentTransaction'
import { hydrateWorkPathFromDocument } from '../tools/paths/pathDocumentSync'
import { rehydrateDocumentGoogleFonts } from '../tools/text/rehydrateDocumentGoogleFonts'

// Re-exported from their new home in `documentTransaction` so the historical
// import sites (DocumentTabManager, layer commands, …) keep working.
export { normalizeLayerSelection, setActiveTabSyncHandler } from './documentTransaction'

/** Optional viewport camera preferences (not a live camera — that lives in ViewportHost). */
export type SessionCameraPrefs = {
  /** When true, ViewportHost may fit-to-view on the next document id change. */
  fitOnLoad: boolean
  /** Last stable camera frame; never includes a live Pixi/DOM handle. */
  camera?: CameraState
}

export type SessionProjectBinding = {
  /** Absolute `.happyshop` directory path when bound; null = unsaved. */
  projectPath: string | null
  revision: string | null
}

/**
 * Thin editor session store (SPEC §6 "EditorSession + Commands", §15 zustand).
 * Holds document *metadata* + UI selection — never pixel buffers (raster bytes
 * stay in `RasterSurfaceStore`/imaging worker). Mutations push patch-based
 * history entries (SPEC §12).
 */
export interface EditorSessionState {
  document: HappyDocument
  selectedLayerIds: LayerId[]
  dirty: boolean
  cameraPrefs: SessionCameraPrefs
  project: SessionProjectBinding
  /** Mirrors `documentHistory.version` for React subscriptions. */
  historyVersion: number
  /** Bumps when raster bitmaps change without metadata edits (brush, etc.). */
  rasterEpoch: number
  /** Active tool from the left Tools strip (stubs until M3 controllers). */
  activeToolId: EditorToolId

  setDocument: (document: HappyDocument, options?: { dirty?: boolean; clearHistory?: boolean }) => void
  markClean: () => void
  bindProject: (binding: Partial<SessionProjectBinding>) => void
  setCameraPrefs: (patch: Partial<SessionCameraPrefs>) => void
  setActiveToolId: (id: EditorToolId) => void
  bumpRasterEpoch: () => void
  selectLayer: (id: LayerId | null, additive?: boolean) => void
  clearSelection: () => void
  toggleVisibility: (id: LayerId) => void
  toggleLocked: (id: LayerId) => void
  setLayerLockFlag: (id: LayerId, flag: keyof LayerLockFlags, locked: boolean) => void
  setOpacity: (id: LayerId, opacity: number) => void
  setFillOpacity: (id: LayerId, fillOpacity: number) => void
  setBlendMode: (id: LayerId, mode: BlendMode) => void
  setGroupIsolated: (id: LayerId, isolated: boolean) => void
  setMaskHidesEffects: (id: LayerId, maskHidesEffects: boolean) => void
  toggleClippingMask: (id: LayerId) => void
  renameLayer: (id: LayerId, name: string) => void
  setTransform: (id: LayerId, patch: Partial<Transform>) => void
  /** `visualIndex` is top-to-bottom UI order (Photoshop convention), not the
   * bottom-to-top data order `children` uses internally. */
  reorderLayer: (id: LayerId, visualIndex: number) => void
  undo: () => Promise<boolean>
  redo: () => Promise<boolean>
  /** History panel: jump so undo stack length equals `depth` (0 = document open). */
  jumpToHistoryDepth: (depth: number) => Promise<boolean>
}

function commit(
  label: string,
  mutator: (doc: HappyDocument) => HappyDocument,
  mergeKey?: string,
): void {
  commitDocumentMutation(label, mutator, { mergeKey })
}

/**
 * Starts empty; `EditorApp` hydrates a demo `HappyDocument` (placeholder
 * raster layers) after mount — see `createDemoHappyDocument`. Synchronous
 * so the store never needs an async initializer.
 */
export const useEditorSessionStore = create<EditorSessionState>((set, get) => ({
  document: createEmptyDocument({ name: 'Untitled' }),
  selectedLayerIds: [],
  dirty: false,
  cameraPrefs: { fitOnLoad: true },
  project: { projectPath: null, revision: null },
  historyVersion: 0,
  rasterEpoch: 0,
  activeToolId: DEFAULT_TOOL_ID,

  setDocument: (document, options) => {
    if (options?.clearHistory !== false) {
      documentHistory.clear()
    }
    set({
      document,
      selectedLayerIds: normalizeLayerSelection(document, []),
      dirty: options?.dirty ?? false,
      historyVersion: documentHistory.version,
    })
    hydrateWorkPathFromDocument(document)
    void rehydrateDocumentGoogleFonts(document)
  },

  markClean: () => {
    set({ dirty: false })
    syncActiveTabMirror()
  },

  bindProject: (binding) => {
    set((state) => ({
      project: { ...state.project, ...binding },
    }))
    syncActiveTabMirror()
  },

  setCameraPrefs: (patch) =>
    set((state) => ({ cameraPrefs: { ...state.cameraPrefs, ...patch } })),

  setActiveToolId: (id) => set({ activeToolId: id }),

  bumpRasterEpoch: () => set((state) => ({ rasterEpoch: state.rasterEpoch + 1 })),

  selectLayer: (id, additive = false) =>
    set((state) => {
      if (id == null || !state.document.layers[id]) {
        return {
          selectedLayerIds: normalizeLayerSelection(
            state.document,
            state.selectedLayerIds,
          ),
        }
      }
      if (additive) {
        const withoutId = state.selectedLayerIds.filter((x) => x !== id)
        return {
          selectedLayerIds: normalizeLayerSelection(
            state.document,
            state.selectedLayerIds.includes(id)
              ? withoutId
              : [...state.selectedLayerIds, id],
          ),
        }
      }
      return { selectedLayerIds: [id] }
    }),

  clearSelection: () =>
    set((state) => ({
      selectedLayerIds: normalizeLayerSelection(state.document, []),
    })),

  toggleVisibility: (id) => {
    const layer = getLayer(get().document, id)
    if (!layer) return
    commit('Toggle Visibility', (doc) =>
      setVisibilityOp(doc, id, !layer.visible),
    )
  },

  toggleLocked: (id) => {
    const layer = getLayer(get().document, id)
    if (!layer) return
    commit('Toggle Lock', (doc) => setLockedOp(doc, id, !layer.locked))
  },

  setLayerLockFlag: (id, flag, locked) => {
    commit(
      locked ? `Lock ${flag}` : `Unlock ${flag}`,
      (doc) => setLayerLockFlagOp(doc, id, flag, locked),
    )
  },

  setOpacity: (id, opacity) => {
    commit(
      'Opacity',
      (doc) => setOpacityOp(doc, id, opacity),
      `opacity:${id}`,
    )
  },

  setFillOpacity: (id, fillOpacity) => {
    commit(
      'Fill Opacity',
      (doc) => setFillOpacityOp(doc, id, fillOpacity),
      `fillOpacity:${id}`,
    )
  },

  setBlendMode: (id, mode) => {
    commit('Blend Mode', (doc) => setBlendModeOp(doc, id, mode))
  },

  setGroupIsolated: (id, isolated) => {
    commit(
      isolated ? 'Isolate Group' : 'Un-isolate Group',
      (doc) => setGroupIsolatedOp(doc, id, isolated),
    )
  },

  setMaskHidesEffects: (id, maskHidesEffects) => {
    commit(
      maskHidesEffects ? 'Mask Clips Effects' : 'Mask Respects Effects',
      (doc) => setMaskHidesEffectsOp(doc, id, maskHidesEffects),
    )
  },

  toggleClippingMask: (id) => {
    const layer = get().document.layers[id]
    if (!layer) return
    commit(layer.clipping ? 'Release Clipping Mask' : 'Create Clipping Mask', (doc) =>
      toggleClippingMaskOp(doc, id),
    )
  },

  renameLayer: (id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    commit('Rename Layer', (doc) => renameLayerOp(doc, id, trimmed))
  },

  setTransform: (id, patch) => {
    commit(
      'Transform',
      (doc) => setTransformOp(doc, id, patch),
      `transform:${id}`,
    )
  },

  reorderLayer: (id, visualIndex) => {
    const state = get()
    const layer = getLayer(state.document, id)
    if (!layer) return
    const dataChildren = getChildrenIds(state.document, layer.parentId)
    if (!dataChildren) return

    const visualChildren = [...dataChildren].reverse()
    const withoutMoved = visualChildren.filter((childId) => childId !== id)
    const clamped = Math.max(0, Math.min(visualIndex, withoutMoved.length))
    withoutMoved.splice(clamped, 0, id)
    const newDataChildren = [...withoutMoved].reverse()
    const newDataIndex = newDataChildren.indexOf(id)

    commit('Reorder Layer', (doc) => reorderLayerOp(doc, id, newDataIndex))
  },

  undo: async () => {
    const ok = await documentHistory.undo()
    if (ok) {
      set((state) => ({
        historyVersion: documentHistory.version,
        dirty: true,
        selectedLayerIds: normalizeLayerSelection(
          state.document,
          state.selectedLayerIds,
        ),
      }))
      syncActiveTabMirror()
    }
    return ok
  },

  redo: async () => {
    const ok = await documentHistory.redo()
    if (ok) {
      set((state) => ({
        historyVersion: documentHistory.version,
        dirty: true,
        selectedLayerIds: normalizeLayerSelection(
          state.document,
          state.selectedLayerIds,
        ),
      }))
      syncActiveTabMirror()
    }
    return ok
  },

  jumpToHistoryDepth: async (depth) => {
    const before = documentHistory.version
    const ok = await documentHistory.jumpToUndoDepth(depth)
    if (ok && documentHistory.version !== before) {
      set((state) => ({
        historyVersion: documentHistory.version,
        dirty: true,
        selectedLayerIds: normalizeLayerSelection(
          state.document,
          state.selectedLayerIds,
        ),
      }))
      syncActiveTabMirror()
    } else if (ok) {
      set((state) => ({
        historyVersion: documentHistory.version,
        selectedLayerIds: normalizeLayerSelection(
          state.document,
          state.selectedLayerIds,
        ),
      }))
    }
    return ok
  },
}))

export function getSelectedLayer(state: EditorSessionState): Layer | null {
  const id = state.selectedLayerIds[0]
  if (!id) return null
  return getLayer(state.document, id) ?? null
}

/** Live snapshot for callers outside React (e.g. export commands later). */
export function getEditorSessionSnapshot(): EditorSessionState {
  return useEditorSessionStore.getState()
}
