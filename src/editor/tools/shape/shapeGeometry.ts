import type { ShapeLayer } from '../../../core/document'
import { parsePenSvgPath, penPathToSvgData, tessellatePenPath, type PenPath } from '../pen/penPath'

export type ShapePoint = { x: number; y: number }

export type ShapePath = {
  points: ShapePoint[]
  closed: boolean
}

const numberToken = /[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi

function regularPolygon(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  count: number,
  inset = 1,
): ShapePoint[] {
  const points: ShapePoint[] = []
  const total = inset < 1 ? count * 2 : count
  for (let i = 0; i < total; i++) {
    const radius = inset < 1 && i % 2 === 1 ? inset : 1
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / total
    points.push({
      x: cx + Math.cos(angle) * rx * radius,
      y: cy + Math.sin(angle) * ry * radius,
    })
  }
  return points
}

/**
 * Deliberately small, editable SVG path subset: moveto/lineto, horizontal /
 * vertical lines, cubic curves, and closepath.
 */
export function parseSimpleSvgPath(data: string): ShapePath | null {
  const pen = parsePenSvgPath(data)
  if (!pen) return null
  return penPathToShapePath(pen)
}

function penPathToShapePath(path: PenPath): ShapePath {
  return {
    points: tessellatePenPath(path, 16),
    closed: path.closed,
  }
}

export function polygonPointsAttributeToPath(points: string): ShapePath | null {
  const values = points.match(numberToken)?.map(Number) ?? []
  if (values.length < 4 || values.length % 2 !== 0 || values.some((v) => !Number.isFinite(v))) return null
  return {
    points: values.reduce<ShapePoint[]>((all, value, index) => {
      if (index % 2 === 0) all.push({ x: value, y: values[index + 1]! })
      return all
    }, []),
    closed: true,
  }
}

export function pathBounds(path: ShapePath): { x: number; y: number; w: number; h: number } {
  const xs = path.points.map((p) => p.x)
  const ys = path.points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) }
}

export function pathToSvgData(path: ShapePath, offsetX = 0, offsetY = 0): string {
  if (path.points.length === 0) return ''
  return penPathToSvgData(
    {
      anchors: path.points.map((point) => ({ x: point.x, y: point.y })),
      closed: path.closed,
    },
    offsetX,
    offsetY,
  )
}

export function shapePath(layer: Pick<ShapeLayer, 'primitive' | 'bounds' | 'sides' | 'starPoints' | 'starInset' | 'pathData'>): ShapePath | null {
  const { x, y, w, h } = layer.bounds
  switch (layer.primitive) {
    case 'polygon':
      return { points: regularPolygon(x + w / 2, y + h / 2, w / 2, h / 2, layer.sides ?? 5), closed: true }
    case 'star':
      return { points: regularPolygon(x + w / 2, y + h / 2, w / 2, h / 2, layer.starPoints ?? 5, layer.starInset ?? 0.5), closed: true }
    case 'line':
      return { points: [{ x, y: y + h }, { x: x + w, y }], closed: false }
    case 'arrow': {
      const head = Math.min(w, h) * 0.32
      const shaft = Math.max(1, h * 0.26)
      return { points: [
        { x, y: y + h / 2 - shaft / 2 }, { x: x + w - head, y: y + h / 2 - shaft / 2 },
        { x: x + w - head, y }, { x: x + w, y: y + h / 2 }, { x: x + w - head, y: y + h },
        { x: x + w - head, y: y + h / 2 + shaft / 2 }, { x, y: y + h / 2 + shaft / 2 },
      ], closed: true }
    }
    case 'svg-path':
      return layer.pathData ? parseSimpleSvgPath(layer.pathData) : null
    default:
      return null
  }
}

export function extractSimpleSvgPath(svg: string): ShapePath | null {
  const path = svg.match(/<path\b[^>]*\bd\s*=\s*["']([^"']+)["'][^>]*>/i)
  if (path) return parseSimpleSvgPath(path[1]!)
  const polygon = svg.match(/<(?:polygon|polyline)\b[^>]*\bpoints\s*=\s*["']([^"']+)["'][^>]*>/i)
  return polygon ? polygonPointsAttributeToPath(polygon[1]!) : null
}
