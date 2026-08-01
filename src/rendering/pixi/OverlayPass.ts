import { Container, Graphics } from 'pixi.js'
import { useViewPreferencesStore } from '../../editor/viewport/viewPreferencesStore'
import { useSnapPreferencesStore } from '../../editor/viewport/snapPreferences'
import {
  useSelectionStore,
  type SelectionRect,
} from '../../editor/session/selectionStore'
import type { SelectionPoint } from '../../editor/session/SelectionMask'
import { useSelectionToolStore } from '../../editor/session/selectionToolStore'
import { useEditorSessionStore } from '../../editor/session/EditorSessionStore'
import { getLayer, isLayerPositionLocked } from '../../core/document'
import {
  boxCorners,
  boxTopCenter,
  getLayerLocalBounds,
  handlePositions,
  rotateHandlePosition,
  shouldShowTransformHandles,
  useTransformStore,
} from '../../editor/tools/move'
import { useSelectionTransformStore, quadKey } from '../../editor/tools/selection/selectionTransform'
import {
  useCageTransformStore,
} from '../../editor/tools/transform/cageTransform'
import { buildGridTriangles } from '../../imaging/warp/cageWarp'
import { useWorkPathStore } from '../../editor/tools/pen/workPathStore'
import type { PenPath } from '../../editor/tools/pen/penPath'
import {
  documentGridLinePositions,
  documentGridStep,
  pixelGridLinePositions,
} from './documentGrid'
import type { ViewportFrame } from '../contracts/ViewportFrame'
import { PIXEL_GRID_MIN_ZOOM } from '../../editor/viewport/viewPreferencesStore'

const DASH = 4
const GAP = 4
const PERIOD = DASH + GAP
const ANT_SPEED_PX_PER_MS = 0.04

/**
 * Selection / guides overlay (SPEC §10 step 9). Drawn in document space inside
 * the camera-transformed `overlayLayer` so ants pan/zoom with the canvas.
 * Transform handles compose on top of marching ants (Wave A).
 */
export class OverlayPass {
  private readonly gridGfx = new Graphics({ label: 'document-grid' })
  private readonly ants = new Graphics({ label: 'marching-ants' })
  private readonly workPathGfx = new Graphics({ label: 'work-path' })
  private readonly transformGfx = new Graphics({ label: 'transform-handles' })
  private lastKey = ''
  private lastGridKey = ''
  private lastWorkPathKey = ''
  private lastTransformKey = ''

  constructor(private readonly root: Container) {
    this.root.label = 'overlay'
    this.root.addChild(this.gridGfx)
    this.root.addChild(this.ants)
    this.root.addChild(this.workPathGfx)
    this.root.addChild(this.transformGfx)
  }

  /** Called every frame from the render loop (animates dash phase). */
  sync(frame?: ViewportFrame): void {
    this.syncDocumentGrid(frame)
    this.syncAnts()
    this.syncWorkPath()
    this.syncTransformHandles()
  }

