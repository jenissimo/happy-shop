import type { RenderLayerTransform } from '../../rendering/contracts'

/**
 * 2x2 linear part + translation of an affine transform, in the same order Pixi
 * applies a display object's properties:
 *
 *   M = T(x, y) · K(rotation, skew) · S(scaleX, scaleY) · T(-pivot)
 *
 * where `K·S` is Pixi's `updateLocalTransform` matrix
 * (`a = cos(rot + skewY)·scaleX`, `d = cos(rot - skewX)·scaleY`, ...).
 */
type Affine = {
  a: number
  b: number
  c: number
  d: number
  tx: number
  ty: number
}

const DEG = Math.PI / 180

export function transformToAffine(t: RenderLayerTransform): Affine {
  const rotation = t.rotationDeg * DEG
  const skewX = t.skewXDeg * DEG
  const skewY = t.skewYDeg * DEG
  const a = Math.cos(rotation + skewY) * t.scaleX
  const b = Math.sin(rotation + skewY) * t.scaleX
  const c = -Math.sin(rotation - skewX) * t.scaleY
  const d = Math.cos(rotation - skewX) * t.scaleY
  return {
    a,
    b,
    c,
    d,
    tx: t.x - (t.pivotX * a + t.pivotY * c),
    ty: t.y - (t.pivotX * b + t.pivotY * d),
  }
}

function multiply(outer: Affine, inner: Affine): Affine {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    tx: outer.a * inner.tx + outer.c * inner.ty + outer.tx,
    ty: outer.b * inner.tx + outer.d * inner.ty + outer.ty,
  }
}

export function isIdentityTransform(t: RenderLayerTransform): boolean {
  return (
    t.x === 0 &&
    t.y === 0 &&
    t.scaleX === 1 &&
    t.scaleY === 1 &&
    t.rotationDeg === 0 &&
    t.skewXDeg === 0 &&
    t.skewYDeg === 0 &&
    t.pivotX === 0 &&
    t.pivotY === 0
  )
}

/** Angles closer than this are collapsed to a pure rotation (no skew). */
const SKEW_EPSILON = 1e-9

/**
 * Composes a parent transform onto a child transform, keeping the child's pivot
 * so the result stays meaningful to whoever authored it (rotation still happens
 * about the same content point, now carried by the parent as well).
 *
 * The parent/child pair is a general affine matrix, which the
 * rotation+skew+scale form can always express: `rot + skewY` and `rot - skewX`
 * are two independent angles, so any 2x2 matrix (including reflections) is
 * representable. Pure rotations are emitted as rotation with zero skew so
 * round-tripping an unskewed stack does not introduce skew noise.
 */
export function composeLayerTransforms(
  parent: RenderLayerTransform,
  child: RenderLayerTransform,
): RenderLayerTransform {
  // Fast path: the overwhelmingly common case is an untransformed group, where
  // recomposition would only add floating-point noise to every child.
  if (isIdentityTransform(parent)) return { ...child }

  const m = multiply(transformToAffine(parent), transformToAffine(child))

  const angleX = Math.atan2(m.b, m.a) // rotation + skewY
  const angleY = Math.atan2(-m.c, m.d) // rotation - skewX
  const scaleX = Math.hypot(m.a, m.b)
  const scaleY = Math.hypot(m.c, m.d)

  const pure = Math.abs(angleX - angleY) < SKEW_EPSILON
  const rotationDeg = pure ? angleX / DEG : 0
  const skewYDeg = pure ? 0 : angleX / DEG
  const skewXDeg = pure ? 0 : -angleY / DEG

  // Keep the child's pivot: re-derive the position so the pivot point still
  // lands where the composed matrix puts it.
  const pivotX = child.pivotX
  const pivotY = child.pivotY
  return {
    x: m.a * pivotX + m.c * pivotY + m.tx,
    y: m.b * pivotX + m.d * pivotY + m.ty,
    scaleX,
    scaleY,
    rotationDeg,
    skewXDeg,
    skewYDeg,
    pivotX,
    pivotY,
  }
}
