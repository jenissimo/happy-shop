import type { CommandRegistry } from '../../core/commands/registry'
import { useEditorSessionStore } from '../session/EditorSessionStore'
import { isLiquifyTool } from '../tools/liquify/liquifyTools'
import { useBrushSettingsStore } from '../tools/brush/brushSettingsStore'
import { useRetouchSettingsStore } from '../tools/retouch/retouchSettingsStore'
import { useColorStore } from './colorStore'
import { usePaletteStore } from './paletteStore'

function toolSizeStep(size: number): number {
  if (size <= 10) return 1
  if (size <= 50) return 5
  if (size <= 100) return 10
  return 25
}

function isRetouchTool(): boolean {
  const tool = useEditorSessionStore.getState().activeToolId
  return (
    tool === 'cloneStamp' ||
    tool === 'historyBrush' ||
    tool === 'patternStamp' ||
    tool === 'smudge' ||
    tool === 'blur' ||
    tool === 'sharpen' ||
    tool === 'dodge' ||
    tool === 'burn' ||
    tool === 'sponge' ||
    tool === 'spotHealing' ||
    tool === 'healingBrush' ||
    isLiquifyTool(tool)
  )
}

function isBrushTool(): boolean {
  const tool = useEditorSessionStore.getState().activeToolId
  return tool === 'brush' || tool === 'pencil' || tool === 'eraser'
}

function nudgeActiveToolSize(direction: 1 | -1): void {
  if (isRetouchTool()) {
    const size = useRetouchSettingsStore.getState().size
    useRetouchSettingsStore
      .getState()
      .setPrefs({ size: size + direction * toolSizeStep(size) })
    return
  }
  const size = useBrushSettingsStore.getState().size
  useBrushSettingsStore
    .getState()
    .setPrefs({ size: size + direction * toolSizeStep(size) })
}

function nudgeBrushHardness(direction: 1 | -1): void {
  const hardness = useBrushSettingsStore.getState().hardness
  useBrushSettingsStore
    .getState()
    .setPrefs({ hardness: hardness + direction * 0.1 })
}

/** FG/BG (D/X) + active paint-tool size/hardness brackets (PS grammar). */
export function registerColorAndBrushCommands(registry: CommandRegistry): void {
  // Align FG with persisted brush color once at registration.
  const brushColor = useBrushSettingsStore.getState().color
  if (brushColor) {
    useColorStore.setState({ foreground: brushColor })
  }

  usePaletteStore.subscribe((state, prev) => {
    if (
      state.snapToPalette &&
      state.activeColors.length > 0 &&
      (state.snapToPalette !== prev.snapToPalette ||
        state.activeColors !== prev.activeColors)
    ) {
      useColorStore.getState().setForeground(useColorStore.getState().foreground)
    }
  })

  registry.register({
    id: 'color.default',
    title: 'Default Colors',
    shortcut: 'D',
    enabled: () => true,
    run: () => {
      useColorStore.getState().resetDefaults()
    },
  })

  registry.register({
    id: 'color.swap',
    title: 'Swap Foreground/Background',
    shortcut: 'X',
    enabled: () => true,
    run: () => {
      useColorStore.getState().swap()
    },
  })

  registry.register({
    id: 'brush.sizeDecrease',
    title: 'Decrease Active Tool Size',
    shortcut: '[',
    enabled: () => isBrushTool() || isRetouchTool(),
    run: () => nudgeActiveToolSize(-1),
  })

  registry.register({
    id: 'brush.sizeIncrease',
    title: 'Increase Active Tool Size',
    shortcut: ']',
    enabled: () => isBrushTool() || isRetouchTool(),
    run: () => nudgeActiveToolSize(1),
  })

  registry.register({
    id: 'brush.hardnessDecrease',
    title: 'Decrease Brush Hardness',
    shortcut: 'Shift+[',
    enabled: isBrushTool,
    run: () => nudgeBrushHardness(-1),
  })

  registry.register({
    id: 'brush.hardnessIncrease',
    title: 'Increase Brush Hardness',
    shortcut: 'Shift+]',
    enabled: isBrushTool,
    run: () => nudgeBrushHardness(1),
  })
}
