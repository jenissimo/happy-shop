import type { BlendMode, LayerLockFlags } from '../../../core/document'
import type { LayersFxEffectRow } from './layersFxTree'

/**
 * Thin row model for the Layers panel. Keeps the UI free of HappyDocument /
 * EditorSession internals so the panel can render against mock data until
 * session wiring is complete.
 */
export type LayersPanelLayer = {
  id: string
  name: string
  visible: boolean
  locked: boolean
  lockFlags: LayerLockFlags
  /** 0–1 */
  opacity: number
  /** Photoshop Fill Opacity (0–1). */
  fillOpacity: number
  blendMode: BlendMode
  hasEffects: boolean
  /** Ordered FX stack rows when `hasEffects` (mirrors Effects panel labels). */
  effects: LayersFxEffectRow[]
  /** Nesting depth (0 = root). */
  depth: number
  /** Parent group id, or null at document root. */
  parentId: string | null
  kind: 'raster' | 'group' | 'adjustment' | 'text' | 'shape'
  /** True when the layer has a mask ref (enabled or not). */
  hasMask: boolean
  /** When hasMask, whether the compositor applies it. */
  maskEnabled: boolean
  /** When hasMask, whether the mask clips post-FX output (PS "Mask Hides Effects"). */
  maskHidesEffects: boolean
  /** True when this layer clips to the sibling immediately beneath it. */
  clipping?: boolean
  /** Only meaningful for groups: false = pass-through, true = flatten-then-FX. */
  isolated?: boolean
}

/**
 * Props/store adapter the panel talks to. Implement against EditorSession,
 * a local mock, or tests — anything that can supply a top-to-bottom list.
 */
export type LayersPanelAdapter = {
  /**
   * Full tree flattened top → bottom (Photoshop visual order), depth-first.
   * The panel hides children of locally collapsed groups.
   */
  layers: LayersPanelLayer[]
  selectedLayerIds: string[]
  selectLayer: (id: string, additive?: boolean) => void
  toggleVisibility: (id: string) => void
  toggleLocked: (id: string) => void
  setLayerLockFlag: (
    id: string,
    flag: keyof LayerLockFlags,
    locked: boolean,
  ) => void
  renameLayer: (id: string, name: string) => void
  setOpacity: (id: string, opacity: number) => void
  setFillOpacity: (id: string, fillOpacity: number) => void
  setBlendMode: (id: string, mode: BlendMode) => void
  setGroupIsolated: (id: string, isolated: boolean) => void
  setMaskHidesEffects: (id: string, maskHidesEffects: boolean) => void
  toggleClippingMask: (id: string) => void
  toggleLayerEffect: (layerId: string, effectId: string) => void
  reorderLayerEffect: (layerId: string, fromIndex: number, toIndex: number) => void
  /**
   * Reorder within the same parent. `visualIndex` is top-to-bottom among
   * siblings (not the full flattened list).
   */
  reorderLayer: (id: string, siblingVisualIndex: number) => void
}

export type LayersPanelProps = {
  /** Defaults to the live EditorSession store adapter. */
  adapter?: LayersPanelAdapter
  /** FX badge / entry — opens Layer Style (stub command OK until M4). */
  onOpenFx?: (layerId: string) => void
}
