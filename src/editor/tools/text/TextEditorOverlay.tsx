import {
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react'
import type { TextLayer } from '../../../core/document'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import type { ViewportCamera } from '../../viewport/ViewportCamera'
import { finishTextEditSession, previewTextProps } from './textCommands'
import { useTextToolStore } from './textToolStore'
import { handleTextEditShortcut } from './textEditShortcuts'
import {
  measureContentOffset,
  restoreContentSelection,
} from './textEditorDomSync'
import { cssQuoteFontFamily } from './cssQuoteFontFamily'
import { lineHeightPx, pointTextAlignOffset } from './textLayout'
import { layerScreenCssMatrix } from './textOverlayTransform'
import { parseEditorRuns, runsMarkup } from './textEditorMarkup'
import { isTextEditingChrome } from './textEditingChrome'
import {
  getTextEditingSelection,
  setTextEditingSelection,
} from './textEditingSelection'
import styles from './TextEditorOverlay.module.css'

type Props = {
  cameraRef: RefObject<ViewportCamera>
  /** Bumped by the viewport on every pan/zoom so the overlay re-projects. */
  cameraVersion: number
}

/**
 * Inline textarea over the text layer while editing. Draggable chrome is not
 * needed — this is an overlay caret, not a modal dialog (no scrim).
 */
export function TextEditorOverlay({ cameraRef, cameraVersion }: Props) {
  const edit = useTextToolStore((s) => s.edit)
  const document = useEditorSessionStore((s) => s.document)
  const editorRef = useRef<HTMLDivElement>(null)
  /** Skip one markup sync after onInput — the DOM is already authoritative. */
  const skipMarkupSyncRef = useRef(false)

  const rawLayer = edit ? document.layers[edit.layerId] : undefined
  const layer: TextLayer | null =
    rawLayer?.type === 'text' ? rawLayer : null

  useLayoutEffect(() => {
    if (!edit || !layer || !editorRef.current) return
    const el = editorRef.current
    const camera = cameraRef.current.getState()

    // Everything below is authored in *document* pixels and mirrors the
    // HTMLText CSS in `PixiRenderBackend`, so the glyphs under the caret are
    // laid out exactly like the committed layer. The camera (and the layer's
    // own rotation/scale) arrive afterwards as a single CSS matrix — scaling
    // the font sizes instead would drift from the baked rendering, because
    // per-run spans carry document-pixel sizes of their own.
    el.style.fontFamily = cssQuoteFontFamily(layer.fontFamily)
    el.style.fontSize = `${layer.fontSize}px`
    el.style.fontWeight = String(layer.fontWeight)
    el.style.fontStyle = layer.italic ? 'italic' : 'normal'
    el.style.textDecoration = 'none'
    el.style.color = layer.color
    el.style.textAlign = layer.align === 'justify' ? 'left' : layer.align
    el.style.direction = 'ltr'
    el.style.letterSpacing = '0'
    el.style.lineHeight = `${lineHeightPx(layer)}px`

    const isBox = layer.textMode === 'box' && layer.bounds.w > 0
    // Point text is unbounded: let the editor grow with its content the way
    // Pixi's shrink-to-fit measurement does.
    el.style.width = isBox ? `${layer.bounds.w}px` : 'max-content'
    el.style.height =
      isBox && layer.bounds.h > 0 ? `${layer.bounds.h}px` : 'auto'

    // Point-text transforms are insertion anchors, so the block itself shifts
    // for centre/right alignment (same rule as `applyTextLayer`).
    const anchorX = isBox
      ? 0
      : pointTextAlignOffset(layer.align, el.offsetWidth)
    el.style.transformOrigin = '0 0'
    el.style.transform = layerScreenCssMatrix(layer.transform, camera, anchorX)
  }, [edit, layer, cameraRef, cameraVersion, document])

  useEffect(() => {
    if (!edit) return
    const el = editorRef.current
    if (!el) return
    el.focus()
    const range = globalThis.document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    setTextEditingSelection(edit.layerId, layer?.content.length ?? 0, layer?.content.length ?? 0)
  }, [edit?.layerId])

  useLayoutEffect(() => {
    const el = editorRef.current
    if (!edit || !layer || !el) return
    if (skipMarkupSyncRef.current) {
      skipMarkupSyncRef.current = false
      return
    }
    el.innerHTML = runsMarkup(layer)
    const stored = getTextEditingSelection(edit.layerId)
    if (stored && globalThis.document.activeElement === el) {
      restoreContentSelection(el, stored.start, stored.end)
    }
  }, [edit?.layerId, layer?.content, layer?.runs])

  if (!edit || !layer || layer.type !== 'text') return null

  return (
    <div
      ref={editorRef}
      className={`${styles.editor}${
        layer.textMode === 'point'
          ? ` ${styles.pointEditor}`
          : ` ${styles.boxEditor}`
      }`}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline
      aria-label="Edit text"
      spellCheck={false}
      onInput={(event) => {
        skipMarkupSyncRef.current = true
        const parsed = parseEditorRuns(event.currentTarget, layer)
        previewTextProps(layer.id, parsed)
        updateSelection(layer.id, event.currentTarget)
      }}
      onSelect={(event) => updateSelection(layer.id, event.currentTarget)}
      onKeyUp={(event) => updateSelection(layer.id, event.currentTarget)}
      onKeyDown={(event) => handleTextEditShortcut(event, layer)}
      onBlur={() => {
        // Deferred so the click that stole focus lands first.
        requestAnimationFrame(() => {
          if (useTextToolStore.getState().edit?.layerId !== layer.id) return
          // Type options (options bar, Character / Paragraph, font picker) act
          // on the running session — reaching for one must not commit it. The
          // caret's range stays in `textEditingSelection`, so their edits still
          // land on the selected characters.
          if (isTextEditingChrome(globalThis.document.activeElement)) return
          finishTextEditSession()
        })
      }}
      onPointerDown={(e) => {
        e.stopPropagation()
        updateSelection(layer.id, e.currentTarget)
      }}
    />
  )
}

function updateSelection(layerId: TextLayer['id'], element: HTMLDivElement): void {
  const selection = window.getSelection()
  if (!selection?.rangeCount || !element.contains(selection.anchorNode)) return
  const range = selection.getRangeAt(0)
  setTextEditingSelection(
    layerId,
    measureContentOffset(element, range.startContainer, range.startOffset),
    measureContentOffset(element, range.endContainer, range.endOffset),
  )
}
