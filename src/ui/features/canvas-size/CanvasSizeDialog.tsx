import { useEffect, useState } from 'react'
import {
  MAX_CANVAS_SIDE,
  exceedsSoftMegapixelLimit,
} from '../../../core/document'
import { createMetadataEntry } from '../../../core/history'
import {
  CANVAS_ANCHOR_CENTER,
  canvasSizeDocument,
  canvasSizeOriginOffset,
  type CanvasAnchor,
} from '../../../editor/tools/crop/canvasSizeDocument'
import { documentHistory } from '../../../editor/session/documentHistory'
import { useEditorSessionStore } from '../../../editor/session/EditorSessionStore'
import { useSelectionStore } from '../../../editor/session/selectionStore'
import { Button } from '../../base/Button'
import { FloatingWindow } from '../../base/FloatingWindow'
import { NumericField } from '../../base/NumericField'
import { closeCanvasSizeDialog, useCanvasSizeDialogOpen } from './controller'
import styles from './CanvasSizeDialog.module.css'

const ANCHOR_CELLS: { x: CanvasAnchor['x']; y: CanvasAnchor['y']; label: string }[] =
  [
    { x: 0, y: 0, label: 'Top left' },
    { x: 0.5, y: 0, label: 'Top center' },
    { x: 1, y: 0, label: 'Top right' },
    { x: 0, y: 0.5, label: 'Middle left' },
    { x: 0.5, y: 0.5, label: 'Center' },
    { x: 1, y: 0.5, label: 'Middle right' },
    { x: 0, y: 1, label: 'Bottom left' },
    { x: 0.5, y: 1, label: 'Bottom center' },
    { x: 1, y: 1, label: 'Bottom right' },
  ]

function clampAbs(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.min(MAX_CANVAS_SIDE, Math.max(1, Math.round(n)))
}

function applyDoc(
  doc: ReturnType<typeof useEditorSessionStore.getState>['document'],
): void {
  useEditorSessionStore.setState({ document: doc, dirty: true })
}

/**
 * Image → Canvas Size… (WS-CANVAS-TAB). FloatingWindow, no scrim.
 */
export function CanvasSizeDialog() {
  const open = useCanvasSizeDialogOpen()
  const canvas = useEditorSessionStore((s) => s.document.canvas)

  const [width, setWidth] = useState(canvas.width)
  const [height, setHeight] = useState(canvas.height)
  const [relative, setRelative] = useState(false)
  const [anchor, setAnchor] = useState<CanvasAnchor>(CANVAS_ANCHOR_CENTER)
  const [megapixelConfirmed, setMegapixelConfirmed] = useState(false)

  useEffect(() => {
    if (!open) return
    setWidth(canvas.width)
    setHeight(canvas.height)
    setRelative(false)
    setAnchor(CANVAS_ANCHOR_CENTER)
    setMegapixelConfirmed(false)
  }, [open, canvas.width, canvas.height])

  const absoluteWidth = relative ? clampAbs(canvas.width + width) : clampAbs(width)
  const absoluteHeight = relative
    ? clampAbs(canvas.height + height)
    : clampAbs(height)

  const overSoft = exceedsSoftMegapixelLimit(absoluteWidth, absoluteHeight)
  const unchanged =
    absoluteWidth === canvas.width && absoluteHeight === canvas.height
  const canApply = !unchanged && (!overSoft || megapixelConfirmed)

  const toggleRelative = (next: boolean) => {
    if (next === relative) return
    if (next) {
      setWidth(0)
      setHeight(0)
    } else {
      setWidth(absoluteWidth)
      setHeight(absoluteHeight)
    }
    setRelative(next)
  }

  const handleApply = () => {
    if (!canApply) return
    const before = useEditorSessionStore.getState().document
    const after = canvasSizeDocument(before, {
      width: absoluteWidth,
      height: absoluteHeight,
      anchor,
    })
    if (after === before) {
      closeCanvasSizeDialog()
      return
    }
    // Selection lives in document space, so it has to follow the anchor before
    // anything samples it against the new canvas size.
    const originOffset = canvasSizeOriginOffset(
      before.canvas.width,
      before.canvas.height,
      absoluteWidth,
      absoluteHeight,
      anchor,
    )
    useSelectionStore
      .getState()
      .canvasResized(
        absoluteWidth,
        absoluteHeight,
        originOffset.x,
        originOffset.y,
      )
    documentHistory.push(
      createMetadataEntry({
        label: 'Canvas Size',
        before,
        after,
        apply: applyDoc,
      }),
    )
    useEditorSessionStore.setState({
      document: after,
      dirty: true,
      historyVersion: documentHistory.version,
    })
    closeCanvasSizeDialog()
  }

  return (
    <FloatingWindow
      open={open}
      title="Canvas Size"
      onClose={closeCanvasSizeDialog}
      width={360}
      bare
    >
      <div className={styles.content}>
        <p className={styles.current}>
          Current: {canvas.width} × {canvas.height} px
        </p>

        <div className={styles.dimensionsRow}>
          <NumericField
            label={relative ? 'Width Δ' : 'Width'}
            value={width}
            min={relative ? 1 - canvas.width : 1}
            max={relative ? MAX_CANVAS_SIDE - canvas.width : MAX_CANVAS_SIDE}
            onChange={setWidth}
          />
          <NumericField
            label={relative ? 'Height Δ' : 'Height'}
            value={height}
            min={relative ? 1 - canvas.height : 1}
            max={relative ? MAX_CANVAS_SIDE - canvas.height : MAX_CANVAS_SIDE}
            onChange={setHeight}
          />
          <span className={styles.pixelUnit}>
            {relative
              ? `→ ${absoluteWidth} × ${absoluteHeight} px`
              : 'px'}
          </span>
        </div>

        <label className={styles.relativeRow}>
          <input
            type="checkbox"
            checked={relative}
            onChange={(e) => toggleRelative(e.target.checked)}
          />
          <span>Relative</span>
        </label>

        <div className={styles.anchorBlock}>
          <span className={styles.label}>Anchor</span>
          <div className={styles.anchorGrid} role="group" aria-label="Canvas anchor">
            {ANCHOR_CELLS.map((cell) => {
              const active = cell.x === anchor.x && cell.y === anchor.y
              return (
                <button
                  key={cell.label}
                  type="button"
                  className={`${styles.anchorCell}${active ? ` ${styles.anchorCellActive}` : ''}`}
                  aria-label={cell.label}
                  aria-pressed={active}
                  onClick={() => setAnchor({ x: cell.x, y: cell.y })}
                />
              )
            })}
          </div>
        </div>

        {overSoft && (
          <label className={styles.megapixelWarning}>
            <input
              type="checkbox"
              checked={megapixelConfirmed}
              onChange={(e) => setMegapixelConfirmed(e.target.checked)}
            />
            <span>
              Result exceeds 64 megapixels and may be slow to edit. I understand.
            </span>
          </label>
        )}

        <div className={styles.actions}>
          <Button onClick={() => closeCanvasSizeDialog()}>Cancel</Button>
          <Button variant="primary" disabled={!canApply} onClick={handleApply}>
            OK
          </Button>
        </div>
      </div>
    </FloatingWindow>
  )
}
