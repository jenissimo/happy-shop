import type { CommandRegistry } from '../../../core/commands/registry'
import { createMetadataEntry } from '../../../core/history'
import { openCanvasSizeDialog } from '../../../ui/features/canvas-size'
import { openImageSizeDialog } from '../../../ui/features/image-size'
import { documentHistory } from '../../session/documentHistory'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { useSelectionStore } from '../../session/selectionStore'
import { cropDocument } from './cropDocument'
import { trimDocument } from './trimDocument'

function applyDoc(doc: ReturnType<typeof useEditorSessionStore.getState>['document']) {
  useEditorSessionStore.setState({ document: doc, dirty: true })
}

function hasCropRect(): boolean {
  const marquee = useSelectionStore.getState().marquee
  return !!marquee && marquee.width >= 1 && marquee.height >= 1
}

function runCrop(): void {
  const marquee = useSelectionStore.getState().marquee
  if (!marquee || marquee.width < 1 || marquee.height < 1) return
  const before = useEditorSessionStore.getState().document
  const after = cropDocument(before, marquee)
  documentHistory.push(
    createMetadataEntry({
      label: 'Crop',
      before,
      after,
      apply: applyDoc,
    }),
  )
  useEditorSessionStore.setState({
    document: after,
    dirty: true,
    historyVersion: documentHistory.version,
  })
  useSelectionStore.getState().deselect()
}

export function registerImageEditCommands(registry: CommandRegistry): void {
  registry.register({
    id: 'image.imageSize',
    title: 'Image Size…',
    enabled: () => true,
    run: () => openImageSizeDialog(),
  })

  registry.register({
    id: 'image.crop',
    title: 'Crop',
    enabled: () => hasCropRect(),
    run: () => runCrop(),
  })

  // Enter commits the crop rectangle only while the Crop tool is active.
  registry.register({
    id: 'image.crop.commit',
    title: 'Commit Crop',
    shortcut: 'Enter',
    enabled: () =>
      useEditorSessionStore.getState().activeToolId === 'crop' && hasCropRect(),
    run: () => runCrop(),
  })

  registry.register({
    id: 'image.trim',
    title: 'Trim…',
    enabled: () => true,
    run: () => {
      void (async () => {
        const before = useEditorSessionStore.getState().document
        const after = await trimDocument(before)
        if (after === before) return
        documentHistory.push(
          createMetadataEntry({
            label: 'Trim',
            before,
            after,
            apply: applyDoc,
          }),
        )
        useEditorSessionStore.setState({
          document: after,
          dirty: true,
          historyVersion: documentHistory.version,
        })
      })()
    },
  })

  registry.register({
    id: 'image.canvasSize',
    title: 'Canvas Size…',
    enabled: () => true,
    run: () => openCanvasSizeDialog(),
  })

  registry.register({
    id: 'select.all',
    title: 'Select All',
    shortcut: 'Mod+A',
    enabled: () => true,
    run: () => {
      const { width, height } = useEditorSessionStore.getState().document.canvas
      useSelectionStore.getState().selectAll(width, height)
    },
  })

  registry.register({
    id: 'select.deselect',
    title: 'Deselect',
    shortcut: 'Mod+D',
    enabled: () =>
      useSelectionStore.getState().hasSelection() ||
      useSelectionStore.getState().marquee != null,
    run: () => useSelectionStore.getState().deselect(),
  })

  registry.register({
    id: 'select.reselect',
    title: 'Reselect',
    shortcut: 'Mod+Shift+D',
    enabled: () => {
      const { lastMask, lastMarquee } = useSelectionStore.getState()
      if (lastMask && !lastMask.isEmpty()) return true
      return (
        lastMarquee != null &&
        lastMarquee.width >= 1 &&
        lastMarquee.height >= 1
      )
    },
    run: () => useSelectionStore.getState().reselect(),
  })
}
