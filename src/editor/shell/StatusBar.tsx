import { useEditorSessionStore } from '../session/EditorSessionStore'
import { useSelectionStore } from '../session/selectionStore'
import { useViewportZoomStore } from '../viewport/viewportZoomStore'
import { useToolModifierStatusStore } from '../tools/toolModifiers'
import { useSelectionTransformStore } from '../tools/selection/selectionTransform'
import { useCageTransformStore } from '../tools/transform/cageTransform'
import { formatSelectionSize, formatZoomPercent } from './statusReadouts'
import styles from './StatusBar.module.css'

/** Bottom app status bar — zoom %, doc name, selection size, active tool. */
export function StatusBar() {
  const zoomPercent = useViewportZoomStore((s) => s.zoomPercent)
  const name = useEditorSessionStore((s) => s.document.name)
  const dirty = useEditorSessionStore((s) => s.dirty)
  const toolId = useEditorSessionStore((s) => s.activeToolId)
  const marquee = useSelectionStore((s) => s.marquee)
  const activeConstraint = useToolModifierStatusStore((s) => s.activeConstraint)
  const transformingSelection = useSelectionTransformStore((s) => s.session !== null)
  const cageTransform = useCageTransformStore((s) => s.session !== null)

  const selectionLabel = formatSelectionSize(marquee)

  return (
    <footer className={styles.bar} role="status" aria-label="Status">
      <span className={styles.zoom} title="Zoom">
        {formatZoomPercent(zoomPercent)}
      </span>
      <span className={styles.sep} aria-hidden />
      <span className={styles.doc} title={name}>
        {name}
        {dirty ? ' ●' : ''}
      </span>
      {selectionLabel ? (
        <>
          <span className={styles.sep} aria-hidden />
          <span
            className={styles.selection}
            title="Selection size"
            data-testid="status-selection-size"
          >
            {selectionLabel}
          </span>
        </>
      ) : null}
      {activeConstraint ? (
        <>
          <span className={styles.sep} aria-hidden />
          <span className={styles.selection} data-testid="status-active-constraint">
            {activeConstraint}
          </span>
        </>
      ) : null}
      {transformingSelection ? (
        <>
          <span className={styles.sep} aria-hidden />
          <span className={styles.selection} title="Enter commits; Esc restores the original selection">
            Transform Selection · Ctrl side=skew · Ctrl+Alt corner=perspective · Enter commit · Esc cancel
          </span>
        </>
      ) : null}
      {cageTransform ? (
        <>
          <span className={styles.sep} aria-hidden />
          <span className={styles.selection} title="Enter commits; Esc restores original pixels">
            Cage Transform · drag points · click edge add · Alt+click remove · Feather in options bar · Enter commit · Esc cancel
          </span>
        </>
      ) : null}
      <span className={styles.spacer} />
      <span className={styles.tool} title="Active tool">
        {toolId}
      </span>
    </footer>
  )
}
