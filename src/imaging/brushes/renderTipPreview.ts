import { dabCoverage, squareSideFromRadius, squareTipCoverage, tipDistance } from './dabKernel'
import { walkStroke, type StrokePoint } from './strokeWalk'
import type { BrushTipDescriptor } from './tipDescriptor'
import type { TipAlpha } from './tipRegistry'

export type TipPreviewRequest = {
  tip: BrushTipDescriptor
  size: number
  hardness: number
  opacity: number
  flow: number
  spacing: number
  angle: number
  roundness: number
  color: string
  mode: 'paint' | 'erase'
  width: number
  height: number
  dpr: number
  /** Internal consumers use a dab for chips; the picker uses the S-stroke. */
  sample?: 'stroke' | 'dab'
  /** Decoded stamp alpha, loaded by the UI when the tip has a texture. */
  alpha?: TipAlpha | null
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function parseColor(color: string): { r: number; g: number; b: number } {
  const hex = color.replace('#', '')
  if (!/^[\da-f]{6}$/i.test(hex)) return { r: 0, g: 0, b: 0 }
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  }
}

function cubic(
  a: StrokePoint,
  b: StrokePoint,
  c: StrokePoint,
  d: StrokePoint,
  t: number,
): StrokePoint {
  const inv = 1 - t
  return {
    x: inv ** 3 * a.x + 3 * inv ** 2 * t * b.x + 3 * inv * t ** 2 * c.x + t ** 3 * d.x,
    y: inv ** 3 * a.y + 3 * inv ** 2 * t * b.y + 3 * inv * t ** 2 * c.y + t ** 3 * d.y,
  }
}

function imageData(data: Uint8ClampedArray, width: number, height: number): ImageData {
  return typeof ImageData === 'undefined'
    ? ({ data, width, height } as ImageData)
    : new ImageData(data as ImageDataArray, width, height)
}

function sampleTipAlpha(
  alpha: TipAlpha | null | undefined,
  dabX: number,
  dabY: number,
  pixelCenterX: number,
  pixelCenterY: number,
  radius: number,
  angle: number,
  roundness: number,
  hardness: number,
  shape: 'round' | 'square',
): number {
  if (shape === 'square') {
    return squareTipCoverage(
      dabX,
      dabY,
      pixelCenterX,
      pixelCenterY,
      squareSideFromRadius(radius),
      hardness,
    )
  }
  const dx = pixelCenterX - dabX
  const dy = pixelCenterY - dabY
  const distance = tipDistance(dx, dy, radius, angle, roundness)
  if (distance > 1) return 0
  if (!alpha) return dabCoverage(distance, hardness)
  const radians = (angle * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos
  const sourceX = Math.min(
    alpha.width - 1,
    Math.max(0, Math.floor((localX / (radius * 2) + 0.5) * alpha.width)),
  )
  const sourceY = Math.min(
    alpha.height - 1,
    Math.max(
      0,
      Math.floor((localY / (radius * 2 * roundness) + 0.5) * alpha.height),
    ),
  )
  return (alpha.data[sourceY * alpha.width + sourceX]! / 255) * dabCoverage(distance, hardness)
}

/**
 * Draws a deterministic sample S-stroke without DOM/store reads. The caller
 * displays this ImageData on any canvas it owns.
 */
export function renderTipPreview(request: TipPreviewRequest): ImageData {
  const scale = Math.max(1, request.dpr || 1)
  const width = Math.max(1, Math.round(request.width * scale))
  const height = Math.max(1, Math.round(request.height * scale))
  const data = new Uint8ClampedArray(width * height * 4)
  const strokeCoverage = new Float32Array(width * height)
  if (request.mode === 'erase') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        const checker = (Math.floor(x / (6 * scale)) + Math.floor(y / (6 * scale))) % 2
        const shade = checker ? 186 : 218
        data[i] = shade
        data[i + 1] = shade
        data[i + 2] = shade
        data[i + 3] = 255
      }
    }
  }

  const color = parseColor(request.color)
  const shownSize = Math.min(request.size, 64) * scale
  const radius = Math.max(0.5, shownSize / 2)
  const hardness = clamp01(request.hardness)
  const roundness = Math.max(0.05, Math.min(1, request.roundness))
  const angle = request.tip.angle + request.angle
  const spacing = Math.max(0.5, shownSize * Math.max(0.02, request.spacing))
  const tipShape = request.tip.shape ?? 'round'
  const inset = Math.min(8 * scale, width / 8, height / 4)
  const points = Array.from({ length: 25 }, (_, index) => {
    const t = index / 24
    return cubic(
      { x: inset, y: height * 0.68 },
      { x: width * 0.3, y: inset },
      { x: width * 0.66, y: height - inset },
      { x: width - inset, y: height * 0.32 },
      t,
    )
  })

  const stamp = (point: StrokePoint, pressure: number) => {
    const dabRadius = radius * (0.35 + 0.65 * pressure)
    const extent = Math.ceil(dabRadius) + 1
    const x0 = Math.max(0, Math.floor(point.x - extent))
    const y0 = Math.max(0, Math.floor(point.y - extent))
    const x1 = Math.min(width, Math.ceil(point.x + extent))
    const y1 = Math.min(height, Math.ceil(point.y + extent))
    const flowAlpha = clamp01(request.flow) * (0.5 + 0.5 * pressure)
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const pixel = y * width + x
        const dabAlpha = sampleTipAlpha(
          request.alpha,
          point.x,
          point.y,
          x + 0.5,
          y + 0.5,
          dabRadius,
          angle,
          roundness,
          hardness,
          tipShape,
        ) * flowAlpha
        const accumulated = strokeCoverage[pixel]!
        const ceiling = clamp01(request.opacity)
        const a = Math.min(
          dabAlpha,
          Math.max(0, (ceiling - accumulated) / Math.max(1e-6, 1 - accumulated)),
        )
        if (a <= 0) continue
        strokeCoverage[pixel] = accumulated + a * (1 - accumulated)
        const i = (y * width + x) * 4
        if (request.mode === 'erase') {
          data[i + 3] = Math.round(data[i + 3]! * (1 - a))
          continue
        }
        const dstAlpha = data[i + 3]! / 255
        const outAlpha = a + dstAlpha * (1 - a)
        data[i] = Math.round((color.r * a + data[i]! * dstAlpha * (1 - a)) / outAlpha)
        data[i + 1] = Math.round((color.g * a + data[i + 1]! * dstAlpha * (1 - a)) / outAlpha)
        data[i + 2] = Math.round((color.b * a + data[i + 2]! * dstAlpha * (1 - a)) / outAlpha)
        data[i + 3] = Math.round(outAlpha * 255)
      }
    }
  }

  if (request.sample === 'dab') {
    stamp({ x: width / 2, y: height / 2 }, 1)
    return imageData(data, width, height)
  }
  stamp(points[0]!, 0.35)
  let residual = 0
  for (let i = 1; i < points.length; i++) {
    const progress = i / (points.length - 1)
    const pressure = progress < 0.55 ? 0.35 + (progress / 0.55) * 0.65 : 1 - ((progress - 0.55) / 0.45) * 0.5
    const walked = walkStroke(points[i - 1]!, points[i]!, spacing, residual, (point) =>
      stamp(point, pressure),
    )
    residual = walked.residual
  }
  return imageData(data, width, height)
}
