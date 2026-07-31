import type {
  RenderLayerView,
  RenderRasterLayerView,
  RenderShapeLayerView,
  RenderTextLayerView,
} from '../contracts/RenderDocumentView'

/**
 * Leaf views `PixiRenderBackend.syncLayers` knows how to render today.
 * `kind: 'group'` is intentionally excluded — see `SPECS/GROUP-LAYER-FX.md`.
 */
export type RenderLeafLayerView =
  | RenderRasterLayerView
  | RenderTextLayerView
  | RenderShapeLayerView

/**
 * P0 safety fallback for `SPECS/GROUP-LAYER-FX.md` §4.1.
 *
 * Kept for unit tests and as a documented degrade path if a `kind: 'group'`
 * view ever reaches a compositor that cannot render isolated groups. The live
 * `PixiRenderBackend` consumes `RenderGroupLayerView` directly (P1 §4.2).
 */
export function flattenGroupLayersForCompositor(
  layers: readonly RenderLayerView[],
): RenderLeafLayerView[] {
  const out: RenderLeafLayerView[] = []
  for (const layer of layers) {
    if (layer.kind === 'group') {
      if (!layer.visible) continue
      out.push(...flattenGroupLayersForCompositor(layer.children))
      continue
    }
    out.push(layer)
  }
  return out
}
