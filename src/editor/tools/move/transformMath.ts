import type { Transform } from '../../../core/document'
import {
  documentToLayerLocal,
  layerLocalToDocument,
} from '../brush/layerCoords'
import type { Point } from '../../viewport/ViewportCamera'

const DEG = Math.PI / 180
const MIN_SCALE = 1e-3

export type HandleId =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'rotate'
  | 'body'

/** Content rectangle in layer-local space (before transform). */
export type LocalBounds = {
  x: number
  y: number
  w: number
  h: number
}

export type TransformBox = {
  bounds: LocalBounds
  transform: Transform
}

type ScaleHandleId = Exclude<HandleId, 'rotate' | 'body'>
type EdgeHandleId = 'n' | 'e' | 's' | 'w'

const CORNER_HANDLES: ScaleHandleId[] = ['nw', 'ne', 'se', 'sw']
const EDGE_HANDLES: EdgeHandleId[] = ['n', 'e', 's', 'w']

export function localCorner(
  bounds: LocalBounds,
  handle: Exclude<HandleId, 'rotate' | 'body'>,
): Point {
  const { x, y, w, h } = bounds
  switch (handle) {
    case 'nw':
      return { x, y }
    case 'n':
      return { x: x + w / 2, y }
    case 'ne':
      return { x: x + w, y }
    case 'e':
      return { x: x + w, y: y + h / 2 }
    case 'se':
      return { x: x + w, y: y + h }
    case 's':
      return { x: x + w / 2, y: y + h }
    case 'sw':
      return { x, y: y + h }
    case 'w':
      return { x, y: y + h / 2 }
  }
}

export function oppositeHandle(
  handle: Exclude<HandleId, 'rotate' | 'body'>,
): Exclude<HandleId, 'rotate' | 'body'> {
  const map: Record<Exclude<HandleId, 'rotate' | 'body'>, Exclude<HandleId, 'rotate' | 'body'>> = {
    nw: 'se',
    n: 's',
    ne: 'sw',
    e: 'w',
    se: 'nw',
    s: 'n',
    sw: 'ne',
    w: 'e',
  }
  return map[handle]
}

/** Four corners TL→TR→BR→BL in document space. */
export function boxCorners(box: TransformBox): [Point, Point, Point, Point] {
  const { bounds: b, transform: t } = box
  return [
    layerLocalToDocument({ x: b.x, y: b.y }, t),
    layerLocalToDocument({ x: b.x + b.w, y: b.y }, t),
    layerLocalToDocument({ x: b.x + b.w, y: b.y + b.h }, t),
    layerLocalToDocument({ x: b.x, y: b.y + b.h }, t),
  ]
}

export function boxCenter(box: TransformBox): Point {
  const { bounds: b, transform: t } = box
  return layerLocalToDocument(
    { x: b.x + b.w / 2, y: b.y + b.h / 2 },
    t,
  )
}

/** Top-center of the box in document space (for rotation stem). */
export function boxTopCenter(box: TransformBox): Point {
  return layerLocalToDocument(localCorner(box.bounds, 'n'), box.transform)
}

export function rotateHandlePosition(
  box: TransformBox,
  offsetDoc: number,
): Point {
  const top = boxTopCenter(box)
  const center = boxCenter(box)
  const dx = top.x - center.x
  const dy = top.y - center.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  return {
    x: top.x + ux * offsetDoc,
    y: top.y + uy * offsetDoc,
  }
}

export function handlePositions(
  box: TransformBox,
  rotateOffsetDoc: number,
): Record<Exclude<HandleId, 'body'>, Point> {
  const out = {} as Record<Exclude<HandleId, 'body'>, Point>
  for (const id of [...CORNER_HANDLES, ...EDGE_HANDLES]) {
    out[id] = layerLocalToDocument(localCorner(box.bounds, id), box.transform)
  }
  out.rotate = rotateHandlePosition(box, rotateOffsetDoc)
  return out
}

export function hitTestHandle(
  doc: Point,
  box: TransformBox,
  handleRadiusDoc: number,
  rotateOffsetDoc: number,
): HandleId | null {
  const positions = handlePositions(box, rotateOffsetDoc)
  const r2 = handleRadiusDoc * handleRadiusDoc

  // Prefer rotate, then corners, then edges.
  const order: Array<Exclude<HandleId, 'body'>> = [
    'rotate',
    ...CORNER_HANDLES,
    ...EDGE_HANDLES,
  ]
  for (const id of order) {
    const p = positions[id]
    const dx = doc.x - p.x
    const dy = doc.y - p.y
    if (dx * dx + dy * dy <= r2) return id
  }

  if (pointInOrientedBox(doc, box)) return 'body'
  return null
}

