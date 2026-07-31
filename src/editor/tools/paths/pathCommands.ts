import type { CommandRegistry } from '../../../core/commands/registry'
import { normalizePathStore } from '../../../core/document'
import { useEditorSessionStore } from '../../session/EditorSessionStore'
import {
  penPathIsFillable,
  penPathIsStrokable,
} from '../pen/penPath'
import {
  fillPath,
  pathToSelection,
  strokePathWithBrush,
} from '../pen/penPathOps'
import { resolvePenPathForOps, saveActiveWorkPathToDocument } from './pathDocumentSync'

export function registerPathCommands(registry: CommandRegistry): void {
  registry.register({
    id: 'path.save',
    title: 'Save Path',
    enabled: () => Boolean(normalizePathStore(useEditorSessionStore.getState().document.paths).workPath),
    run: () => {
      saveActiveWorkPathToDocument()
    },
  })
  registry.register({
    id: 'path.makeSelection',
    title: 'Make Selection',
    enabled: () => {
      const path = resolvePenPathForOps()
      return Boolean(path && penPathIsFillable(path))
    },
    run: () => {
      const path = resolvePenPathForOps()
      if (path) pathToSelection(path)
    },
  })

  registry.register({
    id: 'path.fill',
    title: 'Fill Path',
    enabled: () => {
      const path = resolvePenPathForOps()
      return Boolean(path && penPathIsFillable(path))
    },
    run: () => {
      const path = resolvePenPathForOps()
      if (path) fillPath(path)
    },
  })

  registry.register({
    id: 'path.stroke',
    title: 'Stroke Path',
    enabled: () => {
      const path = resolvePenPathForOps()
      return Boolean(path && penPathIsStrokable(path))
    },
    run: () => {
      const path = resolvePenPathForOps()
      if (path) void strokePathWithBrush(path)
    },
  })
}
