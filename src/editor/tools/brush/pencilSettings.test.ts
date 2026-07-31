import { describe, expect, test, beforeEach } from 'bun:test'
import { PENCIL_TIP_ID } from '../../../imaging/brushes/presets/proc'
import {
  readPencilEngineSettings,
  useBrushSettingsStore,
} from './brushSettingsStore'

describe('readPencilEngineSettings', () => {
  beforeEach(() => {
    useBrushSettingsStore.setState({
      tipId: 'proc.round-soft',
      hardness: 0.35,
      pencilPixelPerfect: false,
    })
  })

  test('forces square-hard tip, 100% hardness, and pencil engine', () => {
    const settings = readPencilEngineSettings()
    expect(settings.tipId).toBe(PENCIL_TIP_ID)
    expect(settings.hardness).toBe(1)
    expect(settings.paintEngine).toBe('pencil')
    expect(settings.spacing).toBe(1)
    expect(settings.roundness).toBe(1)
    expect(settings.angle).toBe(0)
  })

  test('respects pencilPixelPerfect preference', () => {
    useBrushSettingsStore.setState({ pencilPixelPerfect: true })
    expect(readPencilEngineSettings().pixelPerfect).toBe(true)
    useBrushSettingsStore.setState({ pencilPixelPerfect: false })
    expect(readPencilEngineSettings().pixelPerfect).toBe(false)
  })
})
