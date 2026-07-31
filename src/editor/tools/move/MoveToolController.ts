import {
  getLayer,
  type LayerId,
  type Transform,
} from '../../../core/document'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { useSelectionStore } from '../../session/selectionStore'
import type { Point } from '../../viewport/ViewportCamera'
import { getLayerLocalBounds, isTransformableLayer } from './layerLocalBounds'
import {
  angleFromCenterDeg,
  applyMove,
  applyRotateAroundCenter,
  applyScaleFromHandle,
  applySkewFromHandle,
  boxCenter,
  boxCorners,
  hitTestHandle,
  isEdgeHandle,
  normalizeRotationDelta,
  type HandleId,
  type TransformBox,
} from './transformMath'
import { hitTestTopVisibleLayer } from './hitTestTopLayer'
import { snapBoundsTranslation } from '../../viewport/guides'
import { useSnapPreferencesStore } from '../../viewport/snapPreferences'
import {
  applyTransformsLive,
  commitFreeTransformSession,
  commitTransformGesture,
  transformableSelection,
} from './transformCommit'
import { shouldShowTransformHandles, useTransformStore } from './transformStore'
import { NO_MODIFIERS, normalizeModifiers, type ToolModifiers } from '../toolModifiers'
import { duplicateLayersForMove } from '../../session/layerCommands'

type Gesture =
  | {
      kind: 'move'
      pointerId: number
      lastDoc: Point
      layerIds: LayerId[]
      startTransforms: Record<string, Transform>
      mergeKey: string
    }
  | {
      kind: 'scale'
      pointerId: number
      handle: Exclude<HandleId, 'rotate' | 'body'>
      layerId: LayerId
      startBox: TransformBox
      keepAspect: boolean
      mergeKey: string
    }
  | {
      kind: 'skew'
      pointerId: number
      handle: Exclude<HandleId, 'rotate' | 'body'>
      layerId: LayerId
      startBox: TransformBox
      mergeKey: string
    }
  | {
      kind: 'rotate'
      pointerId: number
      layerId: LayerId
      startBox: TransformBox
      startPointerAngle: number
      startRotation: number
      mergeKey: string
    }

/**
 * Move tool (V) + Free Transform handles.
 * Overlay visibility: Move + "Show Transform Controls" (default ON), or Mod+T session.
 */
export class MoveToolController {
  private gesture: Gesture | null = null
  private gestureSeq = 0

  get isDragging(): boolean {
    return this.gesture != null
  }

  /** Screen-px handle radius → document units via zoom. */
  private handleRadiusDoc(zoom: number): number {
    return 6 / Math.max(zoom, 0.02)
  }

  private rotateOffsetDoc(zoom: number): number {
    return 22 / Math.max(zoom, 0.02)
  }

  private primaryBox(zoom: number): {
    layerId: LayerId
    box: TransformBox
  } | null {
    const session = useTransformStore.getState().session
    const ids = session?.layerIds ?? transformableSelection()
    if (ids.length === 0) return null
    const doc = useEditorSessionStore.getState().document
    // Transform handles follow the last selected (top-most) layer.
    const layerId = ids[ids.length - 1]!
    const layer = getLayer(doc, layerId)
    if (!layer || !isTransformableLayer(layer)) return null
    const bounds = getLayerLocalBounds(layer, doc)
    if (!bounds) return null
    void zoom
    return {
      layerId,
      box: { bounds, transform: { ...layer.transform } },
    }
  }

