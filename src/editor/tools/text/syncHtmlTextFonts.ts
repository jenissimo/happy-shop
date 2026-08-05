import {
  flattenPaintOrder,
  type GoogleFontSource,
  type HappyDocument,
  type TextLayer,
} from '../../../core/document'
import { publicUrl } from '../../../lib/publicUrl'
import {
  registerHtmlTextFont,
  type HtmlTextFontFace,
} from '../../../rendering/pixi/htmlTextFonts'
import { getCachedGoogleFont } from './googleFonts/fontCache'

/**
 * Self-hosted faces from `src/styles/fonts.css`. The stylesheet covers the DOM
 * (editor overlay, panels, Canvas2D measurement); the viewport needs the bytes
 * themselves — see `rendering/pixi/htmlTextFonts`.
 */
const BUNDLED_FONT_FILES: Readonly<
  Record<string, { path: string; face: HtmlTextFontFace }>
> = {
  'Inter, sans-serif': {
    path: 'fonts/inter/inter-latin-wght-normal.woff2',
    face: { weight: '100 900', style: 'normal' },
  },
  '"Source Serif 4", Georgia, serif': {
    path: 'fonts/source-serif-4/source-serif-4-latin-wght-normal.woff2',
    face: { weight: '200 900', style: 'normal' },
  },
}

type FaceUse = {
  fontFamily: string
  fontSource?: GoogleFontSource
  fontWeight: number
  italic: boolean
}

/** Every distinct face a document's text layers reference, layer + run level. */
function documentFaces(document: HappyDocument): FaceUse[] {
  const seen = new Set<string>()
  const uses: FaceUse[] = []
  const add = (use: FaceUse) => {
    const source = use.fontSource
    const key = source
      ? `g:${source.catalogId}:${source.weight}:${source.style}:${source.version}:${source.variationPin ?? ''}`
      : `f:${use.fontFamily}:${use.fontWeight}:${use.italic}`
    if (seen.has(key)) return
    seen.add(key)
    uses.push(use)
  }
  for (const layer of flattenPaintOrder(document)) {
    if (layer.type !== 'text') continue
    const text = layer as TextLayer
    add({
      fontFamily: text.fontFamily,
      fontSource: text.fontSource,
      fontWeight: text.fontWeight,
      italic: text.italic,
    })
    for (const run of text.runs) {
      add({
        fontFamily: run.fontFamily,
        fontSource: run.fontSource,
        fontWeight: run.fontWeight,
        italic: run.italic,
      })
    }
  }
  return uses
}

const processed = new Set<string>()

async function registerFace(use: FaceUse): Promise<boolean> {
  if (use.fontSource?.kind === 'google-fonts') {
    const source = use.fontSource
    const cached = await getCachedGoogleFont({
      id: source.catalogId,
      weight: source.weight,
      style: source.style,
      version: source.version,
      variationPin: source.variationPin,
    })
    // Not downloaded (yet): `googleFontRecovery` owns re-fetching it.
    if (!cached) return false
    registerHtmlTextFont(cached.family, cached.bytes, [
      { weight: String(cached.weight), style: cached.style },
    ])
    return true
  }

  const bundled = BUNDLED_FONT_FILES[use.fontFamily]
  if (!bundled) return false
  const response = await fetch(publicUrl(`/${bundled.path}`))
  if (!response.ok) return false
  registerHtmlTextFont(use.fontFamily, await response.arrayBuffer(), [bundled.face])
  return true
}

/**
 * Hand every web font the document uses to the viewport renderer. Resolves to
 * true when something new was registered, so the caller can force a re-render
 * of text layers that were already rasterized with a fallback face.
 */
export async function syncHtmlTextFonts(
  document: HappyDocument,
): Promise<boolean> {
  let registeredAny = false
  for (const use of documentFaces(document)) {
    const key = use.fontSource
      ? `g:${use.fontSource.catalogId}:${use.fontSource.weight}:${use.fontSource.style}:${use.fontSource.version}:${use.fontSource.variationPin ?? ''}`
      : `f:${use.fontFamily}`
    if (processed.has(key)) continue
    processed.add(key)
    try {
      if (await registerFace(use)) registeredAny = true
    } catch {
      // A missing face only costs fidelity in the viewport; bake and export
      // hard-gate on `ensureTextFontLoaded` instead.
      processed.delete(key)
    }
  }
  return registeredAny
}

export function resetHtmlTextFontSyncForTests(): void {
  processed.clear()
}
