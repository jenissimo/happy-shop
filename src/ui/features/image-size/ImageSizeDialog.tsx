import { useEffect, useState } from 'react'
import { exceedsSoftMegapixelLimit } from '../../../core/document'
import { createMetadataEntry } from '../../../core/history'
import { documentHistory } from '../../../editor/session/documentHistory'
import { useEditorSessionStore } from '../../../editor/session/EditorSessionStore'
import { useSelectionStore } from '../../../editor/session/selectionStore'
import { Button } from '../../base/Button'
import { FloatingWindow } from '../../base/FloatingWindow'
import { NumericField } from '../../base/NumericField'
import { closeImageSizeDialog, useImageSizeDialogOpen } from './controller'
import {
  clampImageDimension,
  constrainedDimension,
  resizeDocumentMetadata,
  resampleDocumentAssets,
  type ResampleInterpolation,
} from './imageResize'
import styles from './ImageSizeDialog.module.css'

function applyDocument(document: ReturnType<typeof useEditorSessionStore.getState>['document']): void {
  useEditorSessionStore.setState({ document, dirty: true })
}

/** Image → Image Size…: one committed resize creates one history entry. */
export function ImageSizeDialog() {
  const open = useImageSizeDialogOpen()
  const document = useEditorSessionStore((state) => state.document)
  const { width: originalWidth, height: originalHeight } = document.canvas
  const [width, setWidth] = useState(originalWidth)
  const [height, setHeight] = useState(originalHeight)
  const [constrain, setConstrain] = useState(true)
  const [interpolation, setInterpolation] = useState<ResampleInterpolation>('bicubic')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setWidth(originalWidth)
    setHeight(originalHeight)
    setConstrain(true)
    setInterpolation('bicubic')
    setConfirmed(false)
  }, [open, originalWidth, originalHeight])

  const nextWidth = clampImageDimension(width)
  const nextHeight = clampImageDimension(height)
  const unchanged = nextWidth === originalWidth && nextHeight === originalHeight
  const overSoftLimit = exceedsSoftMegapixelLimit(nextWidth, nextHeight)
  const canApply = !busy && !unchanged && (!overSoftLimit || confirmed)

  const changeWidth = (value: number) => {
    const next = clampImageDimension(value)
    setWidth(next)
    if (constrain) setHeight(constrainedDimension(next, originalWidth, originalHeight))
  }
  const changeHeight = (value: number) => {
    const next = clampImageDimension(value)
    setHeight(next)
    if (constrain) setWidth(constrainedDimension(next, originalHeight, originalWidth))
  }

  const apply = async () => {
    if (!canApply) return
    const before = useEditorSessionStore.getState().document
    const after = resizeDocumentMetadata(before, nextWidth, nextHeight)
    if (after === before) return
    setBusy(true)
    try {
      await resampleDocumentAssets(before, nextWidth, nextHeight, interpolation)
      // Scale the document-space selection with the pixels it was drawn over,
      // before anything samples it against the new canvas size.
      useSelectionStore.getState().documentResampled(nextWidth, nextHeight)
      documentHistory.push(createMetadataEntry({
        label: 'Image Size',
        before,
        after,
        apply: applyDocument,
      }))
      useEditorSessionStore.setState({
        document: after,
        dirty: true,
        historyVersion: documentHistory.version,
      })
      closeImageSizeDialog()
    } finally {
      setBusy(false)
    }
  }

  return (
    <FloatingWindow open={open} title="Image Size" onClose={closeImageSizeDialog} width={370} bare>
      <div className={styles.content}>
        <p className={styles.current}>Current: {originalWidth} × {originalHeight} px</p>
        <div className={styles.dimensions}>
          <NumericField label="Width" value={width} min={1} max={8192} onChange={changeWidth} />
          <NumericField label="Height" value={height} min={1} max={8192} onChange={changeHeight} />
          <span className={styles.unit}>px</span>
        </div>
        <label className={styles.check}>
          <input type="checkbox" checked={constrain} onChange={(event) => setConstrain(event.target.checked)} />
          <span>Constrain proportions</span>
        </label>
        <label className={styles.select}>
          <span>Interpolation</span>
          <select value={interpolation} onChange={(event) => setInterpolation(event.target.value as ResampleInterpolation)}>
            <option value="nearest">Nearest neighbor (pixel art)</option>
            <option value="bicubic">Bicubic (smooth)</option>
          </select>
        </label>
        {interpolation === 'nearest' && (
          <p className={styles.current}>
            Nearest neighbor preserves hard pixel edges — preferred when scaling pixel art or indexed sprites.
          </p>
        )}
        {overSoftLimit && (
          <label className={styles.warning}>
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>Result exceeds 64 megapixels and may be slow to edit. I understand.</span>
          </label>
        )}
        <div className={styles.actions}>
          <Button onClick={closeImageSizeDialog} disabled={busy}>Cancel</Button>
          <Button variant="primary" disabled={!canApply} onClick={() => void apply()}>
            {busy ? 'Resampling…' : 'OK'}
          </Button>
        </div>
      </div>
    </FloatingWindow>
  )
}
