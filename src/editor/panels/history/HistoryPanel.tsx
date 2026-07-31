import {
  ArrowClockwise,
  ArrowCounterClockwise,
} from '@phosphor-icons/react'
import { IconButton } from '../../../ui/base/IconButton'
import { documentHistory } from '../../session/documentHistory'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import styles from './HistoryPanel.module.css'

type HistoryRow = {
  depth: number
  label: string
  kind: 'past' | 'current' | 'future'
}

function buildRows(
  undoLabels: string[],
  redoLabels: string[],
): HistoryRow[] {
  const currentDepth = undoLabels.length
  const rows: HistoryRow[] = [
    {
      depth: 0,
      label: 'Document Open',
      kind: currentDepth === 0 ? 'current' : 'past',
    },
  ]
  undoLabels.forEach((label, i) => {
    const depth = i + 1
    rows.push({
      depth,
      label,
      kind: depth === currentDepth ? 'current' : 'past',
    })
  })
  redoLabels.forEach((label, i) => {
    rows.push({
      depth: currentDepth + i + 1,
      label,
      kind: 'future',
    })
  })
  return rows
}

export function HistoryPanel() {
  const historyVersion = useEditorSessionStore((s) => s.historyVersion)
  const undo = useEditorSessionStore((s) => s.undo)
  const redo = useEditorSessionStore((s) => s.redo)
  const jumpToHistoryDepth = useEditorSessionStore((s) => s.jumpToHistoryDepth)

  // historyVersion forces re-read of proxy stacks after push/undo/redo/jump.
  void historyVersion
  const undoLabels = documentHistory.listUndoLabels()
  const redoLabels = documentHistory.listRedoLabels()
  const rows = buildRows(undoLabels, redoLabels)
  const canUndo = documentHistory.canUndo
  const canRedo = documentHistory.canRedo

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <IconButton
          icon={ArrowCounterClockwise}
          title="Undo"
          disabled={!canUndo}
          onClick={() => void undo()}
        />
        <IconButton
          icon={ArrowClockwise}
          title="Redo"
          disabled={!canRedo}
          onClick={() => void redo()}
        />
        <span className={styles.meta}>
          {undoLabels.length} step{undoLabels.length === 1 ? '' : 's'}
          {redoLabels.length > 0 ? ` · ${redoLabels.length} ahead` : ''}
        </span>
      </div>
      <div className={styles.list} role="listbox" aria-label="History">
        {rows.map((row) => (
          <button
            key={`${row.depth}:${row.label}`}
            type="button"
            role="option"
            aria-selected={row.kind === 'current'}
            className={`${styles.row} ${styles[row.kind]}`}
            onClick={() => {
              if (row.kind === 'current') return
              void jumpToHistoryDepth(row.depth)
            }}
          >
            <span className={styles.marker} aria-hidden="true" />
            <span className={styles.label}>{row.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
