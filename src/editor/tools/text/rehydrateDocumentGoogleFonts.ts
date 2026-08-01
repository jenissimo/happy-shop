import { flattenPaintOrder, type HappyDocument, type TextLayer } from '../../../core/document'
import { ensureTextFontLoaded } from './textRasterize'

function googleFontLayers(document: HappyDocument): TextLayer[] {
  return flattenPaintOrder(document).filter(
    (layer): layer is TextLayer =>
      layer.type === 'text' && (
        layer.fontSource?.kind === 'google-fonts'
        || layer.runs.some((run) => run.fontSource?.kind === 'google-fonts')
      ),
  )
}

/**
 * Re-register cached Google Font faces for the live viewport after open/reload.
 * Failures are ignored — bake/export still hard-gate via `ensureTextFontLoaded`.
 */
export async function rehydrateDocumentGoogleFonts(document: HappyDocument): Promise<void> {
  const layers = googleFontLayers(document)
  if (layers.length === 0) return
  await Promise.all(layers.map(async (layer) => {
    try {
      await ensureTextFontLoaded(layer)
      for (const run of layer.runs) {
        if (run.fontSource?.kind !== 'google-fonts') continue
        if (
          run.fontSource.catalogId === layer.fontSource?.catalogId
          && run.fontSource.weight === layer.fontSource?.weight
          && run.fontSource.style === layer.fontSource?.style
          && run.fontSource.version === layer.fontSource?.version
          && run.fontSource.variationPin === layer.fontSource?.variationPin
        ) {
          continue
        }
        await ensureTextFontLoaded({
          ...layer,
          fontFamily: run.fontFamily,
          fontSource: run.fontSource,
          fontWeight: run.fontWeight,
          italic: run.italic,
        })
      }
    } catch {
      // Viewport may fall back until the user re-downloads; do not block open.
    }
  }))
}
