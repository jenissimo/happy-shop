import type { CursorId } from './cursorIds'
import type { HandleId } from '../tools/move/transformMath'

type ScaleHandle = Exclude<HandleId, 'rotate' | 'body'>

const HANDLE_BASE_DEG: Record<ScaleHandle, number> = {
  e: 0,
  se: 45,
  s: 90,
  sw: 135,
  w: 180,
  nw: 225,
  n: 270,
  ne: 315,
}

const SNAP: Array<{ deg: number; id: CursorId }> = [
  { deg: 0, id: 'resize-e' },
  { deg: 45, id: 'resize-se' },
  { deg: 90, id: 'resize-s' },
  { deg: 135, id: 'resize-sw' },
  { deg: 180, id: 'resize-w' },
  { deg: 225, id: 'resize-nw' },
  { deg: 270, id: 'resize-n' },
  { deg: 315, id: 'resize-ne' },
]

function normalizeDeg(deg: number): number {
  let d = deg % 360
  if (d < 0) d += 360
  return d
}

/** Map scale handle + layer rotation → nearest CSS resize cursor id. */
export function resizeCursorIdForHandle(
  handle: ScaleHandle,
  rotationDeg: number,
): CursorId {
  const angle = normalizeDeg(HANDLE_BASE_DEG[handle] + rotationDeg)
  let best = SNAP[0]!
  let bestDist = Infinity
  for (const s of SNAP) {
    let dist = Math.abs(angle - s.deg)
    if (dist > 180) dist = 360 - dist
    if (dist < bestDist) {
      bestDist = dist
      best = s
    }
  }
  return best.id
}
