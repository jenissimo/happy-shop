import type { HappyDocument } from '../core/document'
import { getRasterSurface } from '../imaging/RasterSurfaceStore'
import { encodeSurfaceToPng } from './encodeSurfacePng'
import type { StagedAssetWrite } from './types'

/**
 * Walk the document for raster asset refs and encode dirty/present surfaces
 * into staged PNG writes for BridgeProjectStore.save.
 */
export async function collectSaveAssets(
  document: HappyDocument,
): Promise<StagedAssetWrite[]> {
  const seen = new Set<string>()
  const writes: StagedAssetWrite[] = []

  for (const layer of Object.values(document.layers)) {
    if (layer.type !== 'raster') continue
    const assetId = String(layer.pixels)
    if (seen.has(assetId)) continue
    seen.add(assetId)
    const surface = getRasterSurface(assetId)
    if (!surface) continue
    const blob = await encodeSurfaceToPng(surface)
    writes.push({
      id: assetId,
      kind: 'layer',
      blob,
      width: surface.width,
      height: surface.height,
      mimeType: 'image/png',
    })
  }

  return writes
}