  /**
   * Hit-test for handles when they should be shown.
   * Returns true if the event was consumed.
   */
  async pointerDown(
    docX: number,
    docY: number,
    pointerId: number,
    zoom: number,
    mods: ToolModifiers = NO_MODIFIERS,
  ): Promise<boolean> {
    const tool = useEditorSessionStore.getState().activeToolId
    const store = useTransformStore.getState()
    const showHandles = shouldShowTransformHandles(tool, store)
    const docPt = { x: docX, y: docY }
    const normalizedMods = normalizeModifiers(mods)

    if (showHandles) {
      const primary = this.primaryBox(zoom)
      if (primary) {
        const hit = hitTestHandle(
          docPt,
          primary.box,
          this.handleRadiusDoc(zoom),
          this.rotateOffsetDoc(zoom),
        )
        if (hit && hit !== 'body') {
          this.gestureSeq += 1
          const mergeKey = `transform:${hit}:${primary.layerId}:${this.gestureSeq}`
          if (hit === 'rotate') {
            const center = boxCenter(primary.box)
            this.gesture = {
              kind: 'rotate',
              pointerId,
              layerId: primary.layerId,
              startBox: primary.box,
              startPointerAngle: angleFromCenterDeg(center, docPt),
              startRotation: primary.box.transform.rotationDeg,
              mergeKey,
            }
          } else if (
            (normalizedMods.ctrl || normalizedMods.meta) &&
            !normalizedMods.alt &&
            isEdgeHandle(hit)
          ) {
            this.gesture = {
              kind: 'skew',
              pointerId,
              handle: hit,
              layerId: primary.layerId,
              startBox: primary.box,
              mergeKey,
            }
          } else {
            this.gesture = {
              kind: 'scale',
              pointerId,
              handle: hit,
              layerId: primary.layerId,
              startBox: primary.box,
              keepAspect: normalizedMods.shift,
              mergeKey,
            }
          }
          store.setActiveHandle(hit)
          store.setGesturing(true)
          return true
        }
        if (hit === 'body') {
          // PS Move: click outside pixel selection deselects (handles still win).
          if (this.deselectIfOutsidePixelSelection(docX, docY)) return true
          return this.beginMove(docPt, pointerId, store.session?.layerIds, normalizedMods)
        }
        // Free Transform: click outside the box commits (PS grammar).
        if (store.session && hit == null) {
          commitFreeTransformSession()
          return true
        }
      } else if (store.session) {
        commitFreeTransformSession()
        return true
      }
    }

    // Move tool: drag selected layers (handles off, or click outside box).
    if (tool === 'move' || store.session) {
      if (this.deselectIfOutsidePixelSelection(docX, docY)) return true

      // PS Auto-Select: pick topmost visible layer under the cursor, then move it.
      // Misses do not move the current selection (unlike Auto-Select OFF).
      if (tool === 'move' && !store.session && store.autoSelectLayer) {
        const doc = useEditorSessionStore.getState().document
        const hitId = hitTestTopVisibleLayer(doc, docX, docY)
        if (!hitId) return false
        useEditorSessionStore.getState().selectLayer(hitId)
        if (await this.beginMove(docPt, pointerId, [hitId], normalizedMods)) return true
        return true
      }

      const ids = store.session?.layerIds ?? transformableSelection()
      if (ids.length === 0) return false
      return this.beginMove(docPt, pointerId, ids, normalizedMods)
    }

    return false
  }

  /**
   * PS: with an active pixel selection, clicking where mask alpha is 0
   * clears the selection instead of starting a move.
   */
  private deselectIfOutsidePixelSelection(
    docX: number,
    docY: number,
  ): boolean {
    const sel = useSelectionStore.getState()
    if (!sel.hasSelection()) return false
    if (sel.containsPoint(docX, docY)) return false
    sel.deselect()
    return true
  }

  private async beginMove(
    docPt: Point,
    pointerId: number,
    layerIds?: LayerId[],
    mods: ToolModifiers = NO_MODIFIERS,
  ): Promise<boolean> {
    let ids = layerIds ?? transformableSelection()
    if (ids.length === 0) return false

    // Alt+drag duplicates transformable layers, then moves the copies (not in FT session).
    if (
      mods.alt &&
      useTransformStore.getState().session == null &&
      useEditorSessionStore.getState().activeToolId === 'move'
    ) {
      const copyIds = await duplicateLayersForMove(ids)
      if (copyIds.length === 0) return false
      ids = copyIds
    }

    const doc = useEditorSessionStore.getState().document
    const startTransforms: Record<string, Transform> = {}
    for (const id of ids) {
      const layer = getLayer(doc, id)
      if (layer && isTransformableLayer(layer)) {
        startTransforms[id] = { ...layer.transform }
      }
    }
    const activeIds = Object.keys(startTransforms) as LayerId[]
    if (activeIds.length === 0) return false

    this.gestureSeq += 1
    this.gesture = {
      kind: 'move',
      pointerId,
      lastDoc: { ...docPt },
      layerIds: activeIds,
      startTransforms,
      mergeKey: `transform-move:${activeIds.join(',')}:${this.gestureSeq}`,
    }
    useTransformStore.getState().setActiveHandle('body')
    useTransformStore.getState().setGesturing(true)
    return true
  }

