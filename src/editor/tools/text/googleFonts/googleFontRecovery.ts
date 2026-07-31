import type { TextLayer } from '../../../../core/document'
import type { FontResolution } from '../textRasterize'
import { loadGoogleFontFamily } from './catalogIndex'
import { getCachedGoogleFont } from './fontCache'
import { commitGoogleFont, registerCommittedGoogleFont } from './googleFontDownload'
import { isBrowserOnline } from './googleFontConnectivity'

async function registerCachedGoogleFontLayer(layer: TextLayer): Promise<FontResolution | undefined> {
  if (layer.fontSource?.kind !== 'google-fonts') return { ok: true }
  const source = layer.fontSource
  const cached = await getCachedGoogleFont({
    id: source.catalogId,
    weight: source.weight,
    style: source.style,
    version: source.version,
  })
  if (!cached) return undefined
  await registerCommittedGoogleFont(cached)
  return { ok: true }
}

/**
 * Explicit recovery path for bake/export Retry — may download when online.
 * Normal bake gates call `ensureTextFontLoaded`, which stays cache-only.
 */
export async function recoverGoogleFontForLayer(layer: TextLayer): Promise<FontResolution> {
  if (layer.fontSource?.kind !== 'google-fonts') return { ok: true }

  const cached = await registerCachedGoogleFontLayer(layer)
  if (cached) return cached

  const source = layer.fontSource
  if (!isBrowserOnline()) {
    return {
      ok: false,
      reason: 'offline-and-uncached',
      catalogId: source.catalogId,
      family: layer.fontFamily,
    }
  }

  try {
    const entry = await loadGoogleFontFamily(source.catalogId)
    const record = await commitGoogleFont(entry, source.weight, source.style)
    await registerCommittedGoogleFont(record)
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      reason: 'network-error',
      catalogId: source.catalogId,
      family: layer.fontFamily,
      detail: error instanceof Error ? error.message : 'Font download failed',
    }
  }
}
