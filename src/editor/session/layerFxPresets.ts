import { createLayerId, type LayerEffect } from '../../core/document'

const STORAGE_KEY = 'happy-shop:layer-fx-presets:v1'
const MAX_PRESETS = 50
const MAX_NAME_LENGTH = 64

export type LayerFxPreset = {
  id: string
  name: string
  effects: LayerEffect[]
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function isPreset(value: unknown): value is LayerFxPreset {
  if (!value || typeof value !== 'object') return false
  const preset = value as Partial<LayerFxPreset>
  return (
    typeof preset.id === 'string' &&
    typeof preset.name === 'string' &&
    Array.isArray(preset.effects)
  )
}

/** User-local named FX stacks. Project files remain portable and unchanged. */
export function readLayerFxPresets(store: Storage | null = storage()): LayerFxPreset[] {
  if (!store) return []
  try {
    const parsed: unknown = JSON.parse(store.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed)
      ? parsed.filter(isPreset).slice(0, MAX_PRESETS).map((preset) => structuredClone(preset))
      : []
  } catch {
    return []
  }
}

function writeLayerFxPresets(presets: readonly LayerFxPreset[], store = storage()): void {
  if (!store) return
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(presets.slice(0, MAX_PRESETS)))
  } catch {
    // Storage is optional (private browsing/quota); FX editing must still work.
  }
}

export function saveLayerFxPreset(
  name: string,
  effects: readonly LayerEffect[],
  store: Storage | null = storage(),
): LayerFxPreset | null {
  const normalized = name.trim().slice(0, MAX_NAME_LENGTH)
  if (!normalized || !store) return null
  const preset: LayerFxPreset = {
    id: crypto.randomUUID(),
    name: normalized,
    effects: structuredClone([...effects]),
  }
  const existing = readLayerFxPresets(store).filter(
    (item) => item.name.localeCompare(normalized, undefined, { sensitivity: 'accent' }) !== 0,
  )
  writeLayerFxPresets([...existing, preset], store)
  return preset
}

export function deleteLayerFxPreset(id: string, store: Storage | null = storage()): void {
  if (!store) return
  writeLayerFxPresets(readLayerFxPresets(store).filter((preset) => preset.id !== id), store)
}

/** Applying a preset never shares effect node ids with its saved source. */
export function instantiateLayerFxPreset(preset: LayerFxPreset): LayerEffect[] {
  return structuredClone(preset.effects).map((effect) => ({ ...effect, id: createLayerId() }))
}
