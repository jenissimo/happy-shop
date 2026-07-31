import { create } from 'zustand'
import type { PatternKind } from '../../../core/document'

const STORAGE_KEY = 'happy-shop.retouch.settings'

/** History Brush source: capture on first use, or a 0-based history depth. */
export type HistorySourceDepth = 'capture' | number

export type RetouchPrefs = {
  size: number
  strength: number
  aligned: boolean
  /** When true, Clone/Healing Brush Alt-source reads merged visible pixels. */
  sampleAllLayers: boolean
  /** History Brush: first-use capture or a specific history depth (0 = document open). */
  historySourceDepth: HistorySourceDepth
  /** Pattern Stamp procedural source (shared with PatternGrid / overlay patterns). */
  patternKind: PatternKind
  patternScale: number
  patternAngle: number
  patternInvert: boolean
  range: 'shadows' | 'midtones' | 'highlights'
  protectTones: boolean
  spongeMode: 'desaturate' | 'saturate'
}

const defaults: RetouchPrefs = {
  size: 40,
  strength: 0.5,
  aligned: true,
  sampleAllLayers: false,
  historySourceDepth: 'capture',
  patternKind: 'checker',
  patternScale: 100,
  patternAngle: 0,
  patternInvert: false,
  range: 'midtones',
  protectTones: false,
  spongeMode: 'desaturate',
}

function readHistorySourceDepth(raw: unknown): HistorySourceDepth {
  if (raw === 'capture') return 'capture'
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw))
  }
  return defaults.historySourceDepth
}

function readPatternKind(raw: unknown): PatternKind {
  return raw === 'stripes' || raw === 'dots' || raw === 'noise' ? raw : defaults.patternKind
}

function read(): RetouchPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<RetouchPrefs>
    return {
      size: Math.max(1, Math.min(500, raw.size ?? defaults.size)),
      strength: Math.max(0.01, Math.min(1, raw.strength ?? defaults.strength)),
      aligned: raw.aligned ?? defaults.aligned,
      sampleAllLayers: raw.sampleAllLayers ?? defaults.sampleAllLayers,
      historySourceDepth: readHistorySourceDepth(raw.historySourceDepth),
      patternKind: readPatternKind(raw.patternKind),
      patternScale: Math.max(1, Math.min(1000, raw.patternScale ?? defaults.patternScale)),
      patternAngle: raw.patternAngle ?? defaults.patternAngle,
      patternInvert: raw.patternInvert ?? defaults.patternInvert,
      range: raw.range === 'shadows' || raw.range === 'highlights'
        ? raw.range
        : defaults.range,
      protectTones: raw.protectTones ?? defaults.protectTones,
      spongeMode: raw.spongeMode === 'saturate' ? 'saturate' : defaults.spongeMode,
    }
  } catch { return defaults }
}

export const useRetouchSettingsStore = create<RetouchPrefs & { setPrefs: (patch: Partial<RetouchPrefs>) => void }>((set) => ({
  ...read(),
  setPrefs: (patch) => set((state) => {
    const next = { ...state, ...patch }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* unavailable */ }
    return next
  }),
}))
