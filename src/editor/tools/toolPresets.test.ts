import { describe, expect, test, beforeEach } from 'bun:test'
import { useBrushSettingsStore } from './brush/brushSettingsStore'
import { useRetouchSettingsStore } from './retouch/retouchSettingsStore'
import { useColorStore } from '../color/colorStore'
import {
  applyToolPresetSnapshot,
  captureToolPresetSnapshot,
  deleteToolPreset,
  readToolPresets,
  saveToolPreset,
  applyToolPreset,
} from './toolPresets'

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

describe('tool presets', () => {
  beforeEach(() => {
    useBrushSettingsStore.setState({
      tipId: 'proc.round-soft',
      size: 20,
      hardness: 0.35,
      opacity: 1,
      flow: 1,
      color: '#000000',
      spacing: 0.25,
      angle: 0,
      roundness: 1,
      pressureControlsSize: true,
      recentTipIds: [],
    })
    useRetouchSettingsStore.setState({
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
    })
    useColorStore.setState({ foreground: '#000000', background: '#ffffff' })
  })

  test('captures brush and retouch stores together', () => {
    useBrushSettingsStore.getState().setPrefs({ size: 88, color: '#ff0000' })
    useRetouchSettingsStore.getState().setPrefs({ size: 120, strength: 0.75 })

    const snapshot = captureToolPresetSnapshot()
    expect(snapshot.brush.size).toBe(88)
    expect(snapshot.brush.color).toBe('#ff0000')
    expect(snapshot.retouch.size).toBe(120)
    expect(snapshot.retouch.strength).toBe(0.75)
    expect(snapshot.brush).not.toHaveProperty('recentTipIds')
  })

  test('saves, replaces by name, applies, and deletes local presets', () => {
    const store = memoryStorage()
    useBrushSettingsStore.getState().setPrefs({ size: 30 })
    expect(saveToolPreset('  Soft Sketch  ', store)?.name).toBe('Soft Sketch')
    expect(readToolPresets(store)).toHaveLength(1)

    useBrushSettingsStore.getState().setPrefs({ size: 99 })
    saveToolPreset('Soft Sketch', store)
    expect(readToolPresets(store)).toHaveLength(1)
    expect(readToolPresets(store)[0]!.snapshot.brush.size).toBe(99)

    applyToolPresetSnapshot(readToolPresets(store)[0]!.snapshot)
    expect(useBrushSettingsStore.getState().size).toBe(99)
    expect(useColorStore.getState().foreground).toBe(
      readToolPresets(store)[0]!.snapshot.brush.color,
    )

    const id = readToolPresets(store)[0]!.id
    expect(applyToolPreset(id, store)).toBe(true)
    deleteToolPreset(id, store)
    expect(readToolPresets(store)).toEqual([])
    expect(applyToolPreset(id, store)).toBe(false)
  })

  test('normalizes invalid stored snapshots on read', () => {
    const store = memoryStorage()
    store.setItem(
      'happy-shop:tool-presets:v1',
      JSON.stringify([
        {
          id: 'preset-1',
          name: 'Broken',
          snapshot: {
            brush: { tipId: 'missing.tip', size: 9999, hardness: 2, color: 123 },
            retouch: { size: -5, strength: 9, range: 'invalid', spongeMode: 'other' },
          },
        },
      ]),
    )

    const [preset] = readToolPresets(store)
    expect(preset!.snapshot.brush.tipId).toBe('proc.round-soft')
    expect(preset!.snapshot.brush.size).toBe(500)
    expect(preset!.snapshot.brush.hardness).toBe(1)
    expect(preset!.snapshot.retouch.size).toBe(1)
    expect(preset!.snapshot.retouch.strength).toBe(1)
    expect(preset!.snapshot.retouch.range).toBe('midtones')
    expect(preset!.snapshot.retouch.spongeMode).toBe('desaturate')
  })
})