  private syncDocumentGrid(frame?: ViewportFrame): void {
    const { showGrid, showPixelGrid } = useViewPreferencesStore.getState()
    const snapGrid = useSnapPreferencesStore.getState().settings.grid
    const canvas = useEditorSessionStore.getState().document.canvas
    const step = documentGridStep(snapGrid)
    const zoom = frame?.camera.zoom ?? 1
    const pixelGridVisible = showPixelGrid && zoom >= PIXEL_GRID_MIN_ZOOM

    if (!showGrid && !pixelGridVisible) {
      if (this.lastGridKey !== '') {
        this.gridGfx.clear()
        this.lastGridKey = ''
      }
      return
    }

    const key = [
      showGrid ? 1 : 0,
      pixelGridVisible ? 1 : 0,
      step,
      canvas.width,
      canvas.height,
      zoom.toFixed(3),
      frame
        ? `${frame.camera.offsetX.toFixed(1)},${frame.camera.offsetY.toFixed(1)},${frame.viewportWidth},${frame.viewportHeight}`
        : 'noframe',
    ].join(':')
    if (key === this.lastGridKey) return
    this.lastGridKey = key

    const g = this.gridGfx
    g.clear()

    const docW = canvas.width
    const docH = canvas.height
    let x0 = 0
    let y0 = 0
    let x1 = docW
    let y1 = docH

    if (frame) {
      const { offsetX, offsetY } = frame.camera
      x0 = Math.max(0, Math.floor(-offsetX / zoom))
      y0 = Math.max(0, Math.floor(-offsetY / zoom))
      x1 = Math.min(docW, Math.ceil((frame.viewportWidth - offsetX) / zoom))
      y1 = Math.min(docH, Math.ceil((frame.viewportHeight - offsetY) / zoom))
    }

    if (showGrid) {
      for (const x of documentGridLinePositions(x1, step)) {
        if (x < x0) continue
        g.moveTo(x, y0)
        g.lineTo(x, y1)
      }
      for (const y of documentGridLinePositions(y1, step)) {
        if (y < y0) continue
        g.moveTo(x0, y)
        g.lineTo(x1, y)
      }
      g.stroke({ width: 1, color: 0x808080, alpha: 0.22, pixelLine: true })
    }

    if (pixelGridVisible) {
      for (const x of pixelGridLinePositions(x0, x1)) {
        g.moveTo(x, y0)
        g.lineTo(x, y1)
      }
      for (const y of pixelGridLinePositions(y0, y1)) {
        g.moveTo(x0, y)
        g.lineTo(x1, y)
      }
      g.stroke({ width: 1, color: 0x606060, alpha: 0.35, pixelLine: true })
    }
  }

  private syncAnts(): void {
    const { marquee, mask } = useSelectionStore.getState()
    const { preview, combineMode } = useSelectionToolStore.getState()
    const canvas = useEditorSessionStore.getState().document.canvas
    const outline = mask?.outline() ?? null

    let rects: SelectionRect[] = []
    let ellipses: SelectionRect[] = []
    let paths: SelectionPoint[][] = []
    let inverted = false

    // Keep existing ants while adding/subtracting/intersecting; "new" replaces.
    const keepExisting = !!preview && combineMode !== 'new'
    if (keepExisting && outline) {
      rects = [...outline.rects]
      ellipses = [...outline.ellipses]
      paths = [...outline.paths]
      inverted = outline.inverted
    } else if (!preview && outline) {
      rects = outline.rects
      ellipses = outline.ellipses
      paths = outline.paths
      inverted = outline.inverted
    } else if (!preview && marquee && marquee.width >= 1 && marquee.height >= 1) {
      rects = [marquee]
    }

    if (preview) {
      if (preview.kind === 'rect') rects = [...rects, preview.rect]
      else if (preview.kind === 'ellipse') ellipses = [...ellipses, preview.rect]
      else paths = [...paths, preview.points]
    }

    const has =
      rects.some((r) => r.width >= 1 && r.height >= 1) ||
      ellipses.some((r) => r.width >= 1 && r.height >= 1) ||
      paths.some((p) => p.length >= 2)

    if (!has) {
      if (this.lastKey !== '') {
        this.ants.clear()
        this.lastKey = ''
      }
      return
    }

    const phase = (performance.now() * ANT_SPEED_PX_PER_MS) % PERIOD
    const key = `${inverted ? 1 : 0}:${canvas.width}x${canvas.height}:r${rects
      .map((r) => `${r.x},${r.y},${r.width},${r.height}`)
      .join('|')}:e${ellipses
      .map((r) => `${r.x},${r.y},${r.width},${r.height}`)
      .join('|')}:p${paths
      .map((p) => p.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(';'))
      .join('/')}:${phase.toFixed(1)}`
    if (key === this.lastKey) return
    this.lastKey = key

    this.ants.clear()
    if (inverted) {
      strokeDashedPolyline(
        this.ants,
        rectPerimeter(0, 0, canvas.width, canvas.height),
        phase,
      )
    }
    for (const r of rects) {
      strokeDashedRect(this.ants, r, phase)
    }
    for (const e of ellipses) {
      strokeDashedEllipse(this.ants, e, phase)
    }
    for (const path of paths) {
      if (path.length < 2) continue
      const closed =
        preview?.kind === 'path'
          ? preview.closed
          : path.length >= 3 &&
            Math.hypot(
              path[0]!.x - path[path.length - 1]!.x,
              path[0]!.y - path[path.length - 1]!.y,
            ) < 0.5
      const pts = closed && path.length >= 3 ? [...path, path[0]!] : path
      strokeDashedPolyline(this.ants, pts, phase)
    }
  }

