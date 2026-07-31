/** Viewport transform helpers (resize / aspect lock / snap). */

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export const MIN_NODE_SIZE = 8

export type RectBox = { x: number; y: number; w: number; h: number }

export type Bounds = { left: number; top: number; right: number; bottom: number }

export type Guide = {
  axis: 'x' | 'y'
  pos: number
  kind: 'grid' | 'edge' | 'center' | 'node'
}

export type SnapSettings = {
  enabled: boolean
  grid: number
  threshold: number
  toGrid: boolean
  toCanvas: boolean
  toNodes: boolean
}

export const DEFAULT_SNAP: SnapSettings = {
  enabled: true,
  grid: 8,
  threshold: 6,
  toGrid: true,
  toCanvas: true,
  toNodes: true,
}

export function boxToBounds(b: RectBox): Bounds {
  return { left: b.x, top: b.y, right: b.x + b.w, bottom: b.y + b.h }
}

export function boundsToBox(b: Bounds): RectBox {
  return {
    x: Math.round(b.left),
    y: Math.round(b.top),
    w: Math.max(1, Math.round(b.right - b.left)),
    h: Math.max(1, Math.round(b.bottom - b.top)),
  }
}

export function otherBounds(
  nodes: Array<{ id: string; x: number; y: number; w: number; h: number }>,
  exceptId: string,
): Bounds[] {
  return nodes
    .filter((n) => n.id !== exceptId)
    .map((n) => ({ left: n.x, top: n.y, right: n.x + n.w, bottom: n.y + n.h }))
}

/**
 * Resize from an 8-handle. When `lockAspect` is true (Shift), keep
 * original w/h ratio — corner handles fix the opposite corner; edge
 * handles scale the orthogonal axis about the center.
 */
export function applyResize(
  orig: RectBox,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  lockAspect = false,
): RectBox {
  let left = orig.x
  let top = orig.y
  let right = orig.x + orig.w
  let bottom = orig.y + orig.h

  if (handle.includes('w')) left = orig.x + dx
  if (handle.includes('e')) right = orig.x + orig.w + dx
  if (handle.includes('n')) top = orig.y + dy
  if (handle.includes('s')) bottom = orig.y + orig.h + dy

  if (right - left < MIN_NODE_SIZE) {
    if (handle.includes('w')) left = right - MIN_NODE_SIZE
    else right = left + MIN_NODE_SIZE
  }
  if (bottom - top < MIN_NODE_SIZE) {
    if (handle.includes('n')) top = bottom - MIN_NODE_SIZE
    else bottom = top + MIN_NODE_SIZE
  }

  if (lockAspect && orig.w > 0 && orig.h > 0) {
    const aspect = orig.w / orig.h
    let w = right - left
    let h = bottom - top
    const isCorner = handle.length === 2
    const isHorizontal = handle === 'e' || handle === 'w'
    const isVertical = handle === 'n' || handle === 's'

    if (isCorner) {
      if (Math.abs(w / orig.w) >= Math.abs(h / orig.h)) {
        h = w / aspect
      } else {
        w = h * aspect
      }
    } else if (isHorizontal) {
      h = w / aspect
    } else if (isVertical) {
      w = h * aspect
    }

    if (w < MIN_NODE_SIZE) {
      w = MIN_NODE_SIZE
      h = w / aspect
    }
    if (h < MIN_NODE_SIZE) {
      h = MIN_NODE_SIZE
      w = h * aspect
    }
    if (w < MIN_NODE_SIZE) {
      w = MIN_NODE_SIZE
      h = Math.max(MIN_NODE_SIZE, w / aspect)
    }

    if (handle.includes('w')) left = right - w
    else if (handle.includes('e')) right = left + w
    else {
      const cx = orig.x + orig.w / 2
      left = cx - w / 2
      right = left + w
    }

    if (handle.includes('n')) top = bottom - h
    else if (handle.includes('s')) bottom = top + h
    else {
      const cy = orig.y + orig.h / 2
      top = cy - h / 2
      bottom = top + h
    }
  }

  return {
    x: Math.round(left),
    y: Math.round(top),
    w: Math.round(right - left),
    h: Math.round(bottom - top),
  }
}

type SnapTarget = { pos: number; kind: Guide['kind'] }

function collectTargets(
  axis: 'x' | 'y',
  settings: SnapSettings,
  others: Bounds[],
  canvasW: number,
  canvasH: number,
): SnapTarget[] {
  const targets: SnapTarget[] = []
  const size = axis === 'x' ? canvasW : canvasH

  if (settings.toCanvas) {
    targets.push({ pos: 0, kind: 'edge' })
    targets.push({ pos: size, kind: 'edge' })
    targets.push({ pos: size / 2, kind: 'center' })
  }

  if (settings.toGrid && settings.grid > 0) {
    for (let p = 0; p <= size; p += settings.grid) {
      targets.push({ pos: p, kind: 'grid' })
    }
  }

  if (settings.toNodes) {
    for (const r of others) {
      if (axis === 'x') {
        targets.push({ pos: r.left, kind: 'node' })
        targets.push({ pos: r.right, kind: 'node' })
        targets.push({ pos: (r.left + r.right) / 2, kind: 'node' })
      } else {
        targets.push({ pos: r.top, kind: 'node' })
        targets.push({ pos: r.bottom, kind: 'node' })
        targets.push({ pos: (r.top + r.bottom) / 2, kind: 'node' })
      }
    }
  }

  return targets
}

