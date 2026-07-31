import type { RasterSurfaceEntry } from '../imaging/RasterSurfaceStore'

/**
 * Encode a registered surface to lossless PNG for project layer files.
 * Uses OffscreenCanvas when available; falls back to HTMLCanvasElement.
 * Main-thread encode is acceptable for Save (not interactive stroke path).
 */
export async function encodeSurfaceToPng(
  entry: RasterSurfaceEntry,
): Promise<Blob> {
  const { bitmap, width, height } = entry
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('OffscreenCanvas 2d unavailable')
    ctx.drawImage(bitmap, 0, 0)
    return canvas.convertToBlob({ type: 'image/png' })
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d unavailable')
    ctx.drawImage(bitmap, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    )
    if (!blob) throw new Error('PNG encode failed')
    return blob
  }

  throw new Error('No canvas encoder available in this environment')
}
