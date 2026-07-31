import type { RasterSurfaceEntry } from './RasterSurfaceStore'

/** Allocates a transparent, canvas-sized bitmap for a paintable raster layer. */
export async function createTransparentRasterSurface(
  assetId: string,
  width: number,
  height: number,
): Promise<RasterSurfaceEntry> {
  const w = Math.max(1, width)
  const h = Math.max(1, height)

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h)
    const context = canvas.getContext('2d')
    if (context && typeof canvas.transferToImageBitmap === 'function') {
      context.clearRect(0, 0, w, h)
      return { assetId, width: w, height: h, bitmap: canvas.transferToImageBitmap() }
    }
    if (context && typeof createImageBitmap === 'function') {
      context.clearRect(0, 0, w, h)
      return { assetId, width: w, height: h, bitmap: await createImageBitmap(canvas) }
    }
  }

  if (typeof document !== 'undefined' && typeof createImageBitmap === 'function') {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')?.clearRect(0, 0, w, h)
    return { assetId, width: w, height: h, bitmap: await createImageBitmap(canvas) }
  }

  throw new Error('A canvas ImageBitmap implementation is required for blank raster layers')
}
