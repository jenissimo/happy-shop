import { create } from 'zustand'
import { getTip } from '../../../imaging/brushes/tipRegistry'
import { PENCIL_TIP_ID } from '../../../imaging/brushes/presets/proc'
import type { BrushSettings } from './BrushToolController'
import {
  isPressureCurveKind,
  type PressureCurveKind,
} from './pointerPressure'

const STORAGE_KEY = 'happy-shop.brush.settings'

export type BrushTipType = 'round-hard' | 'round-soft'

export type BrushToolPrefs = {
  /** Pack-qualified, persisted tip identity. */
  tipId: string
  size: number
  /** 0–1 */
  hardness: number
  /** 0–1 */
  opacity: number
  /** 0–1; currently multiplied with opacity for the engine and preview. */
  flow: number
  color: string
  spacing: number
  /** User rotation relative to the tip's own orientation. */
  angle: number
  /** Minor/major axis ratio. */
  roundness: number
  /** Whether native pen pressure scales brush and eraser diameter. */
  pressureControlsSize: boolean
  /** Whether pen pressure scales per-dab opacity under the stroke ceiling. */
  pressureControlsOpacity: boolean
  /** Whether pen pressure scales per-dab flow buildup. */
  pressureControlsFlow: boolean
  pressureSizeCurve: PressureCurveKind
  pressureOpacityCurve: PressureCurveKind
  pressureFlowCurve: PressureCurveKind
  /** MRU tip ids, newest first. */
  recentTipIds: string[]
  /** Pencil: Bresenham walk with corner-double omission. */
  pencilPixelPerfect: boolean
}

/** Local defaults — do not import `DEFAULT_BRUSH` (circular with BrushToolController). */
const DEFAULT_PREFS: BrushToolPrefs = {
  tipId: 'proc.round-soft',
  size: 20,
  // Round Soft should visibly feather; harder procedural identities remain
  // available as explicit tips.
  hardness: 0.35,
  opacity: 1,
  flow: 1,
  color: '#000000',
  spacing: 0.25,
  angle: 0,
  roundness: 1,
  pressureControlsSize: true,
  pressureControlsOpacity: false,
  pressureControlsFlow: true,
  pressureSizeCurve: 'soft',
  pressureOpacityCurve: 'linear',
  pressureFlowCurve: 'linear',
  recentTipIds: [],
  pencilPixelPerfect: true,
}

function legacyTipHardness(tip: BrushTipType): number {
  return tip === 'round-hard' ? 1 : 0.35
}

function legacyTipId(tip: BrushTipType): string {
  return tip === 'round-hard' ? 'proc.round-hard' : 'proc.round-soft'
}

function clampPrefs(prefs: BrushToolPrefs): BrushToolPrefs {
  return {
    ...prefs,
    size: Math.max(1, Math.min(500, Number.isFinite(prefs.size) ? prefs.size : DEFAULT_PREFS.size)),
    hardness: Math.max(0, Math.min(1, Number.isFinite(prefs.hardness) ? prefs.hardness : DEFAULT_PREFS.hardness)),
    opacity: Math.max(0, Math.min(1, Number.isFinite(prefs.opacity) ? prefs.opacity : DEFAULT_PREFS.opacity)),
    flow: Math.max(0, Math.min(1, Number.isFinite(prefs.flow) ? prefs.flow : DEFAULT_PREFS.flow)),
    spacing: Math.max(0.05, Math.min(1, Number.isFinite(prefs.spacing) ? prefs.spacing : DEFAULT_PREFS.spacing)),
    angle: Number.isFinite(prefs.angle) ? prefs.angle % 360 : 0,
    roundness: Math.max(0.05, Math.min(1, Number.isFinite(prefs.roundness) ? prefs.roundness : DEFAULT_PREFS.roundness)),
    pressureControlsSize:
      typeof prefs.pressureControlsSize === 'boolean'
        ? prefs.pressureControlsSize
        : DEFAULT_PREFS.pressureControlsSize,
    pressureControlsOpacity:
      typeof prefs.pressureControlsOpacity === 'boolean'
        ? prefs.pressureControlsOpacity
        : DEFAULT_PREFS.pressureControlsOpacity,
    pressureControlsFlow:
      typeof prefs.pressureControlsFlow === 'boolean'
        ? prefs.pressureControlsFlow
        : DEFAULT_PREFS.pressureControlsFlow,
    pressureSizeCurve: isPressureCurveKind(prefs.pressureSizeCurve)
      ? prefs.pressureSizeCurve
      : DEFAULT_PREFS.pressureSizeCurve,
    pressureOpacityCurve: isPressureCurveKind(prefs.pressureOpacityCurve)
      ? prefs.pressureOpacityCurve
      : DEFAULT_PREFS.pressureOpacityCurve,
    pressureFlowCurve: isPressureCurveKind(prefs.pressureFlowCurve)
      ? prefs.pressureFlowCurve
      : DEFAULT_PREFS.pressureFlowCurve,
    recentTipIds: prefs.recentTipIds.filter((id) => typeof id === 'string').slice(0, 8),
    pencilPixelPerfect:
      typeof prefs.pencilPixelPerfect === 'boolean'
        ? prefs.pencilPixelPerfect
        : DEFAULT_PREFS.pencilPixelPerfect,
  }
}

