/**
 * CPU bake for ShapeLayer → RGBA / ImageBitmap (`layer.rasterize`).
 * Live viewport preview uses Pixi Graphics in `PixiRenderBackend`.
 */

import type { ShapeLayer } from '../../../core/document'
import { shapePath } from './shapeGeometry'

export type BakedShape = {
  width: number
  height: number
  /** Layer-local origin of the baked bitmap relative to shape.bounds. */
  offsetX: number
  offsetY: number
  rgba: Uint8ClampedArray
}

function parseHexRgb(color: string): { r: number; g: number; b: number } {
  const hex = color.replace('#', '')
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex.slice(0, 6)
  const n = Number.parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function withAlpha(color: string, opacity: number): string {
  const { r, g, b } = parseHexRgb(color)
  const a = Math.max(0, Math.min(1, opacity))
  return `rgba(${r},${g},${b},${a})`
}

function pointInPolygon(x: number, y: number, points: Array<{ x: number; y: number }>): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!
    const b = points[j]!
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * Bake shape into a tight RGBA buffer (bounds size + stroke pad).
 * Uses Canvas2D when available; falls back to a pure rect fill for Bun tests.
 */
export function bakeShapeLayer(layer: ShapeLayer): BakedShape {
  const strokePad =
    layer.stroke.enabled && layer.stroke.width > 0
      ? Math.ceil(layer.stroke.width)
      : 0
  const width = Math.max(1, Math.ceil(layer.bounds.w + strokePad * 2))
  const height = Math.max(1, Math.ceil(layer.bounds.h + strokePad * 2))
  const offsetX = layer.bounds.x - strokePad
  const offsetY = layer.bounds.y - strokePad

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, width, height)
      const x = strokePad
      const y = strokePad
      const w = layer.bounds.w
      const h = layer.bounds.h
      ctx.beginPath()
      if (layer.primitive === 'ellipse') {
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
      } else if (layer.primitive === 'rect') {
        const r = Math.min(layer.cornerRadius ?? 0, w / 2, h / 2)
        if (r > 0 && typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, y, w, h, r)
        } else {
          ctx.rect(x, y, w, h)
        }
      } else {
        const path = shapePath(layer)
        if (path) {
          const first = path.points[0]
          if (first) {
            ctx.moveTo(first.x - layer.bounds.x + strokePad, first.y - layer.bounds.y + strokePad)
            for (const point of path.points.slice(1)) {
              ctx.lineTo(point.x - layer.bounds.x + strokePad, point.y - layer.bounds.y + strokePad)
            }
            if (path.closed) ctx.closePath()
          }
        }
      }
      if (layer.fill.enabled) {
        ctx.fillStyle = withAlpha(layer.fill.color, layer.fill.opacity)
        ctx.fill()
      }
      if (layer.stroke.enabled && layer.stroke.width > 0) {
        ctx.strokeStyle = withAlpha(layer.stroke.color, layer.stroke.opacity)
        ctx.lineWidth = layer.stroke.width
        ctx.stroke()
      }
      const image = ctx.getImageData(0, 0, width, height)
      return {
        width,
        height,
        offsetX,
        offsetY,
        rgba: new Uint8ClampedArray(image.data),
      }
    }
  }

  // Headless fallback: axis-aligned fill (rect only; ellipse ≈ filled rect).
  const rgba = new Uint8ClampedArray(width * height * 4)
  if (layer.fill.enabled) {
    const { r, g, b } = parseHexRgb(layer.fill.color)
    const a = Math.round(Math.max(0, Math.min(1, layer.fill.opacity)) * 255)
    const x0 = strokePad
    const y0 = strokePad
    const x1 = x0 + Math.ceil(layer.bounds.w)
    const y1 = y0 + Math.ceil(layer.bounds.h)
    for (let y = y0; y < y1 && y < height; y++) {
      for (let x = x0; x < x1 && x < width; x++) {
        let inside = true
        if (layer.primitive === 'ellipse') {
          const cx = x0 + layer.bounds.w / 2
          const cy = y0 + layer.bounds.h / 2
          const rx = Math.max(1e-6, layer.bounds.w / 2)
          const ry = Math.max(1e-6, layer.bounds.h / 2)
          const nx = (x + 0.5 - cx) / rx
          const ny = (y + 0.5 - cy) / ry
          inside = nx * nx + ny * ny <= 1
        } else if (layer.primitive === 'rect' && (layer.cornerRadius ?? 0) > 0) {
          const r = Math.min(layer.cornerRadius ?? 0, layer.bounds.w / 2, layer.bounds.h / 2)
          const px = x + 0.5 - x0
          const py = y + 0.5 - y0
          const cx = Math.min(Math.max(px, r), layer.bounds.w - r)
          const cy = Math.min(Math.max(py, r), layer.bounds.h - r)
          inside = (px - cx) ** 2 + (py - cy) ** 2 <= r ** 2
        } else {
          const path = shapePath(layer)
          if (path) {
            if (path.closed) {
              inside = pointInPolygon(
                x + 0.5 - strokePad + layer.bounds.x,
                y + 0.5 - strokePad + layer.bounds.y,
                path.points,
              )
            } else {
              inside = false
            }
          }
        }
        if (!inside) continue
        const i = (y * width + x) * 4
        rgba[i] = r
        rgba[i + 1] = g
        rgba[i + 2] = b
        rgba[i + 3] = a
      }
    }
  }
  return { width, height, offsetX, offsetY, rgba }
}

export async function rasterizeShapeLayerToBitmap(
  layer: ShapeLayer,
): Promise<{ bitmap: ImageBitmap; baked: BakedShape }> {
  const baked = bakeShapeLayer(layer)
  const pixels = new Uint8ClampedArray(baked.rgba) as unknown as ImageDataArray
  if (typeof createImageBitmap === 'function' && typeof ImageData !== 'undefined') {
    const imageData = new ImageData(pixels, baked.width, baked.height)
    const bitmap = await createImageBitmap(imageData)
    return { bitmap, baked }
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(baked.width, baked.height)
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.putImageData(new ImageData(pixels, baked.width, baked.height), 0, 0)
      const bitmap = await createImageBitmap(canvas)
      return { bitmap, baked }
    }
  }
  throw new Error('Unable to create ImageBitmap for shape rasterize')
}
