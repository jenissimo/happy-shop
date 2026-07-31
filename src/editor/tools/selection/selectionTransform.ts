import { create } from 'zustand'
import type { CommandRegistry } from '../../../core/commands/registry'
import { createIdentityTransform, type Transform } from '../../../core/document'
import { SelectionMask } from '../../session/SelectionMask'
import { useSelectionStore } from '../../session/selectionStore'
import type { Point } from '../../viewport/ViewportCamera'
import {
  angleFromCenterDeg,
  applyMove,
  applyRotateAroundCenter,
  applyScaleFromHandle,
  applySkewFromHandle,
  boxCenter,
  boxCorners,
  hitTestHandle,
  isCornerHandle,
  isEdgeHandle,
  normalizeRotationDelta,
  type HandleId,
  type TransformBox,
} from '../move/transformMath'
import { NO_MODIFIERS, type ToolModifiers } from '../toolModifiers'

export type SelectionQuad = [Point, Point, Point, Point]

export type SelectionPerspective = {
  sourceQuad: SelectionQuad
  destQuad: SelectionQuad
}

export type SelectionTransformSession = {
  baseline: SelectionMask
  bounds: { x: number; y: number; width: number; height: number }
  transform: Transform
  perspective: SelectionPerspective | null
}

type SelectionTransformState = {
  session: SelectionTransformSession | null
  activeHandle: HandleId | null
  gesturing: boolean
  begin: (session: SelectionTransformSession) => void
  end: () => void
  setTransform: (transform: Transform) => void
  setPerspective: (perspective: SelectionPerspective | null) => void
  setActiveHandle: (handle: HandleId | null) => void
  setGesturing: (gesturing: boolean) => void
}

export const useSelectionTransformStore = create<SelectionTransformState>((set) => ({
  session: null,
  activeHandle: null,
  gesturing: false,
  begin: (session) => set({ session, activeHandle: null, gesturing: false }),
  end: () => set({ session: null, activeHandle: null, gesturing: false }),
  setTransform: (transform) =>
    set((state) =>
      state.session ? { session: { ...state.session, transform } } : state,
    ),
  setPerspective: (perspective) =>
    set((state) =>
      state.session ? { session: { ...state.session, perspective } } : state,
    ),
  setActiveHandle: (activeHandle) => set({ activeHandle }),
  setGesturing: (gesturing) => set({ gesturing }),
}))

export function resampleSelectionMask(session: SelectionTransformSession): SelectionMask {
  const { baseline, transform, perspective } = session
  if (perspective) {
    return baseline.resampleAffineProjective(
      transform,
      [...perspective.sourceQuad],
      [...perspective.destQuad],
    )
  }
  return baseline.affineTransform(transform)
}

export function beginSelectionTransform(): boolean {
  const mask = useSelectionStore.getState().mask
  const bounds = mask?.bounds()
  if (!mask || !bounds || mask.isEmpty()) return false
  useSelectionTransformStore.getState().begin({
    baseline: mask.clone(),
    bounds,
    transform: createIdentityTransform(),
    perspective: null,
  })
  return true
}

export function registerSelectionTransformCommand(registry: CommandRegistry): void {
  registry.register({
    id: 'select.transformSelection',
    title: 'Transform Selection',
    enabled: () =>
      useSelectionTransformStore.getState().session !== null ||
      useSelectionStore.getState().hasSelection(),
    run: () => {
      if (useSelectionTransformStore.getState().session) {
        commitSelectionTransform()
        return
      }
      beginSelectionTransform()
    },
  })
}

export function commitSelectionTransform(): boolean {
  if (!useSelectionTransformStore.getState().session) return false
  useSelectionTransformStore.getState().end()
  return true
}

export function cancelSelectionTransform(): boolean {
  const session = useSelectionTransformStore.getState().session
  if (!session) return false
  useSelectionStore.getState().setMask(session.baseline.clone())
  useSelectionTransformStore.getState().end()
  return true
}

function selectionBox(session: SelectionTransformSession): TransformBox {
  return {
    bounds: {
      x: session.bounds.x,
      y: session.bounds.y,
      w: session.bounds.width,
      h: session.bounds.height,
    },
    transform: session.transform,
  }
}

function cornerIndex(handle: Exclude<HandleId, 'rotate' | 'body'>): number {
  switch (handle) {
    case 'nw':
      return 0
    case 'ne':
      return 1
    case 'se':
      return 2
    case 'sw':
      return 3
    default:
      return 0
  }
}

function quadKey(quad: SelectionQuad): string {
  return quad.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('|')
}

function applySessionToMask(session: SelectionTransformSession): void {
  useSelectionStore.getState().setMask(resampleSelectionMask(session))
}

type Gesture =
  | { kind: 'move'; pointerId: number; lastDoc: Point }
  | {
      kind: 'scale'
      pointerId: number
      handle: Exclude<HandleId, 'rotate' | 'body'>
      startBox: TransformBox
      keepAspect: boolean
    }
  | {
      kind: 'skew'
      pointerId: number
      handle: Exclude<HandleId, 'rotate' | 'body'>
      startBox: TransformBox
    }
  | {
      kind: 'perspective'
      pointerId: number
      handle: Exclude<HandleId, 'rotate' | 'body'>
      sourceQuad: SelectionQuad
      destQuad: SelectionQuad
    }
  | {
      kind: 'rotate'
      pointerId: number
      startBox: TransformBox
      startPointerAngle: number
      startRotation: number
    }

