import type { RenderGroupLayerView } from '../contracts/RenderDocumentView'
import type { LayerScaleMode } from './layerTextures'
import { describeEffectsStructure, describeGroupSubtreeKey } from './layerViewDescribe'

/** Invalidates offscreen flatten when child pixels/structure or group FX change. */
export function buildGroupLayerSourceKey(
  layer: RenderGroupLayerView,
  scaleMode: LayerScaleMode,
): string {
  const childKey = describeGroupSubtreeKey(layer.children, scaleMode)
  const effectsKey = describeEffectsStructure(layer.effects)
  return `${childKey}|fx:${effectsKey}`
}
