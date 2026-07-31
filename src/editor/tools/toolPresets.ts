import { create } from 'zustand'
import { getTip } from '../../imaging/brushes/tipRegistry'
import type { PatternKind } from '../../core/document'
import { useColorStore } from '../color/colorStore'
import {
  useBrushSettingsStore,
  type BrushToolPrefs,
} from './brush/brushSettingsStore'
import { isPressureCurveKind } from './brush/pointerPressure'
import {
  useRetouchSettingsStore,
  type HistorySourceDepth,
  type RetouchPrefs,
} from './retouch/retouchSettingsStore'
import { isLiquifyTool } from './liquify/liquifyTools'
import type { EditorToolId } from '../toolbar/tools'

const STORAGE_KEY = 'happy-shop:tool-presets:v1'
const MAX_PRESETS = 50
const MAX_NAME_LENGTH = 64

/** Brush snapshot — excludes MRU tip list. */
export type BrushPresetSnapshot = Omit<BrushToolPrefs, 'recentTipIds'>

export type ToolPresetSnapshot = {
  brush: BrushPresetSnapshot
  retouch: RetouchPrefs
}

export type ToolPreset = {
  id: string
  name: string
  snapshot: ToolPresetSnapshot
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function readHistorySourceDepth(raw: unknown): HistorySourceDepth {
  if (raw === 'capture') return 'capture'
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw))
  }
  return 'capture'
}

function readPatternKind(raw: unknown): PatternKind {
  return raw === 'stripes' || raw === 'dots' || raw === 'noise' ? raw : 'checker'
}

function normalizeBrushSnapshot(raw: unknown): BrushPresetSnapshot {
  const parsed = (raw && typeof raw === 'object' ? raw : {}) as Partial<BrushPresetSnapshot> & {
    tip?: 'round-hard' | 'round-soft'
  }
  const legacyTipId =
    parsed.tip === 'round-hard' ? 'proc.round-hard' : parsed.tip === 'round-soft' ? 'proc.round-soft' : null
  const tipId =
    typeof parsed.tipId === 'string' && getTip(parsed.tipId)
      ? parsed.tipId
      : legacyTipId && getTip(legacyTipId)
        ? legacyTipId
        : 'proc.round-soft'
  return {
    tipId,
    size: Math.max(1, Math.min(500, typeof parsed.size === 'number' ? parsed.size : 20)),
    hardness: Math.max(0, Math.min(1, typeof parsed.hardness === 'number' ? parsed.hardness : 0.35)),
    opacity: Math.max(0, Math.min(1, typeof parsed.opacity === 'number' ? parsed.opacity : 1)),
    flow: Math.max(0, Math.min(1, typeof parsed.flow === 'number' ? parsed.flow : 1)),
    color: typeof parsed.color === 'string' ? parsed.color : '#000000',
    spacing: Math.max(0.05, Math.min(1, typeof parsed.spacing === 'number' ? parsed.spacing : 0.25)),
    angle: typeof parsed.angle === 'number' && Number.isFinite(parsed.angle) ? parsed.angle % 360 : 0,
    roundness: Math.max(
      0.05,
      Math.min(1, typeof parsed.roundness === 'number' ? parsed.roundness : 1),
    ),
    pressureControlsSize:
      typeof parsed.pressureControlsSize === 'boolean' ? parsed.pressureControlsSize : true,
    pressureControlsOpacity:
      typeof parsed.pressureControlsOpacity === 'boolean'
        ? parsed.pressureControlsOpacity
        : false,
    pressureControlsFlow:
      typeof parsed.pressureControlsFlow === 'boolean' ? parsed.pressureControlsFlow : true,
    pressureSizeCurve: isPressureCurveKind(parsed.pressureSizeCurve)
      ? parsed.pressureSizeCurve
      : 'soft',
    pressureOpacityCurve: isPressureCurveKind(parsed.pressureOpacityCurve)
      ? parsed.pressureOpacityCurve
      : 'linear',
    pressureFlowCurve: isPressureCurveKind(parsed.pressureFlowCurve)
      ? parsed.pressureFlowCurve
      : 'linear',
    pencilPixelPerfect:
      typeof parsed.pencilPixelPerfect === 'boolean'
        ? parsed.pencilPixelPerfect
        : true,
  }
}

function normalizeRetouchSnapshot(raw: unknown): RetouchPrefs {
  const parsed = (raw && typeof raw === 'object' ? raw : {}) as Partial<RetouchPrefs>
  return {
    size: Math.max(1, Math.min(500, parsed.size ?? 40)),
    strength: Math.max(0.01, Math.min(1, parsed.strength ?? 0.5)),
    aligned: parsed.aligned ?? true,
    sampleAllLayers: parsed.sampleAllLayers ?? false,
    historySourceDepth: readHistorySourceDepth(parsed.historySourceDepth),
    patternKind: readPatternKind(parsed.patternKind),
    patternScale: Math.max(1, Math.min(1000, parsed.patternScale ?? 100)),
    patternAngle: parsed.patternAngle ?? 0,
    patternInvert: parsed.patternInvert ?? false,
    range:
      parsed.range === 'shadows' || parsed.range === 'highlights' ? parsed.range : 'midtones',
    protectTones: parsed.protectTones ?? false,
    spongeMode: parsed.spongeMode === 'saturate' ? 'saturate' : 'desaturate',
  }
}

