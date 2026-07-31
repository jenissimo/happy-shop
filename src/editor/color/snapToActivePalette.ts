import { nearestPaletteColor } from '../../imaging/palettes/nearestColor'
import { useEditorSessionStore } from '../session/EditorSessionStore'
import { usePaletteStore } from './paletteStore'

const PAINT_TOOLS = new Set(['brush', 'pencil'])

export function shouldSnapForegroundForActiveTool(): boolean {
  const { snapToPalette, activeColors } = usePaletteStore.getState()
  if (!snapToPalette || activeColors.length === 0) return false
  return PAINT_TOOLS.has(useEditorSessionStore.getState().activeToolId)
}

/** Quantize `color` to the active Lospec palette when snap is enabled for brush/pencil. */
export function snapToActivePalette(color: string): string {
  if (!shouldSnapForegroundForActiveTool()) return color
  const { activeColors } = usePaletteStore.getState()
  return nearestPaletteColor(color, activeColors)
}
