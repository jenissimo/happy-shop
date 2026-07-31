import { createPathId } from '../../../core/document/ids'
import type { PathKnot, VectorPath } from '../../../core/document/pathSchema'
import type { PenAnchor, PenPath } from '../pen/penPath'

export function penAnchorToKnot(anchor: PenAnchor): PathKnot {
  return {
    x: anchor.x,
    y: anchor.y,
    handleIn: anchor.in
      ? { x: anchor.in.x - anchor.x, y: anchor.in.y - anchor.y }
      : null,
    handleOut: anchor.out
      ? { x: anchor.out.x - anchor.x, y: anchor.out.y - anchor.y }
      : null,
  }
}

export function knotToPenAnchor(knot: PathKnot): PenAnchor {
  const anchor: PenAnchor = { x: knot.x, y: knot.y }
  if (knot.handleIn) {
    anchor.in = { x: knot.x + knot.handleIn.x, y: knot.y + knot.handleIn.y }
  }
  if (knot.handleOut) {
    anchor.out = { x: knot.x + knot.handleOut.x, y: knot.y + knot.handleOut.y }
  }
  return anchor
}

export function penPathToVectorPath(
  path: PenPath,
  name = 'Work Path',
  id = createPathId(),
): VectorPath {
  return {
    id,
    name,
    closed: path.closed,
    knots: path.anchors.map(penAnchorToKnot),
  }
}

export function vectorPathToPenPath(path: VectorPath): PenPath {
  return {
    closed: path.closed,
    anchors: path.knots.map(knotToPenAnchor),
  }
}