  private syncWorkPath(): void {
    const { draft, path, rubberBand, selectedAnchors, primaryAnchor, activeSubpathIndex } =
      useWorkPathStore.getState()
    const active = draft ?? path
    if (!active || active.subpaths.every((sp) => sp.anchors.length === 0)) {
      if (this.lastWorkPathKey !== '') {
        this.workPathGfx.clear()
        this.lastWorkPathKey = ''
      }
      return
    }

    const key =
      active.subpaths
        .map(
          (sp) =>
            `${sp.closed ? 1 : 0}:` +
            sp.anchors
              .map(
                (a) =>
                  `${a.x.toFixed(1)},${a.y.toFixed(1)}:` +
                  `${a.in ? `${a.in.x.toFixed(1)},${a.in.y.toFixed(1)}` : ''}:` +
                  `${a.out ? `${a.out.x.toFixed(1)},${a.out.y.toFixed(1)}` : ''}`,
              )
              .join('|'),
        )
        .join('||') +
      `:${rubberBand ? `${rubberBand.x.toFixed(1)},${rubberBand.y.toFixed(1)}` : ''}:` +
      `${selectedAnchors.map((s) => `${s.subpathIndex}.${s.index}`).join(',')}:` +
      `${activeSubpathIndex}`
    if (key === this.lastWorkPathKey) return
    this.lastWorkPathKey = key

    const g = this.workPathGfx
    g.clear()
    drawPenPathSegments(g, active, rubberBand, activeSubpathIndex)
    drawPenAnchors(g, active, selectedAnchors, primaryAnchor)
  }

  private syncTransformHandles(): void {
    const session = useEditorSessionStore.getState()
    const tState = useTransformStore.getState()
    const cageSession = useCageTransformStore.getState().session
    const selectionTransform = useSelectionTransformStore.getState().session
    if (
      !cageSession &&
      !selectionTransform &&
      !shouldShowTransformHandles(session.activeToolId, tState)
    ) {
      if (this.lastTransformKey !== '') {
        this.transformGfx.clear()
        this.lastTransformKey = ''
      }
      return
    }

    if (cageSession) {
      this.drawCageOverlay(
        cageSession.cage,
        cageSession.cols,
        cageSession.rows,
        useCageTransformStore.getState().activePoint,
      )
      return
    }

    if (selectionTransform) {
      const perspective = selectionTransform.perspective
      if (perspective) {
        this.drawTransformQuad(
          perspective.destQuad,
          `selection:perspective:${quadKey(perspective.destQuad)}:${useSelectionTransformStore.getState().activeHandle ?? ''}`,
        )
        return
      }
      const box = {
        bounds: {
          x: selectionTransform.bounds.x,
          y: selectionTransform.bounds.y,
          w: selectionTransform.bounds.width,
          h: selectionTransform.bounds.height,
        },
        transform: selectionTransform.transform,
      }
      this.drawTransformBox(
        box,
        `selection:${selectionTransform.transform.x},${selectionTransform.transform.y},${selectionTransform.transform.scaleX},${selectionTransform.transform.scaleY},${selectionTransform.transform.rotationDeg},${selectionTransform.transform.skewXDeg},${selectionTransform.transform.skewYDeg}:${selectionTransform.bounds.width}x${selectionTransform.bounds.height}:${useSelectionTransformStore.getState().activeHandle ?? ''}`,
      )
      return
    }

    const ids = tState.session?.layerIds ?? session.selectedLayerIds
    const layerId = ids.length > 0 ? ids[ids.length - 1]! : null
    if (!layerId) {
      if (this.lastTransformKey !== '') {
        this.transformGfx.clear()
        this.lastTransformKey = ''
      }
      return
    }
    const layer = getLayer(session.document, layerId)
    if (!layer || isLayerPositionLocked(layer)) {
      if (this.lastTransformKey !== '') {
        this.transformGfx.clear()
        this.lastTransformKey = ''
      }
      return
    }
    const bounds = getLayerLocalBounds(layer, session.document)
    if (!bounds) {
      if (this.lastTransformKey !== '') {
        this.transformGfx.clear()
        this.lastTransformKey = ''
      }
      return
    }

    const box = { bounds, transform: layer.transform }
    const tr = layer.transform
    const key = `${layerId}:${tr.x},${tr.y},${tr.scaleX},${tr.scaleY},${tr.rotationDeg}:${bounds.w}x${bounds.h}:${tState.activeHandle ?? ''}:${tState.session ? 1 : 0}`
    this.drawTransformBox(box, key)
  }

