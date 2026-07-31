import type { SelectionRect } from '../session/selectionStore'

/** Shared selection size label used by status bar and Info panel. */
export function formatSelectionSize(
  marquee: SelectionRect | null | undefined,
): string | null {
  if (!marquee || marquee.width < 1 || marquee.height < 1) return null
  return `${Math.round(marquee.width)} × ${Math.round(marquee.height)}`
}

export function formatCursorCoord(
  value: number | null | undefined,
): string {
  return value == null || !Number.isFinite(value) ? '—' : String(Math.round(value))
}

export function formatCursorCoords(
  docCursor: { x: number; y: number } | null | undefined,
): string {
  if (!docCursor) return '—, —'
  return `${formatCursorCoord(docCursor.x)}, ${formatCursorCoord(docCursor.y)}`
}

export function formatZoomPercent(zoomPercent: number): string {
  return `${Math.round(zoomPercent)}%`
}
