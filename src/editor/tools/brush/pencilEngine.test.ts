import { beforeEach, describe, expect, test } from 'bun:test'
import {
  readPencilEngineSettings,
  useBrushSettingsStore,
} from './brushSettingsStore'

describe('readPencilEngineSettings', () => {
  beforeEach(() => {
    useBrushSettingsStore.setState({ pencilPixelPerfect: true })
  })

  test('returns hard square pixel engine settings', () => {
    const settings = readPencilEngineSettings()
    expect(settings.paintEngine).toBe('pencil')
    expect(settings.hardness).toBe(1)
    expect(settings.spacing).toBe(1)
    expect(settings.roundness).toBe(1)
    expect(settings.pixelPerfect).toBe(true)
  })
})