  private drawCageOverlay(
    cage: ReadonlyArray<{ x: number; y: number }>,
    cols: number,
    rows: number,
    activePoint: number | null,
  ): void {
    const key =
      `${cols}x${rows}:` +
      cage.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('|') +
      `:${activePoint ?? ''}`
    if (key === this.lastTransformKey) return
    this.lastTransformKey = key

    const g = this.transformGfx
    g.clear()

    const triangles = buildGridTriangles(cols, rows)
    for (const [a, b, c] of triangles) {
      const pa = cage[a]!
      const pb = cage[b]!
      const pc = cage[c]!
      g.moveTo(pa.x, pa.y)
      g.lineTo(pb.x, pb.y)
      g.lineTo(pc.x, pc.y)
      g.closePath()
      g.stroke({ width: 1, color: 0x4a9eff, alpha: 0.55, pixelLine: true })
    }

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col
        const p = cage[idx]!
        const active = idx === activePoint
        const size = active ? 4.5 : 3.5
        g.circle(p.x, p.y, size)
        g.fill({ color: active ? 0xffcc00 : 0xffffff })
        g.stroke({ width: 1, color: 0x1a1a1a, alpha: 1, pixelLine: true })
      }
    }
  }

  private drawTransformQuad(
    corners: [SelectionPoint, SelectionPoint, SelectionPoint, SelectionPoint],
    key: string,
  ): void {
    if (key === this.lastTransformKey) return
    this.lastTransformKey = key

    const g = this.transformGfx
    g.clear()
    g.moveTo(corners[0]!.x, corners[0]!.y)
    g.lineTo(corners[1]!.x, corners[1]!.y)
    g.lineTo(corners[2]!.x, corners[2]!.y)
    g.lineTo(corners[3]!.x, corners[3]!.y)
    g.closePath()
    g.stroke({ width: 1, color: 0x000000, alpha: 0.85, pixelLine: true })
    g.moveTo(corners[0]!.x, corners[0]!.y)
    g.lineTo(corners[1]!.x, corners[1]!.y)
    g.lineTo(corners[2]!.x, corners[2]!.y)
    g.lineTo(corners[3]!.x, corners[3]!.y)
    g.closePath()
    g.stroke({ width: 1, color: 0xffffff, alpha: 0.9, pixelLine: true })

    for (let i = 0; i < 4; i++) {
      const p = corners[i]!
      const size = 3
      g.rect(p.x - size, p.y - size, size * 2, size * 2)
      g.fill({ color: 0xffffff })
      g.stroke({ width: 1, color: 0x1a1a1a, alpha: 1, pixelLine: true })
    }
  }

  private drawTransformBox(
    box: { bounds: { x: number; y: number; w: number; h: number }; transform: { x: number; y: number; scaleX: number; scaleY: number; rotationDeg: number; skewXDeg: number; skewYDeg: number; pivotX: number; pivotY: number } },
    key: string,
  ): void {
    if (key === this.lastTransformKey) return
    this.lastTransformKey = key

    const g = this.transformGfx
    g.clear()
    const corners = boxCorners(box)
    g.moveTo(corners[0]!.x, corners[0]!.y)
    g.lineTo(corners[1]!.x, corners[1]!.y)
    g.lineTo(corners[2]!.x, corners[2]!.y)
    g.lineTo(corners[3]!.x, corners[3]!.y)
    g.closePath()
    g.stroke({ width: 1, color: 0x000000, alpha: 0.85, pixelLine: true })
    g.moveTo(corners[0]!.x, corners[0]!.y)
    g.lineTo(corners[1]!.x, corners[1]!.y)
    g.lineTo(corners[2]!.x, corners[2]!.y)
    g.lineTo(corners[3]!.x, corners[3]!.y)
    g.closePath()
    g.stroke({ width: 1, color: 0xffffff, alpha: 0.9, pixelLine: true })

    const top = boxTopCenter(box)
    const rot = rotateHandlePosition(box, 18)
    g.moveTo(top.x, top.y)
    g.lineTo(rot.x, rot.y)
    g.stroke({ width: 1, color: 0xffffff, alpha: 0.95, pixelLine: true })

    const positions = handlePositions(box, 18)
    const handleIds = [
      'nw',
      'n',
      'ne',
      'e',
      'se',
      's',
      'sw',
      'w',
      'rotate',
    ] as const
    for (const id of handleIds) {
      const p = positions[id]
      const size = id === 'rotate' ? 3.5 : 3
      g.rect(p.x - size, p.y - size, size * 2, size * 2)
      g.fill({ color: 0xffffff })
      g.stroke({ width: 1, color: 0x1a1a1a, alpha: 1, pixelLine: true })
    }
  }

  destroy(): void {
    this.gridGfx.destroy()
    this.ants.destroy()
    this.workPathGfx.destroy()
    this.transformGfx.destroy()
    this.root.removeChildren()
  }
}

