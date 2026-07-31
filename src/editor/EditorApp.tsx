import { useEffect } from 'react'
import { EditorProvider } from './state/EditorContext'
import { EditorShell } from './shell/EditorShell'
import { ThemeProvider } from './theme/ThemeProvider'
import { createDemoHappyDocument } from './session/demoHappyDocument'
import { useEditorSessionStore } from './session/EditorSessionStore'
import { ensureInitialDocumentTab } from './session/DocumentTabManager'
import { useDocumentTabManager } from './session/DocumentTabManager'
import { useBrushSettingsStore } from './tools/brush/brushSettingsStore'
import { useColorStore } from './color/colorStore'
import { useGuidesStore } from './viewport/guides'
import {
  installSessionHmrHandoff,
  hasDirtyRecoveryJournal,
  parseSessionSnapshot,
  persistSessionSnapshot,
  readPersistedSession,
  restoreSessionSnapshot,
} from './session/sessionPersistence'

export function EditorApp() {
  useEffect(() => {
    let cancelled = false
    const hot = import.meta.hot
    installSessionHmrHandoff(hot)

    const snapshot =
      parseSessionSnapshot(hot?.data.editorSession) ?? readPersistedSession()

    const bootstrap = async () => {
      if (snapshot) {
        await restoreSessionSnapshot(snapshot)
        if (!cancelled) persistSessionSnapshot()
        return
      }
      if (hasDirtyRecoveryJournal()) {
        // The journal does not contain pixels, but it truthfully signals that
        // the last session was dirty. Keep a blank recovery shell rather than
        // replacing that context with the demo fixture.
        ensureInitialDocumentTab()
        persistSessionSnapshot()
        return
      }

      // The demo is a first-session fixture only. Any valid session marker
      // (including a dirty recovery marker) takes the restoration branch above.
      const doc = await createDemoHappyDocument()
      if (cancelled) return
      useEditorSessionStore.getState().setDocument(doc)
      ensureInitialDocumentTab()
      persistSessionSnapshot()
    }
    void bootstrap()

    const unsubscribers = [
      useEditorSessionStore.subscribe(() => persistSessionSnapshot()),
      useDocumentTabManager.subscribe(() => persistSessionSnapshot()),
      useBrushSettingsStore.subscribe(() => persistSessionSnapshot()),
      useColorStore.subscribe(() => persistSessionSnapshot()),
      useGuidesStore.subscribe(() => persistSessionSnapshot()),
    ]
    return () => {
      cancelled = true
      unsubscribers.forEach((unsubscribe) => unsubscribe())
      persistSessionSnapshot()
    }
  }, [])

  return (
    <ThemeProvider>
      <EditorProvider>
        <EditorShell />
      </EditorProvider>
    </ThemeProvider>
  )
}
