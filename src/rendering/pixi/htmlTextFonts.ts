import { Cache, FontStylePromiseCache } from 'pixi.js'

/**
 * Web fonts for `HTMLText`.
 *
 * Pixi rasterizes HTMLText by serializing the markup into an SVG and decoding
 * it as an `<img>`. That image is an isolated document: it cannot reach the
 * page's `@font-face` rules or anything added to `document.fonts`, so a web
 * font renders as the SVG's default face no matter how well it is loaded in the
 * app. The only faces it can use are the ones Pixi inlines as base64
 * `@font-face` rules, and Pixi inlines exactly the families it finds in `Cache`
 * under `<family>-and-url` (normally populated by `Assets.load` of a font URL).
 *
 * So every non-system face has to be handed over here as a blob URL. System
 * fonts need none of this — they are installed, and the SVG can use them.
 */

export type HtmlTextFontFace = {
  /** CSS `font-weight`; a range like `100 900` is valid for variable faces. */
  weight: string
  style: 'normal' | 'italic'
}

type RegisteredFamily = {
  urls: string[]
  faces: Set<string>
}

const registered = new Map<string, RegisteredFamily>()
let version = 0

/**
 * Bumped on every registration. `PixiRenderBackend` folds it into its text
 * source key so already-rasterized layers pick up a face that arrived late.
 */
export function htmlTextFontsVersion(): number {
  return version
}

/** First family of a CSS stack, unquoted: `"Source Serif 4", Georgia` → `Source Serif 4`. */
export function primaryFontFamily(fontFamily: string): string {
  const primary = fontFamily.split(',')[0]?.trim() ?? fontFamily
  return primary.replace(/^["']|["']$/g, '').trim()
}

/**
 * The family name to emit in HTMLText CSS, or `undefined` when the family has
 * no registered face. Registered faces drop their fallback stack on purpose:
 * Pixi keys its inlined `@font-face` on the whole `font-family` string, so a
 * stack would never match the rule it generates.
 */
export function htmlTextFontFamily(fontFamily: string): string | undefined {
  const family = primaryFontFamily(fontFamily)
  return registered.has(family) ? family : undefined
}

export function registerHtmlTextFont(
  fontFamily: string,
  bytes: ArrayBuffer,
  faces: readonly HtmlTextFontFace[],
  mimeType = 'font/woff2',
): void {
  if (typeof URL === 'undefined' || typeof Blob === 'undefined') return
  const family = primaryFontFamily(fontFamily)
  if (!family) return
  const entry = registered.get(family) ?? { urls: [], faces: new Set<string>() }
  const fresh = faces.filter((face) => !entry.faces.has(`${face.weight}/${face.style}`))
  if (!fresh.length && entry.urls.length) return

  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }))
  entry.urls.push(url)
  for (const face of fresh) entry.faces.add(`${face.weight}/${face.style}`)
  registered.set(family, entry)

  const cacheKey = `${family}-and-url`
  const cacheEntry = { url, faces: fresh.map((face) => ({ ...face })) }
  if (Cache.has(cacheKey)) {
    const cached = Cache.get<{ entries: unknown[] }>(cacheKey)
    cached.entries.push(cacheEntry)
  } else {
    Cache.set(cacheKey, { entries: [cacheEntry] })
  }
  // Pixi memoizes the generated `@font-face` CSS per family, forever.
  FontStylePromiseCache.delete(family)
  version += 1
}

export function resetHtmlTextFontsForTests(): void {
  for (const entry of registered.values()) {
    for (const url of entry.urls) URL.revokeObjectURL(url)
  }
  for (const family of registered.keys()) {
    Cache.remove(`${family}-and-url`)
    FontStylePromiseCache.delete(family)
  }
  registered.clear()
  version = 0
}
