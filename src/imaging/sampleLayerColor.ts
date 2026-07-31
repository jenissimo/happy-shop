/**
 * 3×3 average sample for chroma eyedropper (SPECS/CHROMA-KEY-AND-TRIM.md).
 */

import { getEditableSurface } from './surfaces/EditableSurfaceStore'
import { getRasterSurface } from './RasterSurfaceStore'

export type Rgb = { r: number; g: number; b: number }

function avgFromRgba(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
): Rgb | null {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = Math.round(cx) + dx
      const y = Math.round(cy) + dy
      if (x < 0 || y < 0 || x >= width || y >= height) continue
      const i = (y * width + x) * 4
      if (data[i + 3]! === 0) continue
      r += data[i]!
      g += data[i + 1]!
      b += data[i + 2]!
      n++
    }
  }
  if (n === 0) return null
  return {
    r: Math.round(r / n),
    g: Math.round(g / n),
    b: Math.round(b / n),
  }
}

export function rgbToCssHex(rgb: Rgb): string {
  const h = (n: number) => n.toString(16).padStart(2, '0')
  return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`
}

/** Sample from an in-memory RGBA buffer (tests / worker). */
export function sampleRgbaAverage(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): Rgb | null {
  return avgFromRgba(data, width, height, x, y)
}

/**
 * Sample active layer pixels at layer-local coords.
 * Prefers editable tiled surface; falls back to registered ImageBitmap.
 */
export async function sampleLayerAssetColor(
  assetId: string,
  localX: number,
  localY: number,
): Promise<Rgb | null> {
  const editable = getEditableSurface(assetId)
  if (editable) {
    const { data, width, height } = editable.toRgbaBuffer()
    return avgFromRgba(data, width, height, localX, localY)
  }

  const entry = getRasterSurface(assetId)
  if (!entry) return null

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(entry.width, entry.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(entry.bitmap, 0, 0)
    const image = ctx.getImageData(0, 0, entry.width, entry.height)
    return avgFromRgba(image.data, entry.width, entry.height, localX, localY)
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = entry.width
    canvas.height = entry.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(entry.bitmap, 0, 0)
    const image = ctx.getImageData(0, 0, entry.width, entry.height)
    return avgFromRgba(image.data, entry.width, entry.height, localX, localY)
  }

  return null
}
