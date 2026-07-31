import type { HappyDocument } from '../../core/document'
import { ChromaFloodMaskCache } from '../../imaging/ChromaFloodMaskCache'
import type { RenderDocumentView } from '../../rendering/contracts/RenderDocumentView'
import {
  toRenderDocumentView,
  type RenderAssetLookup,
} from './toRenderDocumentView'

/**
 * DocumentStore metadata → RenderDocumentView for Pixi (SPEC §6 / §10).
 * Effect/blend params on the view are consumed by PixiRenderBackend filters.
 */
export class RenderCoordinator {
  private readonly floodMasks = new ChromaFloodMaskCache()

  constructor(private readonly assets?: RenderAssetLookup) {}

  buildView(doc: HappyDocument): RenderDocumentView {
    return toRenderDocumentView(doc, this.assets, (surface, effect) =>
      this.floodMasks.getOrRequest(surface.bitmap, surface.width, surface.height, effect),
    )
  }

  onFloodMaskReady(listener: () => void): () => void {
    return this.floodMasks.subscribe(listener)
  }
}

const defaultCoordinator = new RenderCoordinator()

export function getRenderCoordinator(): RenderCoordinator {
  return defaultCoordinator
}
