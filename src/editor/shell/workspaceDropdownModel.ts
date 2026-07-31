import type { CommandRegistry } from '../../core/commands/registry'
import {
  WORKSPACE_LAYOUTS,
  WORKSPACE_PRESET_ORDER,
  type WorkspaceLayoutId,
} from './defaultLayout'

export type SavedWorkspaceEntry = { name: string }

export type BuiltinWorkspaceItem = {
  id: WorkspaceLayoutId
  title: string
  commandId: string
}

export type CustomWorkspaceItem = {
  index: number
  name: string
  commandId: string
}

/** Built-in presets in stable menu order (see WORKSPACE_PRESET_ORDER). */
export function listBuiltinWorkspaceItems(): BuiltinWorkspaceItem[] {
  const seen = new Set<WorkspaceLayoutId>()

  const items: BuiltinWorkspaceItem[] = WORKSPACE_PRESET_ORDER.filter(
    (id) => id in WORKSPACE_LAYOUTS,
  ).map((id) => {
    seen.add(id)
    const preset = WORKSPACE_LAYOUTS[id]
    return {
      id,
      title: preset.title,
      commandId: workspaceCommandIdForPreset(id),
    }
  })

  for (const id of Object.keys(WORKSPACE_LAYOUTS) as WorkspaceLayoutId[]) {
    if (seen.has(id)) continue
    const preset = WORKSPACE_LAYOUTS[id]
    items.push({
      id,
      title: preset.title,
      commandId: workspaceCommandIdForPreset(id),
    })
  }

  return items
}

export function workspaceCommandIdForPreset(id: WorkspaceLayoutId): string {
  return `workspace.${id}`
}

export function workspaceCommandIdForCustom(index: number): string {
  return `workspace.custom.${index}`
}

export function listCustomWorkspaceItems(
  saved: readonly SavedWorkspaceEntry[],
): CustomWorkspaceItem[] {
  return saved.map((entry, index) => ({
    index,
    name: entry.name,
    commandId: workspaceCommandIdForCustom(index),
  }))
}

export function resolveActiveWorkspaceLabel(
  activeCommandId: string | null | undefined,
  builtins: readonly BuiltinWorkspaceItem[],
  customs: readonly CustomWorkspaceItem[],
  commands: CommandRegistry,
  fallbackLayoutId: WorkspaceLayoutId = 'essentials',
): string {
  if (activeCommandId) {
    const custom = customs.find((item) => item.commandId === activeCommandId)
    if (custom) return custom.name

    const builtin = builtins.find((item) => item.commandId === activeCommandId)
    if (builtin) return builtin.title

    const cmd = commands.get(activeCommandId)
    if (cmd) return cmd.title.replace(/^Workspace:\s*/, '')
  }

  return WORKSPACE_LAYOUTS[fallbackLayoutId].title
}

export function isWorkspaceMenuCommandId(id: string): boolean {
  return (
    id.startsWith('workspace.') &&
    id !== 'workspace.reset' &&
    id !== 'workspace.saveCurrent'
  )
}
