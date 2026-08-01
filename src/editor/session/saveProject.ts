import {
  collectSaveAssets,
  clearRasterRecoveryAfterSave,
  getProjectStore,
  ProjectConflictError,
} from '../../persistence'
import { useEditorSessionStore } from './EditorSessionStore'
import { addRecentProject } from '../../ui/features/new-document/recentProjects'

export type SaveProjectResult =
  | { ok: true; revision: string; path: string }
  | {
      ok: false
      conflict: true
      currentRevision: string
    }
  | { ok: false; error: string }

/**
 * Persist the active HappyDocument + raster layer PNGs via the active
 * ProjectStore (Vite bridge in DEV, IndexedDB on static hosts).
 * Opens a default Untitled project when none is bound yet.
 */
export async function saveActiveProject(): Promise<SaveProjectResult> {
  const store = getProjectStore()
  const session = useEditorSessionStore.getState()
  const document = session.document

  try {
    let path = session.project.projectPath
    let expectedRevision = session.project.revision

    // ProjectStore is process-wide in the browser.  Re-open when switching
    // tabs/projects so a save cannot use the locator left by another tab.
    if (!path || store.openLocator?.path !== path) {
      const opened = await store.open({
        kind: 'directory',
        path: path ?? '', // bridge → Untitled.happyshop; browser → browser:Untitled
      })
      path = opened.locator.path
      // First bind: if we created a fresh project, allow overwrite of empty doc.
      expectedRevision = opened.revision
      useEditorSessionStore.getState().bindProject({
        projectPath: path,
        revision: opened.revision,
      })
    }

    const assets = await collectSaveAssets(document)
    const revision = await store.save({
      expectedRevision,
      document,
      assets,
    })

    useEditorSessionStore.getState().bindProject({
      projectPath: path,
      revision,
    })
    useEditorSessionStore.getState().markClean()
    addRecentProject(path, document.name)
    await clearRasterRecoveryAfterSave()

    return { ok: true, revision, path }
  } catch (e) {
    if (e instanceof ProjectConflictError) {
      return {
        ok: false,
        conflict: true,
        currentRevision: e.currentRevision,
      }
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Save failed',
    }
  }
}
