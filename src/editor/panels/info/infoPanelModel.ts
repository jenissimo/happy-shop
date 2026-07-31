import type { SelectionRect } from '../../session/selectionStore'
import {
  formatCursorCoord,
  formatSelectionSize,
  formatZoomPercent,
} from '../../shell/statusReadouts'

export type InfoRow = {
  label: string
  value: string
  muted?: boolean
}

/** Build readout rows from the same sources as the status bar. */
export function buildInfoRows(input: {
  docCursor: { x: number; y: number } | null
  marquee: SelectionRect | null
  zoomPercent: number
  docWidth: number
  docHeight: number
}): InfoRow[] {
  const selection = formatSelectionSize(input.marquee)
  return [
    {
      label: 'X',
      value: formatCursorCoord(input.docCursor?.x),
      muted: input.docCursor == null,
    },
    {
      label: 'Y',
      value: formatCursorCoord(input.docCursor?.y),
      muted: input.docCursor == null,
    },
    { label: 'Selection', value: selection ?? 'None', muted: !selection },
    { label: 'Zoom', value: formatZoomPercent(input.zoomPercent) },
    {
      label: 'Document',
      value: `${input.docWidth} × ${input.docHeight}`,
    },
  ]
}
