import type { EditorToolId } from '../toolbar/tools'
import { isLiquifyTool, liquifyCursorIdForTool } from '../tools/liquify/liquifyTools'
import type { HandleId } from '../tools/move/transformMath'
import { buildBrushTipRing, type BrushTipRing } from './brushCursor'
import { cssCursorForId } from './cursorCss'
import type { CursorId } from './cursorIds'
import { resizeCursorIdForHandle } from './resizeCursor'

export type BrushCursorPreference = 'normal' | 'precise'

export type ViewportCursorInput = {
  activeToolId: EditorToolId
  /** Pointer is over the viewport host. */
  overCanvas: boolean
  spaceHeld: boolean
  isPanning: boolean
  altHeld: boolean
  /** Ctrl/Meta or Caps Lock — fine brush crosshair. */
  precisionHeld: boolean
  /** Persisted choice from Settings → Tools. */
  brushCursorPreference: BrushCursorPreference
  zoom: number
  brushSizeDocPx: number
  brushHardness: number
  canPaint: boolean
  /** Hovered transform handle (not body). */
  hoverHandle: Exclude<HandleId, 'body'> | null
  /** Layer rotation for resize cursor snap. */
  hoverHandleRotationDeg: number
}

export type CursorResolution = {
  id: CursorId
  /** Value for `element.style.cursor`. */
  css: string
  /** When set, ViewportHost draws a following tip ring (large brushes). */
  tipRing: BrushTipRing | null
}

function toolCursorId(tool: EditorToolId): CursorId {
  if (isLiquifyTool(tool)) return liquifyCursorIdForTool(tool)
  switch (tool) {
    case 'move':
      return 'move'
    case 'marquee':
      return 'marquee'
    case 'lasso':
      return 'lasso'
    case 'magicWand':
      return 'wand'
    case 'paintBucket':
      return 'paint-bucket'
    case 'gradient':
      return 'gradient'
    case 'crop':
      return 'crop'
    case 'eyedropper':
      return 'eyedropper'
    case 'brush':
    case 'pencil':
      return 'brush'
    case 'eraser':
      return 'eraser'
    case 'cloneStamp':
    case 'historyBrush':
    case 'patternStamp':
      return 'stamp'
    case 'smudge':
      return 'smudge'
    case 'blur':
      return 'blur'
    case 'sharpen':
      return 'sharpen'
    case 'dodge':
      return 'dodge'
    case 'burn':
      return 'burn'
    case 'sponge':
      return 'sponge'
    case 'spotHealing':
      return 'spot-heal'
    case 'healingBrush':
      return 'heal'
    case 'text':
      return 'text'
    case 'hand':
      return 'hand'
    case 'rotateView':
      return 'rotate'
    case 'zoom':
      return 'zoom-in'
    case 'shape':
      return 'shape'
    case 'pen':
    case 'freeformPen':
    case 'addAnchor':
    case 'deleteAnchor':
    case 'convertPoint':
      return 'pen'
    case 'pathSelection':
      return 'path-selection'
    case 'directSelection':
      return 'direct-selection'
    case 'quickMask':
      return 'quick-mask'
    default: {
      const _exhaustive: never = tool
      void _exhaustive
      return 'default'
    }
  }
}

function staticResolution(id: CursorId): CursorResolution {
  return { id, css: cssCursorForId(id), tipRing: null }
}

function tipResolution(
  id: CursorId,
  mode: 'brush' | 'eraser' | 'pencil',
  input: ViewportCursorInput,
): CursorResolution {
  // Always overlay: CSS url() cursors clip above ~128px and can't track zoom live as cleanly.
  const ring = buildBrushTipRing(
    input.brushSizeDocPx,
    input.zoom,
    input.brushHardness,
    mode,
  )
  // A giant DOM ring stops being useful feedback and can be expensive to paint.
  if (ring.diameterPx > 2000) return staticResolution('precision')
  return { id, css: 'none', tipRing: ring }
}

/**
 * Priority resolver — SPECS/CURSORS.md §4.
 * Pure: no store reads; caller supplies a snapshot.
 */
export function resolveViewportCursor(
  input: ViewportCursorInput,
): CursorResolution {
  if (!input.overCanvas) return staticResolution('default')
  if (input.isPanning) return staticResolution('grabbing')
  if (input.spaceHeld || input.activeToolId === 'hand') {
    return staticResolution('grab')
  }

  if (input.hoverHandle) {
    if (input.hoverHandle === 'rotate') return staticResolution('rotate')
    return staticResolution(
      resizeCursorIdForHandle(input.hoverHandle, input.hoverHandleRotationDeg),
    )
  }

  if (input.activeToolId === 'zoom') {
    return staticResolution(input.altHeld ? 'zoom-out' : 'zoom-in')
  }

  const brushLike =
    input.activeToolId === 'brush' ||
    input.activeToolId === 'pencil' ||
    input.activeToolId === 'eraser'
  const retouchLike =
    input.activeToolId === 'cloneStamp' ||
    input.activeToolId === 'historyBrush' ||
    input.activeToolId === 'patternStamp' ||
    input.activeToolId === 'smudge' ||
    input.activeToolId === 'blur' ||
    input.activeToolId === 'sharpen' ||
    input.activeToolId === 'dodge' ||
    input.activeToolId === 'burn' ||
    input.activeToolId === 'sponge' ||
    input.activeToolId === 'spotHealing' ||
    input.activeToolId === 'healingBrush' ||
    isLiquifyTool(input.activeToolId)
  const tipLike = brushLike || retouchLike

  if (brushLike && input.altHeld) {
    return staticResolution('eyedropper')
  }
  if (tipLike && !input.canPaint) {
    return staticResolution('not-allowed')
  }
  if (
    tipLike &&
    (input.brushCursorPreference === 'precise' || input.precisionHeld)
  ) {
    return staticResolution('precision')
  }
  if (tipLike && !(retouchLike && input.altHeld)) {
    const tipMode =
      input.activeToolId === 'eraser'
        ? 'eraser'
        : input.activeToolId === 'pencil'
          ? 'pencil'
          : 'brush'
    return tipResolution(toolCursorId(input.activeToolId), tipMode, input)
  }

  return staticResolution(toolCursorId(input.activeToolId))
}
