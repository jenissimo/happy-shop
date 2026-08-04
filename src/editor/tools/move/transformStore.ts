import { create } from 'zustand'
import type { LayerId, Transform } from '../../../core/document'
import type { HandleId } from './transformMath'

const SHOW_CONTROLS_KEY = 'happy-shop.move.showTransformControls'
const AUTO_SELECT_KEY = 'happy-shop.move.autoSelectLayer'

function readBoolPref(key: string, defaultValue: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === '0') return false
    if (raw === '1') return true
  } catch {
    /* private mode */
  }
  return defaultValue
}

function persistBoolPref(key: string, enabled: boolean): void {
  try {
    localStorage.setItem(key, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export type FreeTransformSession = {
  /** Layers participating (unlocked transformable selection at enter). */
  layerIds: LayerId[]
  /** Snapshot of each layer transform for Esc cancel. */
  baselines: Record<string, Transform>
}

export type TransformGestureKind = 'move' | 'scale' | 'rotate'

export type TransformOverlayState = {
  /** When set, Free Transform modal session is active (Mod+T). */
  session: FreeTransformSession | null
  /** PS-like "Show Transform Controls" — default ON. */
  showTransformControls: boolean
  /** PS-like Auto-Select — pick topmost layer under click. Default ON. */
  autoSelectLayer: boolean
  /** Live handle highlight / drag affordance for overlay. */
  activeHandle: HandleId | null
  /** True while a pointer gesture is in progress. */
  gesturing: boolean
}

type TransformStore = TransformOverlayState & {
  setShowTransformControls: (on: boolean) => void
  setAutoSelectLayer: (on: boolean) => void
  beginFreeTransformSession: (session: FreeTransformSession) => void
  endFreeTransformSession: () => void
  setActiveHandle: (handle: HandleId | null) => void
  setGesturing: (on: boolean) => void
}

export const useTransformStore = create<TransformStore>((set) => ({
  session: null,
  showTransformControls: readBoolPref(SHOW_CONTROLS_KEY, true),
  autoSelectLayer: readBoolPref(AUTO_SELECT_KEY, true),
  activeHandle: null,
  gesturing: false,

  setShowTransformControls: (on) => {
    persistBoolPref(SHOW_CONTROLS_KEY, on)
    set({ showTransformControls: on })
  },

  setAutoSelectLayer: (on) => {
    persistBoolPref(AUTO_SELECT_KEY, on)
    set({ autoSelectLayer: on })
  },

  beginFreeTransformSession: (session) => set({ session }),

  endFreeTransformSession: () =>
    set({ session: null, activeHandle: null, gesturing: false }),

  setActiveHandle: (handle) => set({ activeHandle: handle }),

  setGesturing: (on) => set({ gesturing: on }),
}))

/**
 * Handles visible when Move tool + preference, or during Free Transform.
 * The session check comes first on purpose: Mod+T must show handles even with
 * "Show Transform Controls" off, without mutating the stored preference — so
 * they disappear again by themselves once the session ends.
 */
export function shouldShowTransformHandles(
  activeToolId: string,
  state: TransformOverlayState = useTransformStore.getState(),
): boolean {
  if (state.session) return true
  return activeToolId === 'move' && state.showTransformControls
}
