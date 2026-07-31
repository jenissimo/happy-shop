import { createEmptyDocument, type HappyDocument } from '../../../core/document'
import { createTransparentRasterSurface, type RasterSurfaceEntry } from '../../../imaging'
import { clampDimension, resolveBackground, type NewDocumentFormState } from './validation'

/**
 * Pure `NewDocumentFormState` -> `HappyDocument` conversion (SPEC §8
 * factories). No side effects, no assets — a blank canvas. Exposed as one of
 * the integrator-facing callback APIs so a session store can call it
 * directly without importing dialog internals.
 */
export function createDocumentFromDialog(state: NewDocumentFormState): HappyDocument {
  return createEmptyDocument({
    name: state.name.trim() || 'Untitled',
    width: clampDimension(state.width),
    height: clampDimension(state.height),
    background: resolveBackground(state),
  })
}

/**
 * Creates the dialog document together with the transparent bitmap backing its
 * initial raster layer. Callers register `asset` before opening the document.
 */
export async function createDocumentResultFromDialog(
  state: NewDocumentFormState,
): Promise<{ document: HappyDocument; asset: RasterSurfaceEntry }> {
  const document = createDocumentFromDialog(state)
  const layer = document.layers[document.rootChildren[0]!]
  if (!layer || layer.type !== 'raster') {
    throw new Error('new documents require an initial raster layer')
  }
  return {
    document,
    asset: await createTransparentRasterSurface(
      String(layer.pixels),
      document.canvas.width,
      document.canvas.height,
    ),
  }
}
