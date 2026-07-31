import { asRasterHistoryEntry } from '../../../core/history/rasterEntry'
import { TiledRasterSurface } from '../../../imaging/surfaces/TiledRasterSurface'
import { documentHistory } from '../../session/documentHistory'

/**
 * Reconstruct a full-layer RGBA snapshot as it existed at `targetDepth`
 * (0 = document open, undoCount = present) without mutating live history.
 */
export function captureSurfaceAtHistoryDepth(
  surface: TiledRasterSurface,
  targetDepth: number,
): Uint8ClampedArray {
  const depth = Math.max(0, Math.min(Math.floor(targetDepth), documentHistory.undoCount))
  const scratch = new TiledRasterSurface(`${surface.id}-hist`, surface.width, surface.height)
  const { data, width, height } = surface.toRgbaBuffer()
  scratch.writeRegion({ x: 0, y: 0, width, height }, data)

  for (let undoDepth = documentHistory.undoCount; undoDepth > depth; undoDepth--) {
    const entry = documentHistory.getUndoEntryAtDepth(undoDepth)
    const raster = entry && asRasterHistoryEntry(entry)
    if (raster && raster.rasterPatch.surfaceId === surface.id) {
      scratch.applyPatch(raster.rasterPatch, 'undo')
    }
  }

  return scratch.toRgbaBuffer().data
}