function loadPrefs(): BrushToolPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(raw) as Partial<BrushToolPrefs> & {
      tip?: BrushTipType
    }
    const hardness =
      typeof parsed.hardness === 'number'
        ? parsed.hardness
        : parsed.tip
          ? legacyTipHardness(parsed.tip)
          : DEFAULT_PREFS.hardness
    return clampPrefs({
      tipId:
        typeof parsed.tipId === 'string' && getTip(parsed.tipId)
          ? parsed.tipId
          : parsed.tip
            ? legacyTipId(parsed.tip)
            : DEFAULT_PREFS.tipId,
      size: typeof parsed.size === 'number' ? parsed.size : DEFAULT_PREFS.size,
      hardness,
      opacity:
        typeof parsed.opacity === 'number'
          ? parsed.opacity
          : DEFAULT_PREFS.opacity,
      flow: typeof parsed.flow === 'number' ? parsed.flow : DEFAULT_PREFS.flow,
      color:
        typeof parsed.color === 'string' ? parsed.color : DEFAULT_PREFS.color,
      spacing:
        typeof parsed.spacing === 'number'
          ? parsed.spacing
          : DEFAULT_PREFS.spacing,
      angle: typeof parsed.angle === 'number' ? parsed.angle : DEFAULT_PREFS.angle,
      roundness:
        typeof parsed.roundness === 'number'
          ? parsed.roundness
          : DEFAULT_PREFS.roundness,
      pressureControlsSize:
        typeof parsed.pressureControlsSize === 'boolean'
          ? parsed.pressureControlsSize
          : DEFAULT_PREFS.pressureControlsSize,
      pressureControlsOpacity:
        typeof parsed.pressureControlsOpacity === 'boolean'
          ? parsed.pressureControlsOpacity
          : DEFAULT_PREFS.pressureControlsOpacity,
      pressureControlsFlow:
        typeof parsed.pressureControlsFlow === 'boolean'
          ? parsed.pressureControlsFlow
          : DEFAULT_PREFS.pressureControlsFlow,
      pressureSizeCurve: isPressureCurveKind(parsed.pressureSizeCurve)
        ? parsed.pressureSizeCurve
        : DEFAULT_PREFS.pressureSizeCurve,
      pressureOpacityCurve: isPressureCurveKind(parsed.pressureOpacityCurve)
        ? parsed.pressureOpacityCurve
        : DEFAULT_PREFS.pressureOpacityCurve,
      pressureFlowCurve: isPressureCurveKind(parsed.pressureFlowCurve)
        ? parsed.pressureFlowCurve
        : DEFAULT_PREFS.pressureFlowCurve,
      pencilPixelPerfect:
        typeof parsed.pencilPixelPerfect === 'boolean'
          ? parsed.pencilPixelPerfect
          : DEFAULT_PREFS.pencilPixelPerfect,
      recentTipIds: Array.isArray(parsed.recentTipIds)
        ? parsed.recentTipIds.filter((id): id is string => typeof id === 'string').slice(0, 8)
        : [],
    })
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

function persist(prefs: BrushToolPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* private mode */
  }
}

type BrushSettingsState = BrushToolPrefs & {
  setPrefs: (patch: Partial<BrushToolPrefs>) => void
  /** Engine-facing slice (mode is set by the active tool). */
  toEngineSettings: (mode: BrushSettings['mode']) => BrushSettings
}

export const useBrushSettingsStore = create<BrushSettingsState>((set, get) => ({
  ...loadPrefs(),
  setPrefs: (patch) => {
    set((state) => {
      const next: BrushToolPrefs = { ...state, ...patch }
      if (patch.tipId) {
        next.recentTipIds = [
          patch.tipId,
          ...next.recentTipIds.filter((id) => id !== patch.tipId),
        ].slice(0, 8)
      }
      const clamped = clampPrefs(next)
      persist(clamped)
      return clamped
    })
  },
  toEngineSettings: (mode) => {
    const s = get()
    return {
      size: s.size,
      opacity: s.opacity,
      flow: s.flow,
      hardness: s.hardness,
      color: s.color,
      mode,
      spacing: s.spacing,
      tipId: s.tipId,
      angle: s.angle,
      roundness: s.roundness,
      pressureControlsSize: s.pressureControlsSize,
      pressureControlsOpacity: s.pressureControlsOpacity,
      pressureControlsFlow: s.pressureControlsFlow,
      pressureSizeCurve: s.pressureSizeCurve,
      pressureOpacityCurve: s.pressureOpacityCurve,
      pressureFlowCurve: s.pressureFlowCurve,
      paintEngine: 'brush',
      pixelPerfect: false,
    }
  },
}))

export function readBrushEngineSettings(
  mode: BrushSettings['mode'],
): BrushSettings {
  return useBrushSettingsStore.getState().toEngineSettings(mode)
}

export function readPencilEngineSettings(): BrushSettings {
  const s = useBrushSettingsStore.getState()
  return {
    ...s.toEngineSettings('paint'),
    paintEngine: 'pencil',
    pixelPerfect: s.pencilPixelPerfect,
    hardness: 1,
    tipId: PENCIL_TIP_ID,
    spacing: 1,
    roundness: 1,
    angle: 0,
  }
}

export { PENCIL_TIP_ID }
