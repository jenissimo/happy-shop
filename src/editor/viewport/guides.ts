import { create } from 'zustand'
import type { Point } from './ViewportCamera'

export type DocumentGuide = {
  id: string
  axis: 'x' | 'y'
  pos: number
}

type GuidesState = {
  guides: DocumentGuide[]
  setGuides: (guides: readonly DocumentGuide[]) => void
  addGuide: (axis: DocumentGuide['axis'], pos: number) => string
  moveGuide: (id: string, pos: number) => void
  removeGuide: (id: string) => void
}

let sequence = 0

function validGuide(value: unknown): value is DocumentGuide {
  if (!value || typeof value !== 'object') return false
  const guide = value as Record<string, unknown>
  return (
    typeof guide.id === 'string' &&
    (guide.axis === 'x' || guide.axis === 'y') &&
    typeof guide.pos === 'number' &&
    Number.isFinite(guide.pos)
  )
}

export function parseGuides(value: unknown): DocumentGuide[] {
  if (!Array.isArray(value) || value.length > 200) return []
  return value.filter(validGuide).map((guide) => ({ ...guide }))
}

export const useGuidesStore = create<GuidesState>((set) => ({
  guides: [],
  setGuides: (guides) => set({ guides: parseGuides(guides) }),
  addGuide: (axis, pos) => {
    const id = `guide-${Date.now().toString(36)}-${++sequence}`
    set((state) => ({ guides: [...state.guides, { id, axis, pos }] }))
    return id
  },
  moveGuide: (id, pos) =>
    set((state) => ({
      guides: state.guides.map((guide) =>
        guide.id === id ? { ...guide, pos } : guide,
      ),
    })),
  removeGuide: (id) =>
    set((state) => ({ guides: state.guides.filter((guide) => guide.id !== id) })),
}))

/**
 * Snaps a pointer to the closest guide or document edge. `threshold` is in
 * document pixels so callers should scale their screen affordance by zoom.
 */
export function snapPointToGuides(
  point: Point,
  options: {
    enabled: boolean
    threshold: number
    width: number
    height: number
    guides?: readonly DocumentGuide[]
  },
): Point {
  if (!options.enabled) return point
  const guides = options.guides ?? useGuidesStore.getState().guides
  const xTargets = [0, options.width, ...guides.filter((g) => g.axis === 'x').map((g) => g.pos)]
  const yTargets = [0, options.height, ...guides.filter((g) => g.axis === 'y').map((g) => g.pos)]
  const nearest = (value: number, targets: readonly number[]) => {
    let result = value
    let distance = options.threshold
    for (const target of targets) {
      const nextDistance = Math.abs(target - value)
      if (nextDistance <= distance) {
        distance = nextDistance
        result = target
      }
    }
    return result
  }
  return { x: nearest(point.x, xTargets), y: nearest(point.y, yTargets) }
}

/** Align a transformed selection's bounds to a guide or document edge. */
export function snapBoundsTranslation(
  bounds: { left: number; top: number; right: number; bottom: number },
  options: {
    enabled: boolean
    threshold: number
    width: number
    height: number
    guides?: readonly DocumentGuide[]
  },
): Point {
  if (!options.enabled) return { x: 0, y: 0 }
  const guides = options.guides ?? useGuidesStore.getState().guides
  const pick = (candidates: readonly number[], targets: readonly number[]) => {
    let delta = 0
    let distance = options.threshold
    for (const candidate of candidates) {
      for (const target of targets) {
        const nextDistance = Math.abs(target - candidate)
        if (nextDistance <= distance) {
          distance = nextDistance
          delta = target - candidate
        }
      }
    }
    return delta
  }
  return {
    x: pick(
      [bounds.left, (bounds.left + bounds.right) / 2, bounds.right],
      [0, options.width, ...guides.filter((g) => g.axis === 'x').map((g) => g.pos)],
    ),
    y: pick(
      [bounds.top, (bounds.top + bounds.bottom) / 2, bounds.bottom],
      [0, options.height, ...guides.filter((g) => g.axis === 'y').map((g) => g.pos)],
    ),
  }
}
