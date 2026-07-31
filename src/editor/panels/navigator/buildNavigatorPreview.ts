/**
 * Lightweight document overview for the Navigator panel.
 * Composites visible raster / shape / text layers onto a small canvas.
 */

import {
  flattenPaintOrder,
  type HappyDocument,
  type Layer,
  type Transform,
} from '../../../core/document'
import { getRasterSurface } from '../../../imaging'
import {
  bakeShapeLayer,
  rasterizeShapeLayerToBitmap,
} from '../../tools/shape/shapeRasterize'
import { rasterizeTextLayerToBitmap } from '../../tools/text/textRasterize'

const DEG = Math.PI / 180

export const NAVIGATOR_PREVIEW_MAX = 280

export type NavigatorPreview = {
  bitmap: ImageBitmap
  /** Document px → preview px (uniform). */
  scale: number
  /** Preview-space origin of document (0,0). */
  padX: number
  padY: number
  previewWidth: number
  previewHeight: number
  docWidth: number
  docHeight: number
}

function applyLayerTransform(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  t: Transform,
): void {
  ctx.translate(t.x, t.y)
  ctx.rotate(t.rotationDeg * DEG)
  const kx = Math.tan(t.skewXDeg * DEG)
  const ky = Math.tan(t.skewYDeg * DEG)
  ctx.transform(1, ky, kx, 1, 0, 0)
  ctx.scale(t.scaleX, t.scaleY)
  ctx.translate(-t.pivotX, -t.pivotY)
}

async function sourceForLayer(
  layer: Layer,
): Promise<{ bitmap: ImageBitmap; close: boolean } | null> {
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
      return null
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

function drawSource(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layer: Layer,
  bitmap: ImageBitmap,
): void {
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity))
  applyLayerTransform(ctx, layer.transform)
  if (layer.type === 'shape') {
    const baked = bakeShapeLayer(layer)
    ctx.drawImage(bitmap, baked.offsetX, baked.offsetY)
  } else if (layer.type === 'text') {
    const b = layer.bounds
    ctx.drawImage(bitmap, b.x, b.y)
  } else {
    ctx.drawImage(bitmap, 0, 0)
  }
  ctx.restore()
}

/**
 * Build an aspect-correct overview bitmap of the document (max edge
 * {@link NAVIGATOR_PREVIEW_MAX}).
 */
export async function buildNavigatorPreview(
  doc: HappyDocument,
  maxEdge = NAVIGATOR_PREVIEW_MAX,
): Promise<NavigatorPreview | null> {
  const docWidth = Math.max(1, doc.canvas.width)
  const docHeight = Math.max(1, doc.canvas.height)
  const fit = Math.min(maxEdge / docWidth, maxEdge / docHeight, 1)
  const previewWidth = Math.max(1, Math.round(docWidth * fit))
  const previewHeight = Math.max(1, Math.round(docHeight * fit))
  const scale = previewWidth / docWidth

  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(previewWidth, previewHeight)
      : typeof document !== 'undefined'
        ? Object.assign(document.createElement('canvas'), {
            width: previewWidth,
            height: previewHeight,
          })
        : null
  if (!canvas) return null

  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
  if (!ctx) return null

  // Checkerboard under transparent areas.
  const cell = Math.max(4, Math.round(6 * scale))
  for (let y = 0; y < previewHeight; y += cell) {
    for (let x = 0; x < previewWidth; x += cell) {
      const odd = ((x / cell) | 0) + ((y / cell) | 0)
      ctx.fillStyle = odd % 2 === 0 ? '#c8c8c8' : '#a8a8a8'
      ctx.fillRect(x, y, cell, cell)
    }
  }

  // Work in document pixels, then scale into preview.
  ctx.setTransform(scale, 0, 0, scale, 0, 0)

  for (const layer of flattenPaintOrder(doc)) {
    if (!layer.visible || layer.opacity <= 0) continue
    if (
      layer.type !== 'raster' &&
      layer.type !== 'shape' &&
      layer.type !== 'text'
    ) {
      continue
    }
    const src = await sourceForLayer(layer)
    if (!src) continue
    try {
      drawSource(ctx, layer, src.bitmap)
    } finally {
      if (src.close) src.bitmap.close()
    }
  }

  const bitmap = await createImageBitmap(canvas as CanvasImageSource)
  return {
    bitmap,
    scale,
    padX: 0,
    padY: 0,
    previewWidth,
    previewHeight,
    docWidth,
    docHeight,
  }
}
