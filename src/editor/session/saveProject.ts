import {
  collectSaveAssets,
  clearRasterRecoveryAfterSave,
  getBridgeProjectStore,
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
 * Persist the active HappyDocument + raster layer PNGs via BridgeProjectStore.
 * Opens a default Untitled.happyshop project when none is bound yet.
 */
export async function saveActiveProject(): Promise<SaveProjectResult> {
  const store = getBridgeProjectStore()
  const session = useEditorSessionStore.getState()
  const document = session.document

  try {
    let path = session.project.projectPath
    let expectedRevision = session.project.revision

    if (!path || !store.openLocator) {
      const opened = await store.open({
        kind: 'directory',
        path: path ?? '', // bridge defaults to projects/Untitled.happyshop
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
