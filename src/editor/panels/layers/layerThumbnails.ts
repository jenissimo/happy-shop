/**
 * Async ~40×40 layer thumbnails for the Layers panel.
 * Raster: downscale from RasterSurfaceStore ImageBitmap.
 * Shape / text: CPU bake preview. Invalidate via dirty key + generation.
 */

import type { Layer } from '../../../core/document'
import { getRasterSurface } from '../../../imaging'
import { bakeShapeLayer, rasterizeShapeLayerToBitmap } from '../../tools/shape'
import { rasterizeTextLayerToBitmap } from '../../tools/text'
import { readCheckerboardColors } from '../../../rendering/pixi/checkerboard'

export const LAYER_THUMB_SIZE = 40

type CacheEntry = {
  key: string
  url: string
  generation: number
}

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<string | null>>()
let generation = 0

/** Bump to drop stale cached URLs (tests / session teardown). */
export function invalidateAllLayerThumbnails(): void {
  generation += 1
  for (const entry of cache.values()) {
    URL.revokeObjectURL(entry.url)
  }
  cache.clear()
  inflight.clear()
}

export function layerThumbDirtyKey(layer: Layer, rasterEpoch: number): string {
  if (layer.type === 'raster') {
    const entry = getRasterSurface(String(layer.pixels))
    return [
      layer.id,
      'raster',
      layer.pixels,
      rasterEpoch,
      entry?.width ?? 0,
      entry?.height ?? 0,
      Math.round(layer.opacity * 1000),
    ].join(':')
  }
  if (layer.type === 'shape') {
    return [
      layer.id,
      'shape',
      layer.primitive,
      layer.bounds.x,
      layer.bounds.y,
      layer.bounds.w,
      layer.bounds.h,
      layer.fill.enabled,
      layer.fill.color,
      layer.fill.opacity,
      layer.stroke.enabled,
      layer.stroke.color,
      layer.stroke.opacity,
      layer.stroke.width,
      layer.cornerRadius ?? 0,
      Math.round(layer.opacity * 1000),
    ].join(':')
  }
  if (layer.type === 'text') {
    return [
      layer.id,
      'text',
      layer.content,
      layer.fontFamily,
      layer.fontSize,
      layer.fontWeight,
      layer.italic ? 1 : 0,
      layer.underline ? 1 : 0,
      layer.color,
      layer.tracking,
      layer.leading,
      layer.align,
      layer.textMode,
      layer.bounds.w,
      layer.bounds.h,
      Math.round(layer.opacity * 1000),
    ].join(':')
  }
  if (layer.type === 'adjustment') {
    return `${layer.id}:adj:${layer.adjustment.type}`
  }
  return `${layer.id}:${layer.type}`
}

function drawChecker(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  size: number,
): void {
  const { light, dark } = readCheckerboardColors()
  const cell = 5
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const odd = ((x / cell) | 0) + ((y / cell) | 0)
      ctx.fillStyle = odd % 2 === 0 ? light : dark
      ctx.fillRect(x, y, cell, cell)
    }
  }
}

function fitDraw(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  size: number,
): void {
  const scale = Math.min(size / Math.max(1, srcW), size / Math.max(1, srcH))
  const w = Math.max(1, Math.round(srcW * scale))
  const h = Math.max(1, Math.round(srcH * scale))
  const x = Math.floor((size - w) / 2)
  const y = Math.floor((size - h) / 2)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'low'
  ctx.drawImage(source, x, y, w, h)
}

async function bitmapFromLayer(layer: Layer): Promise<{
  bitmap: ImageBitmap
  close: boolean
} | null> {
  if (layer.type === 'raster') {
    const entry = getRasterSurface(String(layer.pixels))
    if (!entry) return null
    return { bitmap: entry.bitmap, close: false }
  }
  if (layer.type === 'shape') {
    try {
      const { bitmap } = await rasterizeShapeLayerToBitmap(layer)
      return { bitmap, close: true }
    } catch {
      const baked = bakeShapeLayer(layer)
      if (typeof createImageBitmap !== 'function' || typeof ImageData === 'undefined') {
        return null
      }
      const pixels = new Uint8ClampedArray(baked.rgba) as unknown as ImageDataArray
      const bitmap = await createImageBitmap(
        new ImageData(pixels, baked.width, baked.height),
      )
      return { bitmap, close: true }
    }
  }
  if (layer.type === 'text') {
    try {
      const bitmap = await rasterizeTextLayerToBitmap(layer)
      return { bitmap, close: true }
    } catch {
      return null
    }
  }
  return null
}

function adjustmentSwatch(layer: Layer): string {
  if (layer.type !== 'adjustment') return '#666'
  switch (layer.adjustment.type) {
    case 'brightness-contrast':
      return '#8a8a6a'
    case 'hue-saturation':
      return '#6a8a8a'
    case 'levels':
      return '#7a7a8a'
    default:
      return '#666'
  }
}

async function renderThumbCanvas(
  layer: Layer,
  size: number,
): Promise<HTMLCanvasElement | null> {
  const canvas = globalThis.document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  if (layer.type === 'adjustment') {
    ctx.fillStyle = adjustmentSwatch(layer)
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('fx', size / 2, size / 2)
    return canvas
  }

  drawChecker(ctx, size)
  const src = await bitmapFromLayer(layer)
  if (!src) return canvas
  try {
    ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity))
    fitDraw(ctx, src.bitmap, src.bitmap.width, src.bitmap.height, size)
  } finally {
    if (src.close) src.bitmap.close()
  }
  return canvas
}

async function canvasToObjectUrl(canvas: HTMLCanvasElement): Promise<string | null> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  )
  if (!blob) return null
  return URL.createObjectURL(blob)
}

/**
 * Resolve a thumbnail object URL for `layer`. Returns cached URL when the
 * dirty key matches; otherwise rebuilds asynchronously.
 */
export async function resolveLayerThumbnailUrl(
  layer: Layer,
  rasterEpoch: number,
  size = LAYER_THUMB_SIZE,
): Promise<string | null> {
  if (layer.type === 'group') return null

  const key = layerThumbDirtyKey(layer, rasterEpoch)
  const cached = cache.get(layer.id)
  if (cached && cached.key === key && cached.generation === generation) {
    return cached.url
  }

  const existing = inflight.get(layer.id)
  if (existing) return existing

  const gen = generation
  const promise = (async () => {
    const canvas = await renderThumbCanvas(layer, size)
    if (!canvas || gen !== generation) return null
    const url = await canvasToObjectUrl(canvas)
    if (!url || gen !== generation) return null
    const prev = cache.get(layer.id)
    if (prev) URL.revokeObjectURL(prev.url)
    cache.set(layer.id, { key, url, generation: gen })
    return url
  })().finally(() => {
    inflight.delete(layer.id)
  })

  inflight.set(layer.id, promise)
  return promise
}
