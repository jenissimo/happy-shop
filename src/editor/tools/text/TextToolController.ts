import { useSelectionStore } from '../../session/selectionStore'
import {
  beginTextEditSession,
  createAndSelectTextLayer,
  finishTextEditSession,
} from './textCommands'
import { useTextToolStore } from './textToolStore'
import { NO_MODIFIERS, type ToolModifiers } from '../toolModifiers'
import { hitTestTopVisibleLayer } from '../move/hitTestTopLayer'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import type { LayerId } from '../../../core/document'

const BOX_DRAG_THRESHOLD = 4

/**
 * Type tool: click → point text; drag → box text. Edit session is owned by
 * `textToolStore` + `TextEditorOverlay`.
 */
export class TextToolController {
  private dragging = false
  private start = { x: 0, y: 0 }
  private pointerId: number | null = null
  /** Text layer under the press, edited on release (see `pointerUp`). */
  private pendingEditLayerId: LayerId | null = null

  pointerDown(
    docX: number,
    docY: number,
    pointerId: number,
    _mods: ToolModifiers = NO_MODIFIERS,
  ): boolean {
    if (useTextToolStore.getState().edit) {
      finishTextEditSession()
    }

    const document = useEditorSessionStore.getState().document
    const hitLayerId = hitTestTopVisibleLayer(document, docX, docY)
    const hitLayer = hitLayerId ? document.layers[hitLayerId] : null
    if (hitLayer?.type === 'text') {
      // Deferred to pointer-up on purpose: the press still runs its default
      // action afterwards, which focuses the viewport host and would blur the
      // freshly mounted editor right back out of the session.
      this.pendingEditLayerId = hitLayer.id
      this.dragging = false
      this.pointerId = pointerId
      return true
    }

    this.pendingEditLayerId = null
    this.dragging = true
    this.start = { x: docX, y: docY }
    this.pointerId = pointerId
    useSelectionStore.getState().setMarquee({
      x: docX,
      y: docY,
      width: 0,
      height: 0,
    })
    return true
  }

  pointerMove(
    docX: number,
    docY: number,
    pointerId: number,
    _mods: ToolModifiers = NO_MODIFIERS,
  ): void {
    if (!this.dragging || this.pointerId !== pointerId) return
    const x = Math.min(this.start.x, docX)
    const y = Math.min(this.start.y, docY)
    const width = Math.abs(docX - this.start.x)
    const height = Math.abs(docY - this.start.y)
    useSelectionStore.getState().setMarquee({ x, y, width, height })
  }

  pointerUp(
    docX: number,
    docY: number,
    pointerId: number,
    _mods: ToolModifiers = NO_MODIFIERS,
  ): void {
    if (this.pendingEditLayerId && this.pointerId === pointerId) {
      const layerId = this.pendingEditLayerId
      this.pendingEditLayerId = null
      this.pointerId = null
      beginTextEditSession(layerId)
      return
    }
    if (!this.dragging || this.pointerId !== pointerId) return
    this.dragging = false
    this.pointerId = null
    useSelectionStore.getState().deselect()

    const w = Math.abs(docX - this.start.x)
    const h = Math.abs(docY - this.start.y)
    if (w >= BOX_DRAG_THRESHOLD || h >= BOX_DRAG_THRESHOLD) {
      const x = Math.min(this.start.x, docX)
      const y = Math.min(this.start.y, docY)
      createAndSelectTextLayer({
        textMode: 'box',
        x,
        y,
        width: Math.max(w, 40),
        height: Math.max(h, 24),
        content: '',
      })
      return
    }

    createAndSelectTextLayer({
      textMode: 'point',
      x: this.start.x,
      y: this.start.y,
      content: '',
    })
  }

  get isDragging(): boolean {
    return this.dragging
  }
}