function drawPenPathSegments(
  g: Graphics,
  path: PenPath,
  rubberBand: { x: number; y: number } | null,
  activeSubpathIndex: number,
): void {
  for (let si = 0; si < path.subpaths.length; si++) {
    const sp = path.subpaths[si]!
    const anchors = sp.anchors
    if (anchors.length === 0) continue
    const segCount = sp.closed ? anchors.length : anchors.length - 1
    for (let i = 0; i < segCount; i++) {
      const from = anchors[i]!
      const to = anchors[(i + 1) % anchors.length]!
      g.moveTo(from.x, from.y)
      if (from.out || to.in) {
        const c1 = from.out ?? { x: from.x, y: from.y }
        const c2 = to.in ?? { x: to.x, y: to.y }
        g.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y)
      } else {
        g.lineTo(to.x, to.y)
      }
      g.stroke({ width: 1, color: 0x4a9eff, alpha: 0.95, pixelLine: true })
    }
    if (!sp.closed && rubberBand && anchors.length > 0 && si === activeSubpathIndex) {
      const last = anchors[anchors.length - 1]!
      g.moveTo(last.x, last.y)
      if (last.out) {
        const mid = {
          x: rubberBand.x,
          y: rubberBand.y,
        }
        g.bezierCurveTo(last.out.x, last.out.y, mid.x, mid.y, rubberBand.x, rubberBand.y)
      } else {
        g.lineTo(rubberBand.x, rubberBand.y)
      }
      g.stroke({ width: 1, color: 0x4a9eff, alpha: 0.55, pixelLine: true })
    }
  }
}

