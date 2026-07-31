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
import {
  getTextEditingSelection,
  setTextEditingSelection,
} from './textEditingSelection'
import { normalizedTextRuns, resolveRunTracking, resolveRunUnderline } from './textRuns'
import styles from './TextEditorOverlay.module.css'

type Props = {
  hostRef: RefObject<HTMLDivElement | null>
  cameraRef: RefObject<ViewportCamera>
}

/**
 * Inline textarea over the text layer while editing. Draggable chrome is not
 * needed — this is an overlay caret, not a modal dialog (no scrim).
 */
export function TextEditorOverlay({ hostRef, cameraRef }: Props) {
  const edit = useTextToolStore((s) => s.edit)
  const document = useEditorSessionStore((s) => s.document)
  const editorRef = useRef<HTMLDivElement>(null)
  /** Skip one markup sync after onInput — the DOM is already authoritative. */
  const skipMarkupSyncRef = useRef(false)

  const rawLayer = edit ? document.layers[edit.layerId] : undefined
  const layer: TextLayer | null =
    rawLayer?.type === 'text' ? rawLayer : null

  useLayoutEffect(() => {
    if (!edit || !layer || !editorRef.current || !hostRef.current) return
    const host = hostRef.current
    const camera = cameraRef.current
    const screen = camera.documentToScreen({
      x: layer.transform.x,
      y: layer.transform.y,
    })
    const zoom = camera.getState().zoom
    const el = editorRef.current
    let boxW =
      layer.textMode === 'box' && layer.bounds.w > 0
        ? layer.bounds.w * zoom
        : 1
    let boxH =
      layer.textMode === 'box' && layer.bounds.h > 0
        ? layer.bounds.h * zoom
        : 1

    el.style.fontFamily = layer.fontFamily
    el.style.fontSize = `${layer.fontSize * zoom}px`
    el.style.fontWeight = String(layer.fontWeight)
    el.style.fontStyle = layer.italic ? 'italic' : 'normal'
    el.style.textDecoration = 'none'
    el.style.color = layer.color
    el.style.textAlign = layer.align
    el.style.direction = 'ltr'
    el.style.letterSpacing = '0'
    el.style.lineHeight =
      layer.leading > 0
        ? `${layer.leading * zoom}px`
        : `${layer.fontSize * 1.2 * zoom}px`
    if (layer.textMode === 'point') {
      // The Pixi node is hidden while editing. Let the DOM editor own an
      // unbounded point-text layout instead of clipping it to the old four-em
      // placeholder width.
      el.style.width = '1px'
      el.style.height = '1px'
      boxW = Math.max(1, el.scrollWidth)
      boxH = Math.max(1, el.scrollHeight)
    }
    const alignOffset =
      layer.textMode === 'point'
        ? layer.align === 'center'
          ? boxW / 2
          : layer.align === 'right'
            ? boxW
            : 0
        : 0
    el.style.left = `${screen.x - alignOffset}px`
    el.style.top = `${screen.y}px`
    el.style.width = `${boxW}px`
    el.style.height = `${boxH}px`
    void host
  }, [edit, layer, hostRef, cameraRef, document])

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
        // Defer so toolbar clicks can apply first.
        requestAnimationFrame(() => {
          if (useTextToolStore.getState().edit?.layerId === layer.id) {
            finishTextEditSession()
          }
        })
      }}
      onPointerDown={(e) => {
        e.stopPropagation()
        updateSelection(layer.id, e.currentTarget)
      }}
    />
  )
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!)
}

function runsMarkup(layer: TextLayer): string {
  return normalizedTextRuns(layer).map((run) => {
    const underline = resolveRunUnderline(run, layer)
    const tracking = resolveRunTracking(run, layer)
    const style = [
      `font-family:${run.fontFamily}`,
      `font-size:${run.fontSize}px`,
      `font-weight:${run.fontWeight}`,
      `font-style:${run.italic ? 'italic' : 'normal'}`,
      `color:${run.color}`,
      underline ? 'text-decoration:underline' : '',
      tracking ? `letter-spacing:${tracking}px` : '',
    ].filter(Boolean).join(';')
    return `<span data-font-family="${escapeHtml(run.fontFamily)}" data-font-size="${run.fontSize}" data-font-weight="${run.fontWeight}" data-italic="${run.italic}" data-color="${run.color}" data-underline="${underline}" data-tracking="${tracking}" style="${escapeHtml(style)}">${escapeHtml(layer.content.slice(run.start, run.end)).replace(/\n/g, '<br>')}</span>`
  }).join('')
}

function parseEditorRuns(element: HTMLDivElement, layer: TextLayer) {
  const content = element.innerText.replace(/\r/g, '')
  const runs: TextLayer['runs'] = []
  let offset = 0
  for (const span of Array.from(element.querySelectorAll<HTMLSpanElement>('span[data-font-family]'))) {
    const text = span.innerText.replace(/\r/g, '')
    if (!text) continue
    const underline = span.dataset.underline === 'true'
    const tracking = Number(span.dataset.tracking) || 0
    runs.push({
      start: offset,
      end: offset + text.length,
      fontFamily: span.dataset.fontFamily || layer.fontFamily,
      fontSize: Number(span.dataset.fontSize) || layer.fontSize,
      fontWeight: Number(span.dataset.fontWeight) || layer.fontWeight,
      italic: span.dataset.italic === 'true',
      color: (span.dataset.color || layer.color) as TextLayer['color'],
      ...(underline !== layer.underline ? { underline } : {}),
      ...(tracking !== layer.tracking ? { tracking } : {}),
    })
    offset += text.length
  }
  return { content, runs: runs.length ? runs : content.length ? [normalizedTextRuns(layer)[0] ?? {
    start: 0, end: content.length, fontFamily: layer.fontFamily, fontSize: layer.fontSize,
    fontWeight: layer.fontWeight, italic: layer.italic, color: layer.color,
  }] : [] }
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
