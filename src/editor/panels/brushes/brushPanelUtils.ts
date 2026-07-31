import type { BrushTipDescriptor } from '../../../imaging/brushes/tipDescriptor'
import { getTip } from '../../../imaging/brushes/tipRegistry'
import { useBrushSettingsStore } from '../../tools/brush/brushSettingsStore'

/** Apply a tip selection — shared by options-bar picker and Brushes panel. */
export function selectBrushTip(tip: BrushTipDescriptor): void {
  useBrushSettingsStore.getState().setPrefs({
    tipId: tip.id,
    hardness: tip.hardness,
    spacing: tip.spacing,
    roundness: tip.roundness,
    angle: 0,
    ...(tip.defaults.size ? { size: tip.defaults.size } : {}),
    ...(tip.defaults.opacity ? { opacity: tip.defaults.opacity } : {}),
    ...(tip.defaults.flow ? { flow: tip.defaults.flow } : {}),
  })
}

export function resolveCurrentBrushTip(tipId: string): BrushTipDescriptor {
  return getTip(tipId) ?? getTip('proc.round-soft')!
}
