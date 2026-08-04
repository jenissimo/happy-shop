import { useEffect, useState } from 'react'
import {
  isBrowserProjectBackend,
  isSafeProjectName,
  projectNameFromPath,
  projectPathForName,
} from '../../../persistence'
import { useEditorSessionStore } from '../../../editor/session/EditorSessionStore'
import { useEditorContext } from '../../../editor/state/EditorContext'
import { Button } from '../../base/Button'
import { FloatingWindow } from '../../base/FloatingWindow'
import { closeSaveAsDialog, useSaveAsDialogOpen } from './controller'
import styles from './SaveAsDialog.module.css'

/**
 * File → Save As… — name a destination, bind the session to it and save there.
 * There is no OS file picker in the browser build, so the destination is a
 * project *name*: the bridge turns it into `projects/<name>.happyshop`, the
 * static build into a `browser:<name>` IndexedDB project.
 */
export function SaveAsDialog() {
  const open = useSaveAsDialogOpen()
  const { saveAs } = useEditorContext()
  const documentName = useEditorSessionStore((s) => s.document.name)
  const projectPath = useEditorSessionStore((s) => s.project.projectPath)

  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(projectNameFromPath(projectPath) ?? documentName.trim())
    setError(null)
    setBusy(false)
  }, [open, projectPath, documentName])

  const browser = isBrowserProjectBackend()
  const valid = isSafeProjectName(name)
  const destination = valid ? projectPathForName(name, { browser }) : null
  const overwritesCurrent = destination != null && destination === projectPath

  const submit = () => {
    if (!destination || busy) return
    setBusy(true)
    setError(null)
    void saveAs(destination).then((result) => {
      setBusy(false)
      if (result.ok) {
        closeSaveAsDialog()
        return
      }
      setError(
        'conflict' in result
          ? `That project changed on disk (revision ${result.currentRevision}). Pick another name or reopen it.`
          : result.error,
      )
    })
  }

  return (
    <FloatingWindow
      open={open}
      title="Save As"
      onClose={closeSaveAsDialog}
      width={380}
      bare
    >
      <div className={styles.content}>
        <label className={styles.field}>
          <span className={styles.label}>Save project as</span>
          <input
            className={styles.textInput}
            value={name}
            spellCheck={false}
            autoFocus
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              submit()
            }}
          />
        </label>

        <p className={styles.destination}>
          {destination
            ? `Destination: ${destination}`
            : 'Use letters, digits, dot, dash or underscore.'}
        </p>

        {overwritesCurrent && (
          <p className={styles.warning}>
            This is the project you already have open — saving here overwrites it.
          </p>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <Button onClick={() => closeSaveAsDialog()}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!destination || busy}
            onClick={submit}
          >
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </FloatingWindow>
  )
}
