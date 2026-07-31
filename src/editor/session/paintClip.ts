import type { Layer } from '../../core/document'
import { isLayerTransparentPixelsLocked } from '../../core/document/layerLocks'
import type { TiledRasterSurface } from '../../imaging/surfaces/TiledRasterSurface'
import { selectionClipForLayer } from './selectionClip'

export type PaintClipFn = (localX: number, localY: number) => number

/** Selection mask × transparent-pixels lock for brush-like tools. */
export function buildPaintClip(
  layer: Layer,
  surface: TiledRasterSurface,
): PaintClipFn | undefined {
  const selection = selectionClipForLayer(layer.transform)
  const transparent = isLayerTransparentPixelsLocked(layer)
    ? transparentPixelsClipForSurface(surface)
    : null
  if (selection && transparent) {
    return (x, y) => selection(x, y) * transparent(x, y)
  }
  return selection ?? transparent ?? undefined
}

export function transparentPixelsClipForSurface(
  surface: TiledRasterSurface,
): PaintClipFn {
  return (localX, localY) => (surface.sampleRgba(localX, localY)[3]! > 0 ? 1 : 0)
}
