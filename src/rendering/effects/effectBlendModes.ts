import type { LayerEffect } from '../../core/document'
import type { RenderLayerEffect } from '../contracts/RenderDocumentView'

/** Human-readable blend summary for Effects panel / inspector hints. */
export function effectBlendSummary(effect: LayerEffect | RenderLayerEffect): string | null {
  switch (effect.type) {
    case 'bevel-emboss': {
      const parts = [effect.highlightMode, effect.shadowMode].filter(
        (mode, index, list) => list.indexOf(mode) === index,
      )
      return parts.join(' / ')
    }
    case 'chroma-key':
      return null
    case 'gaussian-blur':
    case 'sharpen':
    case 'noise':
    case 'adjustment':
      return null
    default:
      return effect.blendMode
  }
}

/** Blend modes an effect contributes on the GPU compositing path. */
export function effectGpuBlendModes(effect: RenderLayerEffect): string[] {
  switch (effect.type) {
    case 'bevel-emboss':
      return [effect.highlightMode, effect.shadowMode]
    case 'chroma-key':
      return []
    case 'gaussian-blur':
    case 'sharpen':
    case 'noise':
    case 'adjustment':
      return []
    default:
      return [effect.blendMode]
  }
}
