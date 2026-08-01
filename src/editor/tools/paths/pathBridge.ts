import { createPathId } from '../../../core/document/ids'
import type { PathKnot, PathSubpath, VectorPath } from '../../../core/document/pathSchema'
import type { PenAnchor, PenPath, PenSubpath } from '../pen/penPath'

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
    linked: anchor.linked,
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
  if (knot.linked !== undefined) anchor.linked = knot.linked
  return anchor
}

function penSubpathToPathSubpath(sp: PenSubpath): PathSubpath {
  return {
    closed: sp.closed,
    knots: sp.anchors.map(penAnchorToKnot),
  }
}

function pathSubpathToPenSubpath(sp: PathSubpath): PenSubpath {
  return {
    closed: sp.closed,
    anchors: sp.knots.map(knotToPenAnchor),
  }
}

export function penPathToVectorPath(
  path: PenPath,
  name = 'Work Path',
  id = createPathId(),
): VectorPath {
  const subpaths = path.subpaths
    .filter((sp) => sp.anchors.length > 0)
    .map(penSubpathToPathSubpath)
  return {
    id,
    name,
    fillRule: path.fillRule,
    subpaths: subpaths.length > 0 ? subpaths : [{ closed: false, knots: [{ x: 0, y: 0, handleIn: null, handleOut: null }] }],
  }
}

export function vectorPathToPenPath(path: VectorPath): PenPath {
  return {
    fillRule: path.fillRule,
    subpaths: path.subpaths.map(pathSubpathToPenSubpath),
  }
}
