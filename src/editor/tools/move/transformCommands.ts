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
    // Chrome/Edge reserve Ctrl+T for "new tab" and never deliver it to the
    // page, so preventDefault cannot help — unlike Ctrl+`+`/`-`, which the
    // viewport does intercept. Mod+Alt+T is the reachable fallback.
    extraShortcuts: ['Mod+Alt+T'],
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
