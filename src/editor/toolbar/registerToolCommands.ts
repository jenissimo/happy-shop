import type { CommandRegistry } from '../../core/commands/registry'
import { useEditorSessionStore } from '../session/EditorSessionStore'
import { useSelectionToolStore } from '../session/selectionToolStore'
import {
  TOOLS,
  lassoTitle,
  marqueeTitle,
  type EditorToolId,
  type ToolGroup,
} from './tools'
import { cycleToolGroup, persistToolFlyoutSelection, readToolFlyoutPrefs } from './toolFlyoutPrefs'

/** Registers tool.* commands that set session `activeToolId` (stubs OK). */
export function registerToolCommands(registry: CommandRegistry): void {
  const registeredGroups = new Set<ToolGroup>()

  const cycleGroup = (group: ToolGroup, direction: 1 | -1) => {
    const session = useEditorSessionStore.getState()
    const id = cycleToolGroup(
      TOOLS,
      readToolFlyoutPrefs(),
      group,
      session.activeToolId,
      direction,
    )
    persistToolFlyoutSelection(group, id)
    session.setActiveToolId(id)
  }

  for (const tool of TOOLS) {
    const toolId = tool.id as EditorToolId
    const enabled = tool.enabled !== false

    if (toolId === 'marquee') {
      registry.register({
        id: 'tool.marquee',
        title: 'Rectangular Marquee Tool',
        shortcut: 'M',
        enabled: () => enabled,
        run: () => {
          if (!enabled) return
          const session = useEditorSessionStore.getState()
          if (session.activeToolId === 'marquee') {
            useSelectionToolStore.getState().cycleMarqueeShape()
          } else {
            session.setActiveToolId('marquee')
          }
        },
      })
      registry.register({
        id: 'tool.marquee.cycle',
        title: 'Cycle Marquee Tool',
        shortcut: 'Shift+M',
        enabled: () => enabled,
        run: () => {
          if (!enabled) return
          useSelectionToolStore.getState().cycleMarqueeShape(-1)
          useEditorSessionStore.getState().setActiveToolId('marquee')
        },
      })
      registry.register({
        id: 'tool.marquee.rect',
        title: 'Rectangular Marquee Tool',
        enabled: () => enabled,
        run: () => {
          useSelectionToolStore.getState().setMarqueeShape('rect')
          useEditorSessionStore.getState().setActiveToolId('marquee')
        },
      })
      registry.register({
        id: 'tool.marquee.ellipse',
        title: marqueeTitle('ellipse'),
        enabled: () => enabled,
        run: () => {
          useSelectionToolStore.getState().setMarqueeShape('ellipse')
          useEditorSessionStore.getState().setActiveToolId('marquee')
        },
      })
      continue
    }

    if (toolId === 'lasso') {
      registry.register({
        id: 'tool.lasso',
        title: 'Lasso Tool',
        shortcut: 'L',
        enabled: () => enabled,
        run: () => {
          if (!enabled) return
          const session = useEditorSessionStore.getState()
          if (session.activeToolId === 'lasso') {
            useSelectionToolStore.getState().cycleLassoMode()
          } else {
            session.setActiveToolId('lasso')
          }
        },
      })
      registry.register({
        id: 'tool.lasso.cycle',
        title: 'Cycle Lasso Tool',
        shortcut: 'Shift+L',
        enabled: () => enabled,
        run: () => {
          if (!enabled) return
          useSelectionToolStore.getState().cycleLassoMode(-1)
          useEditorSessionStore.getState().setActiveToolId('lasso')
        },
      })
      registry.register({
        id: 'tool.lasso.freehand',
        title: 'Lasso Tool',
        enabled: () => enabled,
        run: () => {
          useSelectionToolStore.getState().setLassoMode('freehand')
          useEditorSessionStore.getState().setActiveToolId('lasso')
        },
      })
      registry.register({
        id: 'tool.lasso.polygonal',
        title: lassoTitle('polygonal'),
        enabled: () => enabled,
        run: () => {
          useSelectionToolStore.getState().setLassoMode('polygonal')
          useEditorSessionStore.getState().setActiveToolId('lasso')
        },
      })
      registry.register({
        id: 'tool.lasso.magnetic',
        title: lassoTitle('magnetic'),
        enabled: () => enabled,
        run: () => {
          useSelectionToolStore.getState().setLassoMode('magnetic')
          useEditorSessionStore.getState().setActiveToolId('lasso')
        },
      })
      continue
    }

    if (
      toolId === 'pen' ||
      toolId === 'freeformPen' ||
      toolId === 'addAnchor' ||
      toolId === 'deleteAnchor' ||
      toolId === 'convertPoint' ||
      toolId === 'directSelection' ||
      toolId === 'pathSelection'
    ) {
      continue
    }

    if (tool.group) {
      if (registeredGroups.has(tool.group)) {
        registry.register({
          id: tool.commandId,
          title: tool.title,
          enabled: () => enabled,
          run: () => useEditorSessionStore.getState().setActiveToolId(toolId),
        })
        continue
      }

      registeredGroups.add(tool.group)
      registry.register({
        id: tool.commandId,
        title: `Cycle ${tool.title.replace(' Tool', '')} variants`,
        // Blur/Sharpen/Smudge and the Liquify family carry no letter (Photoshop
        // gives them none, and R/Q belong to Rotate View / Quick Mask). Leaving
        // the field undefined keeps `Shift+` out of the palette and the
        // shortcuts window; those groups stay reachable via the flyout.
        shortcut: tool.letter || undefined,
        enabled: () => enabled,
        run: () => cycleGroup(tool.group!, 1),
      })
      registry.register({
        id: `${tool.commandId}.cycleReverse`,
        title: `Cycle ${tool.title.replace(' Tool', '')} variants backwards`,
        shortcut: tool.letter ? `Shift+${tool.letter}` : undefined,
        enabled: () => enabled,
        run: () => cycleGroup(tool.group!, -1),
      })
      continue
    }

    registry.register({
      id: tool.commandId,
      title: tool.title,
      shortcut: tool.letter || undefined,
      enabled: () => enabled,
      run: () => {
        if (!enabled) return
        useEditorSessionStore.getState().setActiveToolId(toolId)
      },
    })
  }
}
