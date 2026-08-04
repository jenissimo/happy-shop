import type { CommandRegistry } from '../../../core/commands/registry'
import { openSaveAsDialog } from './controller'

/**
 * Real `file.saveAs` handler — overrides the `registerPhotoshopMenuCommands`
 * stub, same as `registerFileCommands` does for `file.new`/`file.open`.
 * Mod+Shift+S is Photoshop's binding and is free here: Save is Mod+S (which
 * `matchShortcut` will not fire while Shift is held) and Export is
 * Mod+Alt+Shift+S.
 */
export function registerSaveAsCommand(registry: CommandRegistry): void {
  registry.register({
    id: 'file.saveAs',
    title: 'Save As…',
    shortcut: 'Mod+Shift+S',
    enabled: () => true,
    run: () => openSaveAsDialog(),
  })
}
