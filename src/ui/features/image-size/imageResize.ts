import type { HappyDocument } from '../../../core/document'
import { MAX_CANVAS_SIDE } from '../../../core/document'
import { getRasterSurface, registerRasterSurface } from '../../../imaging'

export type ResampleInterpolation = 'bicubic' | 'nearest'

export function clampImageDimension(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.min(MAX_CANVAS_SIDE, Math.round(value)))
}

export function constrainedDimension(
  changed: number,
  originalChanged: number,
  originalOther: number,
): number {
  return clampImageDimension((changed * originalOther) / originalChanged)
}

/**
 * Changes document-space dimensions while preserving layer transform intent.
 * Raster sources are resized separately by `resampleDocumentAssets`.
 */
export function resizeDocumentMetadata(
  document: HappyDocument,
  width: number,
  height: number,
): HappyDocument {
  const nextWidth = clampImageDimension(width)
  const nextHeight = clampImageDimension(height)
  if (nextWidth === document.canvas.width && nextHeight === document.canvas.height) {
    return document
  }
  const xRatio = nextWidth / document.canvas.width
  const yRatio = nextHeight / document.canvas.height
  return {
    ...document,
    canvas: { ...document.canvas, width: nextWidth, height: nextHeight },
    layers: Object.fromEntries(
      Object.entries(document.layers).map(([id, layer]) => [
        id,
        {
          ...layer,
          transform: {
            ...layer.transform,
            x: layer.transform.x * xRatio,
            y: layer.transform.y * yRatio,
            pivotX: layer.transform.pivotX * xRatio,
            pivotY: layer.transform.pivotY * yRatio,
          },
        },
      ]),
    ),
  }
}

/**
 * Resamples each currently resolved raster source. Canvas uses the browser's
 * high-quality (bicubic-class) scaler; nearest disables smoothing explicitly.
 */
export async function resampleDocumentAssets(
  document: HappyDocument,
  width: number,
  height: number,
  interpolation: ResampleInterpolation,
): Promise<void> {
  const xRatio = width / document.canvas.width
  const yRatio = height / document.canvas.height
  const assetIds = new Set<string>()
  for (const layer of Object.values(document.layers)) {
    if (layer.type === 'raster') assetIds.add(layer.pixels)
  }

  await Promise.all([...assetIds].map(async (assetId) => {
    const entry = getRasterSurface(assetId)
    if (!entry) return
    const targetWidth = clampImageDimension(entry.width * xRatio)
    const targetHeight = clampImageDimension(entry.height * yRatio)
    const canvas = new OffscreenCanvas(targetWidth, targetHeight)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('2D canvas is unavailable for image resampling')
    context.imageSmoothingEnabled = interpolation !== 'nearest'
    context.imageSmoothingQuality = interpolation === 'bicubic' ? 'high' : 'low'
    context.drawImage(entry.bitmap, 0, 0, targetWidth, targetHeight)
    registerRasterSurface({
      assetId,
      width: targetWidth,
      height: targetHeight,
      bitmap: await createImageBitmap(canvas),
    })
  }))
}
