import type { CommandRegistry } from '../../../core/commands/registry'
import {
  beginFreeTransform,
  cancelFreeTransformSession,
  commitFreeTransformSession,
  transformableSelection,
} from './transformCommit'
import { useTransformStore } from './transformStore'

export function registerTransformCommands(registry: CommandRegistry): void {
  registry.register({
    id: 'edit.freeTransform',
    title: 'Free Transform',
    shortcut: 'Mod+T',
    enabled: () =>
      transformableSelection().length > 0 ||
      useTransformStore.getState().session != null,
    run: () => {
      const session = useTransformStore.getState().session
      if (session) {
        commitFreeTransformSession()
        return
      }
      beginFreeTransform()
    },
  })
}

export {
  beginFreeTransform,
  cancelFreeTransformSession,
  commitFreeTransformSession,
}
