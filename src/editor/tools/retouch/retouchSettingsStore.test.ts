import { beforeEach, describe, expect, test } from 'bun:test'
import { useRetouchSettingsStore } from './retouchSettingsStore'

describe('retouchSettingsStore', () => {
  beforeEach(() => {
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
  })

  test('defaults include history capture and checker pattern', () => {
    expect(useRetouchSettingsStore.getState().historySourceDepth).toBe('capture')
    expect(useRetouchSettingsStore.getState().patternKind).toBe('checker')
  })

  test('persists history source depth and pattern prefs', () => {
    useRetouchSettingsStore.getState().setPrefs({
      historySourceDepth: 2,
      patternKind: 'stripes',
      patternScale: 240,
      patternAngle: 45,
      patternInvert: true,
    })
    expect(useRetouchSettingsStore.getState().historySourceDepth).toBe(2)
    expect(useRetouchSettingsStore.getState().patternKind).toBe('stripes')
    expect(useRetouchSettingsStore.getState().patternScale).toBe(240)
    expect(useRetouchSettingsStore.getState().patternAngle).toBe(45)
    expect(useRetouchSettingsStore.getState().patternInvert).toBe(true)
  })

  test('defaults include protect tones off and sponge desaturate', () => {
    expect(useRetouchSettingsStore.getState().protectTones).toBe(false)
    expect(useRetouchSettingsStore.getState().spongeMode).toBe('desaturate')
    expect(useRetouchSettingsStore.getState().sampleAllLayers).toBe(false)
  })

  test('persists protect tones and sponge mode prefs', () => {
    useRetouchSettingsStore.getState().setPrefs({ protectTones: true, spongeMode: 'saturate' })
    expect(useRetouchSettingsStore.getState().protectTones).toBe(true)
    expect(useRetouchSettingsStore.getState().spongeMode).toBe('saturate')
  })
})
