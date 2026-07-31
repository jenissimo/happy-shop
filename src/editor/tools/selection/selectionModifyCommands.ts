import type { CommandRegistry } from '../../../core/commands/registry'
import { useSelectionStore } from '../../session/selectionStore'

const MAX_FEATHER_RADIUS = 250

/** Feather the active selection in document pixels. */
export function featherActiveSelection(radius: number): boolean {
  const mask = useSelectionStore.getState().mask
  if (!mask || mask.isEmpty()) return false
  const normalized = Math.max(
    0,
    Math.min(MAX_FEATHER_RADIUS, Number.isFinite(radius) ? radius : 0),
  )
  if (normalized <= 0) return false
  useSelectionStore.getState().setMask(mask.feather(normalized))
  return true
}

export function registerSelectionModifyCommands(registry: CommandRegistry): void {
  registry.register({
    id: 'select.modify.feather',
    title: 'Feather…',
    enabled: () => useSelectionStore.getState().hasSelection(),
    run: () => {
      const initial = '1'
      const value = window.prompt('Feather Radius (px)', initial)
      if (value == null) return
      featherActiveSelection(Number(value))
    },
  })
}
