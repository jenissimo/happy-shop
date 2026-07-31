import { useMemo } from 'react'
import { Path, Selection, PaintBrush, Trash, FloppyDisk } from '@phosphor-icons/react'
import type { PathId } from '../../../core/document'
import { setActivePathId } from '../../../core/document/pathOperations'
import { createMetadataEntry } from '../../../core/history'
import { IconButton } from '../../../ui/base/IconButton'
import { useEditorContext } from '../../state/EditorContext'
import { documentHistory } from '../../session/documentHistory'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import {
  pathPanelActiveId,
  pathPanelRows,
} from '../../tools/paths/pathPanelModel'
import styles from './PathsPanel.module.css'

function commitDocument(label: string, after: ReturnType<typeof useEditorSessionStore.getState>['document']) {
  const before = useEditorSessionStore.getState().document
  if (after === before) return
  const apply = (document: typeof after) => {
    useEditorSessionStore.setState({
      document,
      dirty: true,
      historyVersion: documentHistory.version,
    })
  }
  documentHistory.push(createMetadataEntry({ label, before, after, apply }))
  apply(after)
}

export function PathsPanel() {
  const { commands } = useEditorContext()
  const document = useEditorSessionStore((state) => state.document)
  const rows = useMemo(() => pathPanelRows(document.paths), [document.paths])
  const activeId = useMemo(() => pathPanelActiveId(document.paths), [document.paths])

  const selectPath = (pathId: PathId) => {
    commitDocument('Select Path', setActivePathId(document, pathId))
  }

  const run = (commandId: string) => {
    commands.run(commandId)
  }

  return (
    <div className={styles.root}>
      <div className={styles.list} role="listbox" aria-label="Paths">
        {rows.length === 0 ? (
          <div className={styles.empty}>
            No paths yet. Use the Pen tool to create a work path.
          </div>
        ) : (
          rows.map((row) => (
            <button
              key={row.id}
              type="button"
              role="option"
              aria-selected={row.id === activeId}
              className={`${styles.row}${row.id === activeId ? ` ${styles.rowActive}` : ''}`}
              onClick={() => selectPath(row.id)}
            >
              <Path size={14} className={styles.icon} aria-hidden />
              <span className={styles.label}>{row.label}</span>
              <span className={styles.meta}>
                {row.knotCount} pt{row.knotCount === 1 ? '' : 's'}
                {row.closed ? ' · closed' : ''}
              </span>
            </button>
          ))
        )}
      </div>
      <div className={styles.actionBar} role="toolbar" aria-label="Path actions">
        <IconButton
          icon={Selection}
          size={14}
          className={styles.actionBtn}
          title="Make Selection"
          disabled={!commands.get('path.makeSelection')?.enabled()}
          onClick={() => run('path.makeSelection')}
        />
        <IconButton
          icon={PaintBrush}
          size={14}
          className={styles.actionBtn}
          title="Fill Path"
          disabled={!commands.get('path.fill')?.enabled()}
          onClick={() => run('path.fill')}
        />
        <IconButton
          icon={Path}
          size={14}
          className={styles.actionBtn}
          title="Stroke Path"
          disabled={!commands.get('path.stroke')?.enabled()}
          onClick={() => run('path.stroke')}
        />
        <IconButton
          icon={FloppyDisk}
          size={14}
          className={styles.actionBtn}
          title="Save Path"
          disabled={!commands.get('path.save')?.enabled()}
          onClick={() => run('path.save')}
        />
        <IconButton
          icon={Trash}
          size={14}
          className={styles.actionBtn}
          title="Delete Path (coming soon)"
          disabled
        />
      </div>
    </div>
  )
}
