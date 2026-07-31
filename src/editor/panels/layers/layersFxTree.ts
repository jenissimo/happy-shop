import type { LayerEffect } from '../../../core/document'
import { effectInstanceLabel } from '../../../ui/features/layer-style/defaults'
import { effectBlendSummary } from '../../../rendering/effects/effectBlendModes'
import type { EffectPanelRow } from '../effects/EffectsPanel'

export type LayersFxEffectRow = EffectPanelRow

/** Maps a layer's FX stack to Layers-panel sub-row labels (mirrors Effects panel). */
export function layersFxEffectRows(effects: readonly LayerEffect[]): LayersFxEffectRow[] {
  return effects.map((effect) => ({
    id: effect.id,
    label: effectInstanceLabel(effect, effects as LayerEffect[]),
    enabled: effect.enabled,
    blendSummary: effectBlendSummary(effect),
  }))
}

export function toggleExpandedFx(expanded: ReadonlySet<string>, layerId: string): Set<string> {
  const next = new Set(expanded)
  if (next.has(layerId)) next.delete(layerId)
  else next.add(layerId)
  return next
}