function normalizeSnapshot(raw: unknown): ToolPresetSnapshot {
  const parsed = raw && typeof raw === 'object' ? (raw as Partial<ToolPresetSnapshot>) : {}
  return {
    brush: normalizeBrushSnapshot(parsed.brush),
    retouch: normalizeRetouchSnapshot(parsed.retouch),
  }
}

function isPreset(value: unknown): value is ToolPreset {
  if (!value || typeof value !== 'object') return false
  const preset = value as Partial<ToolPreset>
  return typeof preset.id === 'string' && typeof preset.name === 'string' && !!preset.snapshot
}

/** True when the active tool uses brush or retouch preference stores. */
export function isPaintToolId(toolId: EditorToolId): boolean {
  return (
    toolId === 'brush' ||
    toolId === 'pencil' ||
    toolId === 'eraser' ||
    toolId === 'cloneStamp' ||
    toolId === 'historyBrush' ||
    toolId === 'patternStamp' ||
    toolId === 'spotHealing' ||
    toolId === 'healingBrush' ||
    toolId === 'smudge' ||
    toolId === 'blur' ||
    toolId === 'sharpen' ||
    toolId === 'dodge' ||
    toolId === 'burn' ||
    toolId === 'sponge' ||
    isLiquifyTool(toolId)
  )
}

/** Capture the current brush + retouch stores as a portable JSON snapshot. */
export function captureToolPresetSnapshot(): ToolPresetSnapshot {
  const brush = useBrushSettingsStore.getState()
  const retouch = useRetouchSettingsStore.getState()
  return {
    brush: {
      tipId: brush.tipId,
      size: brush.size,
      hardness: brush.hardness,
      opacity: brush.opacity,
      flow: brush.flow,
      color: brush.color,
      spacing: brush.spacing,
      angle: brush.angle,
      roundness: brush.roundness,
      pressureControlsSize: brush.pressureControlsSize,
      pressureControlsOpacity: brush.pressureControlsOpacity,
      pressureControlsFlow: brush.pressureControlsFlow,
      pressureSizeCurve: brush.pressureSizeCurve,
      pressureOpacityCurve: brush.pressureOpacityCurve,
      pressureFlowCurve: brush.pressureFlowCurve,
      pencilPixelPerfect: brush.pencilPixelPerfect,
    },
    retouch: {
      size: retouch.size,
      strength: retouch.strength,
      aligned: retouch.aligned,
      sampleAllLayers: retouch.sampleAllLayers,
      historySourceDepth: retouch.historySourceDepth,
      patternKind: retouch.patternKind,
      patternScale: retouch.patternScale,
      patternAngle: retouch.patternAngle,
      patternInvert: retouch.patternInvert,
      range: retouch.range,
      protectTones: retouch.protectTones,
      spongeMode: retouch.spongeMode,
    },
  }
}

/** Apply a saved snapshot to brush, retouch, and foreground color stores. */
export function applyToolPresetSnapshot(snapshot: ToolPresetSnapshot): void {
  useRetouchSettingsStore.getState().setPrefs(snapshot.retouch)
  useBrushSettingsStore.getState().setPrefs(snapshot.brush)
  useColorStore.getState().setForeground(snapshot.brush.color)
}

/** User-local named brush/retouch snapshots. Project JSON stays unchanged. */
export function readToolPresets(store: Storage | null = storage()): ToolPreset[] {
  if (!store) return []
  try {
    const parsed: unknown = JSON.parse(store.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isPreset)
      .slice(0, MAX_PRESETS)
      .map((preset) => ({
        id: preset.id,
        name: preset.name,
        snapshot: normalizeSnapshot(preset.snapshot),
      }))
  } catch {
    return []
  }
}

function writeToolPresets(presets: readonly ToolPreset[], store = storage()): void {
  if (!store) return
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(presets.slice(0, MAX_PRESETS)))
  } catch {
    // Storage is optional (private browsing/quota).
  }
}

function notifyPresetsChanged(): void {
  useToolPresetStore.getState().refresh()
}

export function saveToolPreset(
  name: string,
  store: Storage | null = storage(),
): ToolPreset | null {
  const normalized = name.trim().slice(0, MAX_NAME_LENGTH)
  if (!normalized || !store) return null
  const preset: ToolPreset = {
    id: crypto.randomUUID(),
    name: normalized,
    snapshot: captureToolPresetSnapshot(),
  }
  const existing = readToolPresets(store).filter(
    (item) => item.name.localeCompare(normalized, undefined, { sensitivity: 'accent' }) !== 0,
  )
  writeToolPresets([...existing, preset], store)
  notifyPresetsChanged()
  return preset
}

export function deleteToolPreset(id: string, store: Storage | null = storage()): void {
  if (!store) return
  writeToolPresets(readToolPresets(store).filter((preset) => preset.id !== id), store)
  notifyPresetsChanged()
}

export function applyToolPreset(id: string, store: Storage | null = storage()): boolean {
  const preset = readToolPresets(store).find((item) => item.id === id)
  if (!preset) return false
  applyToolPresetSnapshot(preset.snapshot)
  return true
}

type ToolPresetStoreState = {
  presets: ToolPreset[]
  refresh: () => void
}

export const useToolPresetStore = create<ToolPresetStoreState>((set) => ({
  presets: readToolPresets(),
  refresh: () => set({ presets: readToolPresets() }),
}))
