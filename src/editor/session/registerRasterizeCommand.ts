/**
 * Shared `layer.rasterize` — text (SPECS/TEXT-TOOL.md) + shape (UX M4.5).
 * Registered last so it overwrites menu stubs / per-tool partial handlers.
 */

import type { CommandRegistry } from '../../core/commands/registry'
import { useEditorSessionStore } from './EditorSessionStore'
import { rasterizeShapeLayer } from '../tools/shape/shapeCommands'
import { rasterizeTextLayer } from '../tools/text/textCommands'
import { reportGoogleFontBakeBlock } from '../tools/text/googleFonts/reportGoogleFontBakeBlock'

export function registerRasterizeCommand(registry: CommandRegistry): void {
  registry.register({
    id: 'layer.rasterize',
    title: 'Rasterize Layer',
    enabled: () => {
      const { selectedLayerIds, document } = useEditorSessionStore.getState()
      if (selectedLayerIds.length !== 1) return false
      const layer = document.layers[selectedLayerIds[0]!]
      return layer?.type === 'text' || layer?.type === 'shape'
    },
    run: async () => {
      const id = useEditorSessionStore.getState().selectedLayerIds[0]
      if (!id) return
      const layer = useEditorSessionStore.getState().document.layers[id]
      if (layer?.type === 'shape') {
        await rasterizeShapeLayer(id)
        return
      }
      if (layer?.type === 'text') {
        try {
          await rasterizeTextLayer(id)
        } catch (error) {
          if (reportGoogleFontBakeBlock(error, id, async () => { await rasterizeTextLayer(id) })) return
          throw error
        }
      }
    },
  })
}
