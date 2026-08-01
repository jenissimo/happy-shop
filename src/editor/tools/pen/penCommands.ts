import type { CommandRegistry } from '../../../core/commands/registry'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import { cyclePenTool, isPenToolId } from '../../toolbar/tools'
import { commitWorkPathFromPen, getActiveWorkPath } from './penPathOps'
import { canUndoPenDraftAnchor, undoPenDraftAnchor } from './penWorkPathUndo'
import { useWorkPathStore } from './workPathStore'

/** Pen + path-selection tool commands (path ops live in `paths/pathCommands.ts`). */
export function registerPenCommands(registry: CommandRegistry): void {
  registry.register({
    id: 'tool.pen',
    title: 'Pen Tool',
    shortcut: 'P',
    enabled: () => true,
    run: () => {
      const session = useEditorSessionStore.getState()
      if (isPenToolId(session.activeToolId)) {
        session.setActiveToolId(cyclePenTool(session.activeToolId))
      } else {
        session.setActiveToolId('pen')
      }
    },
  })

  registry.register({
    id: 'tool.pen.cycleReverse',
    title: 'Cycle Pen Tool backwards',
    shortcut: 'Shift+P',
    enabled: () => true,
    run: () => {
      const session = useEditorSessionStore.getState()
      const current = isPenToolId(session.activeToolId) ? session.activeToolId : 'pen'
      session.setActiveToolId(cyclePenTool(current, true))
    },
  })

  registry.register({
    id: 'tool.freeformPen',
    title: 'Freeform Pen Tool',
    enabled: () => true,
    run: () => useEditorSessionStore.getState().setActiveToolId('freeformPen'),
  })

  registry.register({
    id: 'tool.addAnchor',
    title: 'Add Anchor Point Tool',
    enabled: () => true,
    run: () => useEditorSessionStore.getState().setActiveToolId('addAnchor'),
  })

  registry.register({
    id: 'tool.deleteAnchor',
    title: 'Delete Anchor Point Tool',
    enabled: () => true,
    run: () => useEditorSessionStore.getState().setActiveToolId('deleteAnchor'),
  })

  registry.register({
    id: 'tool.convertPoint',
    title: 'Convert Point Tool',
    enabled: () => true,
    run: () => useEditorSessionStore.getState().setActiveToolId('convertPoint'),
  })

  registry.register({
    id: 'tool.pathSelection',
    title: 'Path Selection Tool',
    shortcut: 'A',
    enabled: () => true,
    run: () => {
      const session = useEditorSessionStore.getState()
      if (session.activeToolId === 'pathSelection') {
        session.setActiveToolId('directSelection')
      } else if (session.activeToolId === 'directSelection') {
        session.setActiveToolId('pathSelection')
      } else {
        session.setActiveToolId('pathSelection')
      }
    },
  })

  registry.register({
    id: 'tool.pathSelection.cycleReverse',
    title: 'Cycle Path Selection Tool backwards',
    shortcut: 'Shift+A',
    enabled: () => true,
    run: () => {
      const session = useEditorSessionStore.getState()
      session.setActiveToolId(
        session.activeToolId === 'directSelection' ? 'pathSelection' : 'directSelection',
      )
    },
  })

  registry.register({
    id: 'tool.directSelection',
    title: 'Direct Selection Tool',
    enabled: () => true,
    run: () => useEditorSessionStore.getState().setActiveToolId('directSelection'),
  })

  registry.register({
    id: 'path.undoAnchor',
    title: 'Undo Last Anchor',
    shortcut: 'Mod+Z',
    enabled: () => canUndoPenDraftAnchor(),
    run: () => {
      undoPenDraftAnchor()
    },
  })

  registry.register({
    id: 'path.clear',
    title: 'Clear Work Path',
    enabled: () => Boolean(getActiveWorkPath() || useWorkPathStore.getState().draft),
    run: () => useWorkPathStore.getState().clearAll(),
  })

  registry.register({
    id: 'path.commit',
    title: 'Commit Work Path',
    enabled: () => Boolean(getActiveWorkPath()),
    run: () => {
      commitWorkPathFromPen()
    },
  })
}
