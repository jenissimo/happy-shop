import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { useSelectionStore } from '../../session/selectionStore'
import { useViewportZoomStore } from '../../viewport/viewportZoomStore'
import { useCursorStatusStore } from '../../viewport/cursorStatusStore'
import { buildInfoRows } from './infoPanelModel'
import styles from './InfoPanel.module.css'

/** Upper-well cursor readout — doc coords, selection size, zoom. */
export function InfoPanel() {
  const docCursor = useCursorStatusStore((s) => s.docCursor)
  const marquee = useSelectionStore((s) => s.marquee)
  const zoomPercent = useViewportZoomStore((s) => s.zoomPercent)
  const docWidth = useEditorSessionStore((s) => s.document.canvas.width)
  const docHeight = useEditorSessionStore((s) => s.document.canvas.height)

  const rows = buildInfoRows({
    docCursor,
    marquee,
    zoomPercent,
    docWidth,
    docHeight,
  })

  return (
    <div className={styles.root}>
      <dl className={styles.table} aria-label="Document info">
        {rows.map((row) => (
          <div key={row.label} className={styles.row}>
            <dt className={styles.label}>{row.label}</dt>
            <dd className={`${styles.value}${row.muted ? ` ${styles.muted}` : ''}`}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
