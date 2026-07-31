import {
  EMPTY_INITIAL_RASTER_ASSET_ID,
  flattenPaintOrder,
  getLayer,
  type HappyDocument,
  type LayerId,
} from '../../../core/document'
import { getLayerLocalBounds } from './layerLocalBounds'
import { pointInOrientedBox } from './transformMath'

/** True when the layer and all ancestors are visible. */
export function isEffectivelyVisible(
  doc: HappyDocument,
  layerId: LayerId,
): boolean {
  let current: LayerId | null | undefined = layerId
  const guard = new Set<LayerId>()
  while (current != null) {
    if (guard.has(current)) return false
    guard.add(current)
    const layer = getLayer(doc, current)
    if (!layer || !layer.visible) return false
    current = layer.parentId
  }
  return true
}

/**
 * Topmost visible raster/shape/text layer whose local bounds contain `docPt`
 * (paint order, front → back). Groups and adjustment layers are skipped.
 */
export function hitTestTopVisibleLayer(
  doc: HappyDocument,
  docX: number,
  docY: number,
): LayerId | null {
  const docPt = { x: docX, y: docY }
  const paint = flattenPaintOrder(doc)
  for (let i = paint.length - 1; i >= 0; i--) {
    const layer = paint[i]!
    if (layer.type !== 'raster' && layer.type !== 'shape' && layer.type !== 'text') {
      continue
    }
    if (!isEffectivelyVisible(doc, layer.id)) continue
    // The factory's blank backing layer has no pixels to select until a paint
    // surface replaces its reserved asset reference.
    if (
      layer.type === 'raster' &&
      String(layer.pixels) === String(EMPTY_INITIAL_RASTER_ASSET_ID)
    ) {
      continue
    }
    const bounds = getLayerLocalBounds(layer, doc)
    if (!bounds) continue
    if (
      pointInOrientedBox(docPt, {
        bounds,
        transform: layer.transform,
      })
    ) {
      return layer.id
    }
  }
  return null
}