  pointerMove(
    docX: number,
    docY: number,
    pointerId: number,
    mods: ToolModifiers = NO_MODIFIERS,
  ): void {
    const g = this.gesture
    if (!g || g.pointerId !== pointerId) return
    const docPt = { x: docX, y: docY }
    const inSession = useTransformStore.getState().session != null

    if (g.kind === 'move') {
      const dx = docPt.x - g.lastDoc.x
      const dy = docPt.y - g.lastDoc.y
      g.lastDoc = docPt
      if (dx === 0 && dy === 0) return
      const doc = useEditorSessionStore.getState().document
      let updates = g.layerIds.map((id) => {
        const layer = getLayer(doc, id)!
        return { id, transform: applyMove(layer.transform, dx, dy) }
      })
      const canvas = doc.canvas
      const settings = useSnapPreferencesStore.getState().settings
      if (settings.enabled) {
        const corners = updates.flatMap(({ id, transform }) => {
          const layer = getLayer(doc, id)
          const bounds = layer ? getLayerLocalBounds(layer, doc) : null
          return bounds ? boxCorners({ bounds, transform }) : []
        })
        if (corners.length) {
          const shift = snapBoundsTranslation(
            {
              left: Math.min(...corners.map((point) => point.x)),
              top: Math.min(...corners.map((point) => point.y)),
              right: Math.max(...corners.map((point) => point.x)),
              bottom: Math.max(...corners.map((point) => point.y)),
            },
            {
              enabled: true,
              threshold: settings.threshold,
              width: canvas.width,
              height: canvas.height,
            },
          )
          updates = updates.map(({ id, transform }) => ({
            id,
            transform: applyMove(transform, shift.x, shift.y),
          }))
        }
      }
      this.apply(updates, 'Move', g.mergeKey, inSession)
      return
    }

    if (g.kind === 'scale') {
      const next = applyScaleFromHandle(g.startBox, g.handle, docPt, {
        keepAspect: mods.shift || g.keepAspect,
      })
      this.apply(
        [{ id: g.layerId, transform: next }],
        'Scale',
        g.mergeKey,
        inSession,
      )
      return
    }

    if (g.kind === 'skew') {
      const next = applySkewFromHandle(g.startBox, g.handle, docPt)
      if (!next) return
      this.apply(
        [{ id: g.layerId, transform: next }],
        'Skew',
        g.mergeKey,
        inSession,
      )
      return
    }

    if (g.kind === 'rotate') {
      const center = boxCenter(g.startBox)
      const ang = angleFromCenterDeg(center, docPt)
      const delta = normalizeRotationDelta(g.startPointerAngle, ang)
      const next = applyRotateAroundCenter(g.startBox, g.startRotation + delta)
      this.apply(
        [{ id: g.layerId, transform: next }],
        'Rotate',
        g.mergeKey,
        inSession,
      )
    }
  }

  pointerUp(pointerId: number): void {
    if (!this.gesture || this.gesture.pointerId !== pointerId) return
    this.gesture = null
    useTransformStore.getState().setGesturing(false)
    useTransformStore.getState().setActiveHandle(null)
  }

  /** Cancel in-progress pointer gesture (does not exit Free Transform session). */
  cancelGesture(): void {
    this.gesture = null
    useTransformStore.getState().setGesturing(false)
    useTransformStore.getState().setActiveHandle(null)
  }

  private apply(
    updates: Array<{ id: LayerId; transform: Transform }>,
    label: string,
    mergeKey: string,
    inSession: boolean,
  ): void {
    if (inSession) {
      applyTransformsLive(updates)
    } else {
      commitTransformGesture(label, updates, mergeKey)
    }
  }
}
