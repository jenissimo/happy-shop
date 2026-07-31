import { getLayer, isLayerImageLocked, type LayerId } from '../../../core/document'
import { createRasterEntry } from '../../../core/history/rasterEntry'
import { floodFillMask } from '../../../imaging/worker/floodFill'
import {
  ensureEditableSurface,
  syncEditableSurfaceToBitmap,
} from '../../../imaging/surfaces/EditableSurfaceStore'
import type { RasterPatch } from '../../../imaging/surfaces/TiledRasterSurface'
import { useColorStore } from '../../color/colorStore'
import { documentHistory } from '../../session/documentHistory'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { buildPaintClip } from '../../session/paintClip'
import { documentToLayerLocal } from '../brush/layerCoords'
import { useFillToolStore } from './fillToolStore'

function parseHex(color: string): { r: number; g: number; b: number } {
  const hex = color.replace('#', '')
  return {
    r: Number.parseInt(hex.slice(0, 2), 16) || 0,
    g: Number.parseInt(hex.slice(2, 4), 16) || 0,
    b: Number.parseInt(hex.slice(4, 6), 16) || 0,
  }
}

function maskBounds(mask: Uint8Array, width: number, height: number) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 0) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

function patchChanged(patch: RasterPatch): boolean {
  return patch.tiles.some((tile) =>
    tile.before.some((value, index) => value !== tile.after[index]),
  )
}

/** Fill the contiguous active-layer region at a document-space point. */
export async function applyPaintBucketAt(
  docX: number,
  docY: number,
): Promise<boolean> {
  const session = useEditorSessionStore.getState()
  const layerId = session.selectedLayerIds[0] as LayerId | undefined
  const layer = layerId && getLayer(session.document, layerId)
  if (!layer || layer.type !== 'raster' || isLayerImageLocked(layer)) return false

  const surfaceId = String(layer.pixels)
  const surface = await ensureEditableSurface(surfaceId, session.document.canvas)
  if (!surface) return false
  const local = documentToLayerLocal({ x: docX, y: docY }, layer.transform)
  const seedX = Math.floor(local.x)
  const seedY = Math.floor(local.y)
  if (seedX < 0 || seedY < 0 || seedX >= surface.width || seedY >= surface.height) {
    return false
  }

  const clip = buildPaintClip(layer, surface)
  const { data, width, height } = surface.toRgbaBuffer()
  const settings = useFillToolStore.getState()
  const mask = floodFillMask(data, {
    width,
    height,
    seedX,
    seedY,
    tolerance: settings.tolerance,
    antiAlias: settings.antiAlias,
    allowed: clip ?? undefined,
  })
  const region = maskBounds(mask, width, height)
  if (!region) return false

  const patch = surface.paintSelection({
    region,
    mode: 'fill',
    color: parseHex(useColorStore.getState().foreground),
    sampleDoc: (x, y) => mask[Math.floor(y) * width + Math.floor(x)] ?? 0,
  })
  if (!patchChanged(patch)) return false

  if (typeof OffscreenCanvas !== 'undefined') {
    await syncEditableSurfaceToBitmap(surfaceId)
  }
  const invalidate = () => useEditorSessionStore.getState().bumpRasterEpoch()
  documentHistory.push(
    createRasterEntry({ label: 'Paint Bucket', patch, onInvalidated: invalidate }),
  )
  useEditorSessionStore.setState({
    dirty: true,
    historyVersion: documentHistory.version,
  })
  invalidate()
  return true
}
