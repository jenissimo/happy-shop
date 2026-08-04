import type { HappyDocument } from '../../core/document'
import {
  assertSafeProjectPath,
  collectSaveAssets,
  clearRasterRecoveryAfterSave,
  getProjectStore,
  ProjectConflictError,
  type ProjectStore,
  type StagedAssetWrite,
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
 * Everything the save pipeline touches outside the session store, injectable so
 * the path/binding logic can be unit tested without a ProjectStore backend,
 * a raster surface encoder or IndexedDB.
 */
export type SaveProjectDeps = {
  getStore: () => ProjectStore
  collectAssets: (document: HappyDocument) => Promise<StagedAssetWrite[]>
  rememberRecent: (path: string, name: string) => void
  afterSave: () => Promise<void>
}

const defaultDeps: SaveProjectDeps = {
  getStore: getProjectStore,
  collectAssets: collectSaveAssets,
  rememberRecent: addRecentProject,
  afterSave: clearRasterRecoveryAfterSave,
}

type SaveTarget = {
  /** `null` = wherever the session is already bound (plain Save). */
  path: string | null
  /**
   * Save As must re-open even when the store already points at the target, so
   * the transaction commits against that project's *current* revision rather
   * than the revision of the project we were editing.
   */
  reopen: boolean
}

async function persist(
  target: SaveTarget,
  deps: SaveProjectDeps,
): Promise<SaveProjectResult> {
  const store = deps.getStore()
  const session = useEditorSessionStore.getState()
  const document = session.document
  const previousBinding = session.project
  let rebound = false

  try {
    let path = target.path ?? previousBinding.projectPath
    let expectedRevision = target.reopen ? null : previousBinding.revision

    // ProjectStore is process-wide in the browser.  Re-open when switching
    // tabs/projects so a save cannot use the locator left by another tab.
    if (target.reopen || !path || store.openLocator?.path !== path) {
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
      rebound = true
    }

    const assets = await deps.collectAssets(document)
    const revision = await store.save({
      expectedRevision,
      document,
      assets,
    })

    useEditorSessionStore.getState().bindProject({
      projectPath: path,
      revision,
    })
    // `bindProject`/`markClean` push the new binding into the active document
    // tab themselves, so the tab strip follows a Save As without extra work.
    useEditorSessionStore.getState().markClean()
    deps.rememberRecent(path, document.name)
    await deps.afterSave()

    return { ok: true, revision, path }
  } catch (e) {
    // A failed Save As is not a rebind: the session must keep addressing the
    // project it was editing so a follow-up Ctrl+S still targets the original.
    if (rebound) {
      useEditorSessionStore.getState().bindProject({
        projectPath: previousBinding.projectPath,
        revision: previousBinding.revision,
      })
    }
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

/**
 * Persist the active HappyDocument + raster layer PNGs via the active
 * ProjectStore (Vite bridge in DEV, IndexedDB on static hosts).
 * Opens a default Untitled project when none is bound yet.
 */
export function saveActiveProject(
  deps: SaveProjectDeps = defaultDeps,
): Promise<SaveProjectResult> {
  return persist({ path: null, reopen: false }, deps)
}

/**
 * File → Save As…: bind the session to `destination` and save there, leaving
 * the previously bound project untouched. `destination` comes from
 * `projectPathForName`; it is re-validated here so no caller can hand a raw
 * user string straight to the store.
 */
export async function saveActiveProjectAs(
  destination: string,
  deps: SaveProjectDeps = defaultDeps,
): Promise<SaveProjectResult> {
  let path: string
  try {
    path = assertSafeProjectPath(destination)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid destination' }
  }
  return persist({ path, reopen: true }, deps)
}
