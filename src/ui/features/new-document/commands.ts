import type { CommandRegistry } from '../../../core/commands/registry'
import { exportFlattenedPng } from '../../../editor/export/exportFlattened'
import { toRenderDocumentView } from '../../../editor/session/toRenderDocumentView'
import { useEditorSessionStore } from '../../../editor/session/EditorSessionStore'
import { reportGoogleFontBakeBlock } from '../../../editor/tools/text/googleFonts/reportGoogleFontBakeBlock'
import { GoogleFontUnavailableError } from '../../../editor/tools/text/textRasterize'
import {
  ensureInitialDocumentTab,
  useDocumentTabManager,
} from '../../../editor/session/DocumentTabManager'
import { requestCloseTab } from '../../../editor/session/tabClose'
import { registerRasterSurface } from '../../../imaging'
import { getBridgeProjectStore } from '../../../persistence'
import { emitDocumentCreated, openNewDocumentDialog } from './controller'
import { createDocumentFromClipboard, openImageFile, type NewDocumentResult } from './fileOpen'
import { addRecentProject } from './recentProjects'

export async function openProjectPath(path: string): Promise<void> {
  const project = await getBridgeProjectStore().open({ kind: 'directory', path })
  await Promise.all(Object.entries(project.assets).map(async ([assetId, descriptor]) => {
    const blob = await getBridgeProjectStore().readAsset(assetId)
    const bitmap = await createImageBitmap(blob)
    registerRasterSurface({
      assetId,
      width: descriptor.width ?? bitmap.width,
      height: descriptor.height ?? bitmap.height,
      bitmap,
    })
  }))
  ensureInitialDocumentTab()
  useDocumentTabManager.getState().openDocument(project.document, {
    projectPath: project.locator.path,
    revision: project.revision,
    dedupeByPath: true,
  })
  addRecentProject(project.locator.path, project.document.name)
}

/**
 * Applies a freshly created document in a new tab (MULTI-DOC M2.5).
 * Import paths already register assets in `fileOpen`; we re-register here so
 * blank New Document (no assets) and any future creators stay consistent.
 */
export function applyNewDocument(result: NewDocumentResult): void {
  for (const asset of result.assets) {
    registerRasterSurface(asset)
  }
  ensureInitialDocumentTab()
  useDocumentTabManager.getState().openDocument(result.document)
  emitDocumentCreated(result)
}

/**
 * Registers `file.new` / `file.newFromClipboard` / `file.open` (UX-PHOTOSHOP.md
 * menu IA + shortcuts). Call once per `CommandRegistry` instance — typically
 * from the same `EditorShell` effect that registers `palette.toggle`/
 * `settings.open` today, so the existing global keydown handler in
 * `EditorContext` picks up the shortcuts for free.
 */
export function registerFileCommands(registry: CommandRegistry): void {
  registry.register({
    id: 'file.new',
    title: 'New…',
    shortcut: 'Mod+N',
    enabled: () => true,
    run: () => openNewDocumentDialog(),
  })

  registry.register({
    id: 'file.newFromClipboard',
    title: 'New from Clipboard',
    shortcut: 'Mod+Shift+N',
    enabled: () => true,
    run: () => {
      void createDocumentFromClipboard().then((result) => {
        if (result) applyNewDocument(result)
        else openNewDocumentDialog() // UX-PHOTOSHOP.md: fall back to the dialog when nothing to paste.
      })
    },
  })

  registry.register({
    id: 'file.open',
    title: 'Open…',
    shortcut: 'Mod+O',
    enabled: () => true,
    run: () => {
      void openImageFile().then((result) => {
        if (result) applyNewDocument(result)
      })
    },
  })

  registry.register({
    id: 'file.export',
    title: 'Export As PNG…',
    shortcut: 'Mod+Alt+Shift+S',
    enabled: () => true,
    run: () => {
      const doc = useEditorSessionStore.getState().document
      const view = toRenderDocumentView(doc)
      const baseName = doc.name.trim() || 'export'
      void exportFlattenedPng(view, `${baseName}.png`, doc).catch((err) => {
        if (
          err instanceof GoogleFontUnavailableError
          && err.layerId
          && reportGoogleFontBakeBlock(
            err,
            err.layerId,
            async () => {
              const current = useEditorSessionStore.getState()
              await exportFlattenedPng(
                toRenderDocumentView(current.document),
                `${baseName}.png`,
                current.document,
              )
            },
          )
        ) {
          return
        }
        console.error('Export failed', err)
        window.alert(err instanceof Error ? err.message : 'Export failed')
      })
    },
  })

  registry.register({
    id: 'file.close',
    title: 'Close',
    enabled: () => true,
    run: () => {
      ensureInitialDocumentTab()
      const id = useDocumentTabManager.getState().activeTabId
      if (!id) return
      requestCloseTab(id)
    },
  })

  registry.register({
    id: 'doc.tabNext',
    title: 'Next Document Tab',
    shortcut: 'Ctrl+PageDown',
    enabled: () => useDocumentTabManager.getState().tabs.length > 1,
    run: () => {
      ensureInitialDocumentTab()
      useDocumentTabManager.getState().nextTab()
    },
  })

  registry.register({
    id: 'doc.tabPrev',
    title: 'Previous Document Tab',
    shortcut: 'Ctrl+PageUp',
    enabled: () => useDocumentTabManager.getState().tabs.length > 1,
    run: () => {
      ensureInitialDocumentTab()
      useDocumentTabManager.getState().prevTab()
    },
  })
}