/** Point-in-OBB via inverse transform into local space. */
export function pointInOrientedBox(doc: Point, box: TransformBox): boolean {
  const local = documentToLayerLocal(doc, box.transform)
  const { x, y, w, h } = box.bounds
  return local.x >= x && local.x <= x + w && local.y >= y && local.y <= y + h
}

export function applyMove(
  transform: Transform,
  dx: number,
  dy: number,
): Transform {
  return {
    ...transform,
    x: transform.x + dx,
    y: transform.y + dy,
  }
}

/**
 * Rotate around the content center, preserving center in document space.
 */
export function applyRotateAroundCenter(
  box: TransformBox,
  newRotationDeg: number,
): Transform {
  const center = boxCenter(box)
  const next: Transform = {
    ...box.transform,
    rotationDeg: newRotationDeg,
  }
  const centerAfter = layerLocalToDocument(
    {
      x: box.bounds.x + box.bounds.w / 2,
      y: box.bounds.y + box.bounds.h / 2,
    },
    next,
  )
  return {
    ...next,
    x: next.x + (center.x - centerAfter.x),
    y: next.y + (center.y - centerAfter.y),
  }
}

/**
 * Absolute angle (degrees) from box center to a document point.
 */
export function angleFromCenterDeg(center: Point, doc: Point): number {
  return (Math.atan2(doc.y - center.y, doc.x - center.x) / DEG)
}

/**
 * Scale so the opposite handle stays fixed in document space.
 * `keepAspect` locks scaleX/scaleY ratio from the start transform.
 */
export function applyScaleFromHandle(
  start: TransformBox,
  handle: Exclude<HandleId, 'rotate' | 'body'>,
  pointerDoc: Point,
  options?: { keepAspect?: boolean },
): Transform {
  const keepAspect = options?.keepAspect ?? false
  const fixedHandle = oppositeHandle(handle)
  const fixedLocal = localCorner(start.bounds, fixedHandle)
  const fixedDoc = layerLocalToDocument(fixedLocal, start.transform)

  // Express pointer & fixed in the start layer's oriented, unscaled frame.
  const alignedPtr = toAlignedUnscaled(pointerDoc, start.transform)
  const alignedFixed = toAlignedUnscaled(fixedDoc, start.transform)

  const { w, h } = start.bounds
  if (w < 1e-6 || h < 1e-6) return { ...start.transform }

  let newScaleX = start.transform.scaleX
  let newScaleY = start.transform.scaleY

  const affectsX = handle === 'e' || handle === 'w' || CORNER_HANDLES.includes(handle)
  const affectsY = handle === 'n' || handle === 's' || CORNER_HANDLES.includes(handle)

  // Sign: which side of the fixed point the moving handle lives on.
  const moveLocal = localCorner(start.bounds, handle)
  const signX = Math.sign(moveLocal.x - fixedLocal.x) || 1
  const signY = Math.sign(moveLocal.y - fixedLocal.y) || 1

  if (affectsX) {
    const spanLocal = Math.abs(moveLocal.x - fixedLocal.x) || w
    const spanAligned = (alignedPtr.x - alignedFixed.x) * signX
    newScaleX = (spanAligned / spanLocal) * Math.sign(start.transform.scaleX || 1)
    if (Math.abs(newScaleX) < MIN_SCALE) {
      newScaleX = MIN_SCALE * Math.sign(newScaleX || start.transform.scaleX || 1)
    }
  }
  if (affectsY) {
    const spanLocal = Math.abs(moveLocal.y - fixedLocal.y) || h
    const spanAligned = (alignedPtr.y - alignedFixed.y) * signY
    newScaleY = (spanAligned / spanLocal) * Math.sign(start.transform.scaleY || 1)
    if (Math.abs(newScaleY) < MIN_SCALE) {
      newScaleY = MIN_SCALE * Math.sign(newScaleY || start.transform.scaleY || 1)
    }
  }

  if (keepAspect && (affectsX || affectsY)) {
    const startAbsX = Math.abs(start.transform.scaleX) || 1
    const startAbsY = Math.abs(start.transform.scaleY) || 1
    const ratio = startAbsX / startAbsY
    if (affectsX && affectsY) {
      // Match the dominant axis change.
      const rx = Math.abs(newScaleX) / startAbsX
      const ry = Math.abs(newScaleY) / startAbsY
      if (rx > ry) {
        newScaleY =
          (Math.abs(newScaleX) / ratio) * Math.sign(newScaleY || start.transform.scaleY || 1)
      } else {
        newScaleX =
          Math.abs(newScaleY) * ratio * Math.sign(newScaleX || start.transform.scaleX || 1)
      }
    } else if (affectsX) {
      newScaleY =
        (Math.abs(newScaleX) / ratio) * Math.sign(start.transform.scaleY || 1)
    } else {
      newScaleX =
        Math.abs(newScaleY) * ratio * Math.sign(start.transform.scaleX || 1)
    }
  }

  // Build transform with new scale, then shift so fixed corner stays put.
  const scaled: Transform = {
    ...start.transform,
    scaleX: newScaleX,
    scaleY: newScaleY,
  }
  const fixedAfter = layerLocalToDocument(fixedLocal, scaled)
  return {
    ...scaled,
    x: scaled.x + (fixedDoc.x - fixedAfter.x),
    y: scaled.y + (fixedDoc.y - fixedAfter.y),
  }
}