function drawPenAnchors(
  g: Graphics,
  path: PenPath,
  selected: { subpathIndex: number; index: number }[],
  primary: { subpathIndex: number; index: number } | null,
): void {
  for (let si = 0; si < path.subpaths.length; si++) {
    const anchors = path.subpaths[si]!.anchors
    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i]!
      const isSelected = selected.some((s) => s.subpathIndex === si && s.index === i)
      const isPrimary = primary?.subpathIndex === si && primary.index === i
      const showHandles = isPrimary || isSelected
      if (showHandles && anchor.in) {
        g.moveTo(anchor.x, anchor.y)
        g.lineTo(anchor.in.x, anchor.in.y)
        g.stroke({ width: 1, color: 0x888888, alpha: 0.9, pixelLine: true })
        g.circle(anchor.in.x, anchor.in.y, 2.5)
        g.fill({ color: 0xffffff })
        g.stroke({ width: 1, color: 0x333333, alpha: 1, pixelLine: true })
      }
      if (showHandles && anchor.out) {
        g.moveTo(anchor.x, anchor.y)
        g.lineTo(anchor.out.x, anchor.out.y)
        g.stroke({ width: 1, color: 0x888888, alpha: 0.9, pixelLine: true })
        g.circle(anchor.out.x, anchor.out.y, 2.5)
        g.fill({ color: 0xffffff })
        g.stroke({ width: 1, color: 0x333333, alpha: 1, pixelLine: true })
      }
      // Always show handles while drafting (all anchors) for pen creation feedback.
      if (!showHandles && (anchor.in || anchor.out)) {
        if (anchor.in) {
          g.moveTo(anchor.x, anchor.y)
          g.lineTo(anchor.in.x, anchor.in.y)
          g.stroke({ width: 1, color: 0x888888, alpha: 0.7, pixelLine: true })
          g.circle(anchor.in.x, anchor.in.y, 2)
          g.fill({ color: 0xffffff })
          g.stroke({ width: 1, color: 0x333333, alpha: 1, pixelLine: true })
        }
        if (anchor.out) {
          g.moveTo(anchor.x, anchor.y)
          g.lineTo(anchor.out.x, anchor.out.y)
          g.stroke({ width: 1, color: 0x888888, alpha: 0.7, pixelLine: true })
          g.circle(anchor.out.x, anchor.out.y, 2)
          g.fill({ color: 0xffffff })
          g.stroke({ width: 1, color: 0x333333, alpha: 1, pixelLine: true })
        }
      }
      const size = isSelected ? 4 : 3
      g.rect(anchor.x - size, anchor.y - size, size * 2, size * 2)
      g.fill({ color: isSelected ? 0xffcc00 : 0xffffff })
      g.stroke({ width: 1, color: 0x1a1a1a, alpha: 1, pixelLine: true })
    }
  }
}

function strokeDashedRect(
  g: Graphics,
  rect: SelectionRect,
  phase: number,
): void {
  if (rect.width < 1 || rect.height < 1) return
  strokeDashedPolyline(
    g,
    rectPerimeter(rect.x, rect.y, rect.width, rect.height),
    phase,
  )
}

function strokeDashedEllipse(
  g: Graphics,
  bounds: SelectionRect,
  phase: number,
): void {
  if (bounds.width < 1 || bounds.height < 1) return
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  const rx = bounds.width / 2
  const ry = bounds.height / 2
  const steps = Math.max(24, Math.ceil((rx + ry) * 0.5))
  const pts: SelectionPoint[] = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2
    pts.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry })
  }
  strokeDashedPolyline(g, pts, phase)
}

function rectPerimeter(
  x: number,
  y: number,
  w: number,
  h: number,
): Array<{ x: number; y: number }> {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
    { x, y },
  ]
}

function strokeDashedPolyline(
  g: Graphics,
  points: Array<{ x: number; y: number }>,
  phase: number,
): void {
  appendDashes(g, points, phase, 0x000000)
  appendDashes(g, points, phase + PERIOD / 2, 0xffffff)
}

function appendDashes(
  g: Graphics,
  points: Array<{ x: number; y: number }>,
  phase: number,
  color: number,
): void {
  let drawn = -phase
  let started = false
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) continue
    const ux = dx / len
    const uy = dy / len
    let t = 0
    while (t < len) {
      const into = ((drawn % PERIOD) + PERIOD) % PERIOD
      const remaining = into < DASH ? DASH - into : PERIOD - into
      const step = Math.min(remaining, len - t)
      if (into < DASH && step > 0.01) {
        const x0 = a.x + ux * t
        const y0 = a.y + uy * t
        const x1 = a.x + ux * (t + step)
        const y1 = a.y + uy * (t + step)
        if (!started) {
          g.moveTo(x0, y0)
          started = true
        } else {
          g.moveTo(x0, y0)
        }
        g.lineTo(x1, y1)
      }
      t += step
      drawn += step
    }
  }
  if (started) {
    g.stroke({ width: 1, color, alpha: 1, pixelLine: true })
  }
}