function chordSkew(mods: ToolModifiers): boolean {
  return (mods.ctrl || mods.meta) && !mods.alt
}

function chordPerspective(mods: ToolModifiers): boolean {
  return (mods.ctrl || mods.meta) && mods.alt
}

/** Reuses Free Transform's affine handle grammar for a SelectionMask target. */
export class SelectionTransformController {
  private gesture: Gesture | null = null

  get isDragging(): boolean {
    return this.gesture !== null
  }

  pointerDown(
    docX: number,
    docY: number,
    pointerId: number,
    zoom: number,
    mods: ToolModifiers = NO_MODIFIERS,
  ): boolean {
    const state = useSelectionTransformStore.getState()
    if (!state.session) return false
    const box = selectionBox(state.session)
    const hit = hitTestHandle(
      { x: docX, y: docY },
      box,
      6 / Math.max(zoom, 0.02),
      22 / Math.max(zoom, 0.02),
    )
    if (!hit) {
      commitSelectionTransform()
      return true
    }
    if (hit === 'body') {
      this.gesture = { kind: 'move', pointerId, lastDoc: { x: docX, y: docY } }
      state.setPerspective(null)
    } else if (hit === 'rotate') {
      const center = boxCenter(box)
      this.gesture = {
        kind: 'rotate',
        pointerId,
        startBox: box,
        startPointerAngle: angleFromCenterDeg(center, { x: docX, y: docY }),
        startRotation: box.transform.rotationDeg,
      }
      state.setPerspective(null)
    } else if (chordPerspective(mods) && isCornerHandle(hit)) {
      const sourceQuad = boxCorners(box)
      this.gesture = {
        kind: 'perspective',
        pointerId,
        handle: hit,
        sourceQuad,
        destQuad: sourceQuad.map((p) => ({ ...p })) as SelectionQuad,
      }
      state.setPerspective({ sourceQuad, destQuad: sourceQuad.map((p) => ({ ...p })) as SelectionQuad })
    } else if (chordSkew(mods) && isEdgeHandle(hit)) {
      this.gesture = {
        kind: 'skew',
        pointerId,
        handle: hit,
        startBox: box,
      }
      state.setPerspective(null)
    } else {
      this.gesture = {
        kind: 'scale',
        pointerId,
        handle: hit,
        startBox: box,
        keepAspect: mods.shift,
      }
      state.setPerspective(null)
    }
    state.setActiveHandle(hit)
    state.setGesturing(true)
    return true
  }

  pointerMove(
    docX: number,
    docY: number,
    pointerId: number,
    mods: ToolModifiers = NO_MODIFIERS,
  ): void {
    const gesture = this.gesture
    const session = useSelectionTransformStore.getState().session
    if (!gesture || !session || gesture.pointerId !== pointerId) return
    const point = { x: docX, y: docY }
    const store = useSelectionTransformStore.getState()

    if (gesture.kind === 'move') {
      const dx = point.x - gesture.lastDoc.x
      const dy = point.y - gesture.lastDoc.y
      gesture.lastDoc = point
      if (dx === 0 && dy === 0) return
      const transform = applyMove(session.transform, dx, dy)
      store.setTransform(transform)
      applySessionToMask({ ...session, transform, perspective: null })
      return
    }

    if (gesture.kind === 'scale') {
      const transform = applyScaleFromHandle(gesture.startBox, gesture.handle, point, {
        keepAspect: gesture.keepAspect || mods.shift,
      })
      store.setTransform(transform)
      applySessionToMask({ ...session, transform, perspective: null })
      return
    }

    if (gesture.kind === 'skew') {
      const next = applySkewFromHandle(gesture.startBox, gesture.handle, point)
      if (!next) return
      store.setTransform(next)
      store.setPerspective(null)
      applySessionToMask({ ...session, transform: next, perspective: null })
      return
    }

    if (gesture.kind === 'perspective') {
      const idx = cornerIndex(gesture.handle)
      const destQuad = gesture.destQuad.map((p, i) =>
        i === idx ? point : { ...p },
      ) as SelectionQuad
      gesture.destQuad = destQuad
      const perspective = { sourceQuad: gesture.sourceQuad, destQuad }
      store.setPerspective(perspective)
      applySessionToMask({ ...session, perspective })
      return
    }

    const angle = angleFromCenterDeg(boxCenter(gesture.startBox), point)
    const transform = applyRotateAroundCenter(
      gesture.startBox,
      gesture.startRotation + normalizeRotationDelta(gesture.startPointerAngle, angle),
    )
    store.setTransform(transform)
    applySessionToMask({ ...session, transform, perspective: null })
  }

  pointerUp(pointerId: number): void {
    if (!this.gesture || this.gesture.pointerId !== pointerId) return
    this.gesture = null
    useSelectionTransformStore.getState().setGesturing(false)
    useSelectionTransformStore.getState().setActiveHandle(null)
  }

  cancelGesture(): void {
    this.gesture = null
    useSelectionTransformStore.getState().setGesturing(false)
    useSelectionTransformStore.getState().setActiveHandle(null)
  }
}

export { quadKey }