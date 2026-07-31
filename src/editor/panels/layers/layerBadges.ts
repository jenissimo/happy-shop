import type { LayersPanelLayer } from './types'

/** Whether a Layers panel row displays the live-text type marker. */
export function hasTextLayerBadge(layer: LayersPanelLayer): boolean {
  return layer.kind === 'text'
}