/**
 * Document → layer axes with scale removed (rotation/skew/pivot/translation only).
 * Units match local space at scale 1.
 */
export function toAlignedUnscaled(doc: Point, t: Transform): Point {
  const unit: Transform = { ...t, scaleX: 1, scaleY: 1 }
  return documentToLayerLocal(doc, unit)
}

export function normalizeRotationDelta(
  startAngleDeg: number,
  currentAngleDeg: number,
): number {
  let d = currentAngleDeg - startAngleDeg
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return d
}

export function isEdgeHandle(handle: HandleId): handle is EdgeHandleId {
  return handle !== 'rotate' && handle !== 'body' && EDGE_HANDLES.includes(handle as EdgeHandleId)
}

export function isCornerHandle(
  handle: HandleId,
): handle is Exclude<HandleId, 'rotate' | 'body'> {
  return handle !== 'rotate' && handle !== 'body' && CORNER_HANDLES.includes(handle)
}

/**
 * Skew so the opposite edge stays fixed in document space (Photoshop: Ctrl+side handle).
 * Top/bottom handles adjust skewX; left/right handles adjust skewY.
 */
export function applySkewFromHandle(
  start: TransformBox,
  handle: Exclude<HandleId, 'rotate' | 'body'>,
  pointerDoc: Point,
): Transform | null {
  if (!isEdgeHandle(handle)) return null
  if (handle === 'n' || handle === 's') {
    return applySkewXFromEdge(start, handle, pointerDoc)
  }
  return applySkewYFromEdge(start, handle, pointerDoc)
}

function applySkewXFromEdge(
  start: TransformBox,
  handle: 'n' | 's',
  pointerDoc: Point,
): Transform {
  const fixedHandle = oppositeHandle(handle)
  const fixedLocal = localCorner(start.bounds, fixedHandle)
  const moveLocal = localCorner(start.bounds, handle)
  const fixedDoc = layerLocalToDocument(fixedLocal, start.transform)
  const span =
    Math.abs(moveLocal.y - fixedLocal.y) || start.bounds.h || 1
  const alignedPtr = toAlignedUnscaled(pointerDoc, start.transform)
  const alignedFixed = toAlignedUnscaled(fixedDoc, start.transform)
  const deltaX = alignedPtr.x - alignedFixed.x
  const tanSkew = handle === 's' ? deltaX / span : -deltaX / span
  const skewed: Transform = {
    ...start.transform,
    skewXDeg: Math.atan(tanSkew) / DEG,
  }
  const fixedAfter = layerLocalToDocument(fixedLocal, skewed)
  return {
    ...skewed,
    x: skewed.x + (fixedDoc.x - fixedAfter.x),
    y: skewed.y + (fixedDoc.y - fixedAfter.y),
  }
}

function applySkewYFromEdge(
  start: TransformBox,
  handle: 'e' | 'w',
  pointerDoc: Point,
): Transform {
  const fixedHandle = oppositeHandle(handle)
  const fixedLocal = localCorner(start.bounds, fixedHandle)
  const moveLocal = localCorner(start.bounds, handle)
  const fixedDoc = layerLocalToDocument(fixedLocal, start.transform)
  const span =
    Math.abs(moveLocal.x - fixedLocal.x) || start.bounds.w || 1
  const alignedPtr = toAlignedUnscaled(pointerDoc, start.transform)
  const alignedFixed = toAlignedUnscaled(fixedDoc, start.transform)
  const deltaY = alignedPtr.y - alignedFixed.y
  const tanSkew = handle === 'e' ? deltaY / span : -deltaY / span
  const skewed: Transform = {
    ...start.transform,
    skewYDeg: Math.atan(tanSkew) / DEG,
  }
  const fixedAfter = layerLocalToDocument(fixedLocal, skewed)
  return {
    ...skewed,
    x: skewed.x + (fixedDoc.x - fixedAfter.x),
    y: skewed.y + (fixedDoc.y - fixedAfter.y),
  }
}

/** @internal exported for tests */
export const __test = {
  CORNER_HANDLES,
  EDGE_HANDLES,
  MIN_SCALE,
}
