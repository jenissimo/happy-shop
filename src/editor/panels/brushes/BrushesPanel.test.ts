import { beforeEach, describe, expect, test } from 'bun:test'
import { useBrushSettingsStore } from '../../tools/brush/brushSettingsStore'
import { getTip } from '../../../imaging/brushes/tipRegistry'
import { resolveCurrentBrushTip, selectBrushTip } from './brushPanelUtils'

describe('brush panel utils', () => {
  beforeEach(() => {
    useBrushSettingsStore.getState().setPrefs({
      tipId: 'proc.round-soft',
      size: 20,
      hardness: 0.35,
      spacing: 0.25,
      roundness: 1,
      angle: 0,
    })
  })

  test('selectBrushTip applies descriptor defaults', () => {
    const tip = getTip('proc.round-hard')
    expect(tip).toBeTruthy()
    selectBrushTip(tip!)
    const prefs = useBrushSettingsStore.getState()
    expect(prefs.tipId).toBe('proc.round-hard')
    expect(prefs.hardness).toBe(tip!.hardness)
    expect(prefs.spacing).toBe(tip!.spacing)
    expect(prefs.recentTipIds[0]).toBe('proc.round-hard')
  })

  test('resolveCurrentBrushTip falls back to round soft', () => {
    useBrushSettingsStore.getState().setPrefs({ tipId: 'missing-tip' })
    expect(resolveCurrentBrushTip('missing-tip').id).toBe('proc.round-soft')
  })
})
