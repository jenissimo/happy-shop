import type { RasterPatch } from '../../imaging/surfaces/TiledRasterSurface'
import {
  getEditableSurface,
  syncEditableSurfaceToBitmap,
} from '../../imaging/surfaces/EditableSurfaceStore'
import type { HistoryEntry } from './types'

/** Tag on raster undo entries so tools can replay tile patches without jumping history. */
export const RASTER_HISTORY_TAG = Symbol('happy.rasterHistory')

export type RasterHistoryEntry = HistoryEntry & {
  [RASTER_HISTORY_TAG]: true
  rasterPatch: RasterPatch
}

export function asRasterHistoryEntry(entry: HistoryEntry): RasterHistoryEntry | null {
  if (RASTER_HISTORY_TAG in entry && (entry as RasterHistoryEntry)[RASTER_HISTORY_TAG]) {
    return entry as RasterHistoryEntry
  }
  return null
}

export type CreateRasterEntryOptions = {
  label: string
  patch: RasterPatch
  /** Called after pixels change so the viewport can invalidate. */
  onInvalidated?: (surfaceId: string) => void
}

function patchByteCost(patch: RasterPatch): number {
  let n = 0
  for (const t of patch.tiles) {
    n += t.before.byteLength + t.after.byteLength
  }
  return n
}

/**
 * Raster history entry — before/after bytes for touched tiles only (SPEC §12).
 */
export function createRasterEntry(
  options: CreateRasterEntryOptions,
): RasterHistoryEntry {
  const { label, patch, onInvalidated } = options

  const apply = async (direction: 'undo' | 'redo') => {
    const surface = getEditableSurface(patch.surfaceId)
    if (!surface) return
    surface.applyPatch(patch, direction)
    await syncEditableSurfaceToBitmap(patch.surfaceId)
    onInvalidated?.(patch.surfaceId)
  }

  return {
    id: crypto.randomUUID(),
    label,
    byteCost: patchByteCost(patch),
    [RASTER_HISTORY_TAG]: true as const,
    rasterPatch: patch,
    undo: () => apply('undo'),
    redo: () => apply('redo'),
    dispose() {
      // Allow GC of tile buffers when entry is evicted.
      for (const t of patch.tiles) {
        t.before.fill(0)
        t.after.fill(0)
      }
    },
  }
}
