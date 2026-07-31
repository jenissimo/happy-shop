import type {
  LassoMode,
  MarqueeShape,
  MarqueeStyle,
} from './selectionToolStore'

const KEY = 'happy-shop.selection-tool-variants'

export type SelectionToolPrefs = {
  marqueeShape?: MarqueeShape
  marqueeStyle?: MarqueeStyle
  fixedMarqueeWidth?: number
  fixedMarqueeHeight?: number
  lassoMode?: LassoMode
  featherRadius?: number
  antiAlias?: boolean
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function isMarqueeShape(value: unknown): value is MarqueeShape {
  return value === 'rect' || value === 'ellipse'
}

function isMarqueeStyle(value: unknown): value is MarqueeStyle {
  return (
    value === 'normal' ||
    value === 'fixedSize' ||
    value === 'singleRow' ||
    value === 'singleColumn' ||
    value === 'singlePixel'
  )
}

function isFixedMarqueeSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 10000
}

function isLassoMode(value: unknown): value is LassoMode {
  return value === 'freehand' || value === 'polygonal' || value === 'magnetic'
}

function isFeatherRadius(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 250
}

/** Read only valid persisted variants; safe in test and restricted-storage contexts. */
export function readSelectionToolPrefs(
  storage: StorageLike | null =
    typeof localStorage === 'undefined' ? null : localStorage,
): SelectionToolPrefs {
  try {
    if (!storage) return {}
    const value: unknown = JSON.parse(storage.getItem(KEY) ?? '{}')
    if (!value || typeof value !== 'object') return {}
    const prefs = value as Record<string, unknown>
    return {
      ...(isMarqueeShape(prefs.marqueeShape)
        ? { marqueeShape: prefs.marqueeShape }
        : {}),
      ...(isMarqueeStyle(prefs.marqueeStyle)
        ? { marqueeStyle: prefs.marqueeStyle }
        : {}),
      ...(isFixedMarqueeSize(prefs.fixedMarqueeWidth)
        ? { fixedMarqueeWidth: prefs.fixedMarqueeWidth }
        : {}),
      ...(isFixedMarqueeSize(prefs.fixedMarqueeHeight)
        ? { fixedMarqueeHeight: prefs.fixedMarqueeHeight }
        : {}),
      ...(isLassoMode(prefs.lassoMode) ? { lassoMode: prefs.lassoMode } : {}),
      ...(isFeatherRadius(prefs.featherRadius)
        ? { featherRadius: prefs.featherRadius }
        : {}),
      ...(typeof prefs.antiAlias === 'boolean' ? { antiAlias: prefs.antiAlias } : {}),
    }
  } catch {
    return {}
  }
}

export function persistSelectionToolPrefs(
  patch: SelectionToolPrefs,
  storage: StorageLike | null =
    typeof localStorage === 'undefined' ? null : localStorage,
): void {
  try {
    if (!storage) return
    storage.setItem(
      KEY,
      JSON.stringify({ ...readSelectionToolPrefs(storage), ...patch }),
    )
  } catch {
    // Private browsing, tests, or disabled storage: retain the in-memory choice.
  }
}
