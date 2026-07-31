import type { CommandRegistry } from '../../core/commands/registry'
import { useEditorSessionStore } from '../session/EditorSessionStore'
import {
  applyToolPreset,
  isPaintToolId,
  saveToolPreset,
  type ToolPreset,
} from './toolPresets'

function paintToolActive(): boolean {
  return isPaintToolId(useEditorSessionStore.getState().activeToolId)
}

/** Window menu + command palette hooks for named tool presets. */
export function registerToolPresetCommands(
  registry: CommandRegistry,
  presets: readonly ToolPreset[],
): void {
  registry.register({
    id: 'toolPreset.save',
    title: 'Save Tool Preset…',
    enabled: paintToolActive,
    run: () => {
      const proposedName = window.prompt('Save tool preset as:')
      if (proposedName == null) return
      saveToolPreset(proposedName)
    },
  })

  for (const preset of presets) {
    registry.register({
      id: `toolPreset.apply.${preset.id}`,
      title: preset.name,
      enabled: () => true,
      run: () => {
        applyToolPreset(preset.id)
      },
    })
  }
}

export function listToolPresetCommandIds(presets: readonly ToolPreset[]): string[] {
  return presets.map((preset) => `toolPreset.apply.${preset.id}`)
}
