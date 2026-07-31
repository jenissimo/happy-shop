import type { HappyDocument } from '../../../core/document'
import { flattenPaintOrder } from '../../../core/document'
import { getImagingClient, getRasterSurface } from '../../../imaging'
import { scanOpaqueBounds } from '../../../imaging/worker/pixelScan'
import { ensureEditableSurface } from '../../../imaging/surfaces/EditableSurfaceStore'
import type { SelectionRect } from '../../session/selectionStore'
import { cropDocument } from './cropDocument'

export type TrimOptions = {
  top?: boolean
  bottom?: boolean
  left?: boolean
  right?: boolean
}

export type TrimScanFn = (
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
) => Promise<{ minX: number; minY: number; maxX: number; maxY: number } | null>

/** Prefer imaging worker; fall back to sync pure kernel (tests / no Worker). */
async function defaultScan(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<{ minX: number; minY: number; maxX: number; maxY: number } | null> {
  try {
    return await getImagingClient().scanOpaqueBounds(rgba, width, height)
  } catch {
    return scanOpaqueBounds(rgba, width, height)
  }
}

/**
 * Trim canvas to the bounding box of opaque pixels across raster layers
 * (merged / whole-document, SPECS/CHROMA-KEY-AND-TRIM.md).
 *
 * Heavy full-buffer scans run in the imaging worker when available (§21.3).
 */
export async function computeTrimRect(
  doc: HappyDocument,
  scan: TrimScanFn = defaultScan,
): Promise<SelectionRect | null> {
  let minX = doc.canvas.width
  let minY = doc.canvas.height
  let maxX = -1
  let maxY = -1

  for (const layer of flattenPaintOrder(doc)) {
    if (layer.type !== 'raster' || !layer.visible) continue
    const assetId = String(layer.pixels)
    let surface = await ensureEditableSurface(assetId)
    if (!surface) {
      const entry = getRasterSurface(assetId)
      if (!entry) continue
      surface = await ensureEditableSurface(assetId)
    }
    if (!surface) continue

    const img = surface.toRgbaBuffer()
    const ox = Math.round(layer.transform.x)
    const oy = Math.round(layer.transform.y)
    const bounds = await scan(img.data, img.width, img.height)
    if (!bounds) continue
    const layerMinX = ox + bounds.minX
    const layerMinY = oy + bounds.minY
    const layerMaxX = ox + bounds.maxX
    const layerMaxY = oy + bounds.maxY
    if (layerMinX < minX) minX = layerMinX
    if (layerMinY < minY) minY = layerMinY
    if (layerMaxX > maxX) maxX = layerMaxX
    if (layerMaxY > maxY) maxY = layerMaxY
  }

  if (maxX < minX || maxY < minY) return null
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

export async function trimDocument(
  doc: HappyDocument,
  options: TrimOptions = {},
  scan?: TrimScanFn,
): Promise<HappyDocument> {
  const full = await computeTrimRect(doc, scan)
  if (!full) return doc

  const trimTop = options.top !== false
  const trimBottom = options.bottom !== false
  const trimLeft = options.left !== false
  const trimRight = options.right !== false

  const x = trimLeft ? full.x : 0
  const y = trimTop ? full.y : 0
  const right = trimRight ? full.x + full.width : doc.canvas.width
  const bottom = trimBottom ? full.y + full.height : doc.canvas.height

  return cropDocument(doc, {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  })
}
