import { describe, expect, test } from 'bun:test'
import { readPencilEngineSettings } from './brushSettingsStore'

describe('readPencilEngineSettings', () => {
  test('returns hard square pixel engine settings', () => {
    const settings = readPencilEngineSettings()
    expect(settings.paintEngine).toBe('pencil')
    expect(settings.hardness).toBe(1)
    expect(settings.spacing).toBe(1)
    expect(settings.roundness).toBe(1)
    expect(settings.pixelPerfect).toBe(true)
  })
})