function nearestSnap(
  value: number,
  targets: SnapTarget[],
  threshold: number,
  prefer: 'any' | 'strong' = 'any',
): { value: number; guide: Guide | null } {
  let best: SnapTarget | null = null
  let bestScore = Infinity
  for (const t of targets) {
    if (prefer === 'strong' && t.kind === 'grid') continue
    const d = Math.abs(t.pos - value)
    if (d > threshold) continue
    // Prefer structural snaps over dense grid when distances are close.
    const score = d + (t.kind === 'grid' ? threshold * 0.35 : 0)
    if (score < bestScore) {
      bestScore = score
      best = t
    }
  }
  if (!best) return { value, guide: null }
  return {
    value: best.pos,
    guide: {
      axis: 'x',
      pos: best.pos,
      kind: best.kind,
    },
  }
}

/** Snap a moving rect (translation). Returns new bounds and guides. */
export function snapTranslate(
  rect: Bounds,
  settings: SnapSettings,
  others: Bounds[],
  canvasW: number,
  canvasH: number,
): { rect: Bounds; guides: Guide[] } {
  if (!settings.enabled) return { rect, guides: [] }

  const w = rect.right - rect.left
  const h = rect.bottom - rect.top
  const guides: Guide[] = []

  const xTargets = collectTargets('x', settings, others, canvasW, canvasH)
  const yTargets = collectTargets('y', settings, others, canvasW, canvasH)

  const candidatesX = [rect.left, rect.left + w / 2, rect.right]
  const candidatesY = [rect.top, rect.top + h / 2, rect.bottom]

  const pickAxis = (
    axis: 'x' | 'y',
    candidates: number[],
    targets: SnapTarget[],
  ): { delta: number; guide: Guide | null } => {
    let bestDelta = 0
    let bestScore = Infinity
    let bestGuide: Guide | null = null
    for (const prefer of ['strong', 'any'] as const) {
      for (const c of candidates) {
        const { value, guide } = nearestSnap(
          c,
          targets,
          settings.threshold,
          prefer,
        )
        if (!guide) continue
        const d = Math.abs(value - c)
        const score = d + (guide.kind === 'grid' ? settings.threshold * 0.35 : 0)
        if (score < bestScore) {
          bestScore = score
          bestDelta = value - c
          bestGuide = { ...guide, axis, pos: value }
        }
      }
      if (bestGuide && bestGuide.kind !== 'grid') break
    }
    return { delta: bestDelta, guide: bestGuide }
  }

  const x = pickAxis('x', candidatesX, xTargets)
  const y = pickAxis('y', candidatesY, yTargets)
  if (x.guide) guides.push(x.guide)
  if (y.guide) guides.push(y.guide)

  return {
    rect: {
      left: rect.left + x.delta,
      right: rect.right + x.delta,
      top: rect.top + y.delta,
      bottom: rect.bottom + y.delta,
    },
    guides,
  }
}

/** Apply resize from a handle, then snap the moving edges. */
export function snapResize(
  start: Bounds,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  settings: SnapSettings,
  others: Bounds[],
  canvasW: number,
  canvasH: number,
  minSize = MIN_NODE_SIZE,
): { rect: Bounds; guides: Guide[] } {
  let { left, top, right, bottom } = start

  if (handle.includes('w')) left = start.left + dx
  if (handle.includes('e')) right = start.right + dx
  if (handle.includes('n')) top = start.top + dy
  if (handle.includes('s')) bottom = start.bottom + dy

  if (right - left < minSize) {
    if (handle.includes('w')) left = right - minSize
    else right = left + minSize
  }
  if (bottom - top < minSize) {
    if (handle.includes('n')) top = bottom - minSize
    else bottom = top + minSize
  }

  if (!settings.enabled) {
    return { rect: { left, top, right, bottom }, guides: [] }
  }

  const guides: Guide[] = []
  const xTargets = collectTargets('x', settings, others, canvasW, canvasH)
  const yTargets = collectTargets('y', settings, others, canvasW, canvasH)

  if (handle.includes('w')) {
    const { value, guide } = nearestSnap(left, xTargets, settings.threshold)
    if (guide && right - value >= minSize) {
      left = value
      guides.push({ ...guide, axis: 'x', pos: value })
    }
  }
  if (handle.includes('e')) {
    const { value, guide } = nearestSnap(right, xTargets, settings.threshold)
    if (guide && value - left >= minSize) {
      right = value
      guides.push({ ...guide, axis: 'x', pos: value })
    }
  }
  if (handle.includes('n')) {
    const { value, guide } = nearestSnap(top, yTargets, settings.threshold)
    if (guide && bottom - value >= minSize) {
      top = value
      guides.push({ ...guide, axis: 'y', pos: value })
    }
  }
  if (handle.includes('s')) {
    const { value, guide } = nearestSnap(bottom, yTargets, settings.threshold)
    if (guide && value - top >= minSize) {
      bottom = value
      guides.push({ ...guide, axis: 'y', pos: value })
    }
  }

  return { rect: { left, top, right, bottom }, guides }
}
