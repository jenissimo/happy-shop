import { describe, expect, test } from 'bun:test'
import { createDefaultEffect } from '../../ui/features/layer-style/defaults'
import {
  deleteLayerFxPreset,
  instantiateLayerFxPreset,
  readLayerFxPresets,
  saveLayerFxPreset,
} from './layerFxPresets'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, value),
  }
}

describe('layer FX presets', () => {
  test('saves, replaces by name, and deletes local user presets', () => {
    const store = memoryStorage()
    const stroke = createDefaultEffect('stroke')
    expect(saveLayerFxPreset('  Outline  ', [stroke], store)?.name).toBe('Outline')
    expect(saveLayerFxPreset('Outline', [], store)?.effects).toEqual([])
    expect(readLayerFxPresets(store)).toHaveLength(1)

    const id = readLayerFxPresets(store)[0]!.id
    deleteLayerFxPreset(id, store)
    expect(readLayerFxPresets(store)).toEqual([])
  })

  test('instantiation keeps saved effects immutable and regenerates ids', () => {
    const store = memoryStorage()
    const saved = saveLayerFxPreset('Stroke', [createDefaultEffect('stroke')], store)!
    const applied = instantiateLayerFxPreset(saved)

    expect(applied[0]!.id).not.toBe(saved.effects[0]!.id)
    applied[0]!.enabled = false
    expect(saved.effects[0]!.enabled).toBe(true)
  })
})
