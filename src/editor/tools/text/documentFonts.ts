import type { GoogleFontSource, HappyDocument, TextRun } from '../../../core/document'
import { flattenPaintOrder } from '../../../core/document/query'
import { publicUrl } from '../../../lib/publicUrl'
import { bundledFontAttribution } from './bundledFontMeta'
import { BUNDLED_FONTS } from './fontCatalog'
import { loadGoogleFontFamily, loadGoogleFontIndex } from './googleFonts/catalogIndex'
import type { GoogleFontLicense } from './googleFonts/catalogTypes'
import { getCachedGoogleFont } from './googleFonts/fontCache'
import { normalizedTextRuns } from './textRuns'

export type DocumentFontSourceKind = 'bundled' | 'google-fonts' | 'system'

export type DocumentFontUsage = {
  key: string
  displayName: string
  fontFamily: string
  sourceKind: DocumentFontSourceKind
  catalogId?: string
  weight?: number
  style?: GoogleFontSource['style']
  version?: string
  /** Text layers that reference this face (at least one run each). */
  layerCount: number
}

export type DocumentFontAttribution = DocumentFontUsage & {
  license?: GoogleFontLicense
  licenseUrl?: string
  licenseText?: string
  designer?: string
  provenance?: string
  cached?: boolean
}

function primaryFamilyName(fontFamily: string): string {
  const primary = fontFamily.split(',')[0]?.trim() ?? fontFamily
  return primary.replace(/^"|"$/g, '')
}

function isBundledFontFamily(fontFamily: string): boolean {
  return BUNDLED_FONTS.some((font) => font.family === fontFamily)
}

function bundledDisplayName(fontFamily: string): string | undefined {
  return BUNDLED_FONTS.find((font) => font.family === fontFamily)?.label
}

function usageFromRun(run: TextRun): Omit<DocumentFontUsage, 'layerCount'> {
  if (run.fontSource?.kind === 'google-fonts') {
    const source = run.fontSource
    return {
      key: `google:${source.catalogId}:${source.weight}:${source.style}:${source.version}`,
      displayName: primaryFamilyName(run.fontFamily),
      fontFamily: run.fontFamily,
      sourceKind: 'google-fonts',
      catalogId: source.catalogId,
      weight: source.weight,
      style: source.style,
      version: source.version,
    }
  }
  if (isBundledFontFamily(run.fontFamily)) {
    return {
      key: `bundled:${run.fontFamily}`,
      displayName: bundledDisplayName(run.fontFamily) ?? primaryFamilyName(run.fontFamily),
      fontFamily: run.fontFamily,
      sourceKind: 'bundled',
    }
  }
  return {
    key: `system:${run.fontFamily}`,
    displayName: primaryFamilyName(run.fontFamily),
    fontFamily: run.fontFamily,
    sourceKind: 'system',
  }
}

/** Collect unique font faces referenced by text layers (including mixed runs). */
export function collectDocumentFontUsages(doc: HappyDocument): DocumentFontUsage[] {
  const byKey = new Map<string, DocumentFontUsage>()

  for (const layer of flattenPaintOrder(doc)) {
    if (layer.type !== 'text') continue
    const seenInLayer = new Set<string>()
    for (const run of normalizedTextRuns(layer)) {
      const usage = usageFromRun(run)
      if (seenInLayer.has(usage.key)) continue
      seenInLayer.add(usage.key)
      const existing = byKey.get(usage.key)
      if (existing) existing.layerCount += 1
      else byKey.set(usage.key, { ...usage, layerCount: 1 })
    }
  }

  return [...byKey.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
  )
}

/** First non-empty line of an OFL/Apache license file, trimmed for designer credit. */
export function extractDesignerCredit(licenseText: string): string | undefined {
  const firstLine = licenseText.split('\n').find((line) => line.trim())?.trim()
  if (!firstLine) return undefined
  const match = firstLine.match(/^Copyright(?:\s+\d{4}(?:[-–]\d{4})?)?\s+(.+?)(?:\s+\(|$)/i)
  if (match?.[1]) return match[1].trim()
  if (firstLine.length <= 120) return firstLine
  return undefined
}

async function loadBundledLicenseText(path: string): Promise<string | undefined> {
  if (typeof fetch === 'undefined') return undefined
  try {
    const response = await fetch(publicUrl(path))
    if (!response.ok) return undefined
    return await response.text()
  } catch {
    return undefined
  }
}

async function resolveGoogleFontAttribution(
  usage: DocumentFontUsage,
  indexById: Map<string, Awaited<ReturnType<typeof loadGoogleFontIndex>>[number]>,
): Promise<DocumentFontAttribution> {
  const catalogId = usage.catalogId
  if (!catalogId) return { ...usage, provenance: 'Google Fonts' }

  const indexEntry = indexById.get(catalogId)
  const cacheKey =
    usage.weight != null && usage.style && usage.version
      ? {
          id: catalogId,
          weight: usage.weight,
          style: usage.style,
          version: usage.version,
        }
      : undefined
  const cached = cacheKey ? await getCachedGoogleFont(cacheKey) : undefined

  let license = cached?.license ?? indexEntry?.license
  let licenseUrl = indexEntry?.licenseUrl
  let licenseText = cached?.licenseText

  if (!licenseText) {
    try {
      const family = await loadGoogleFontFamily(catalogId)
      license = family.license
      licenseUrl = family.licenseUrl
      licenseText = family.licenseText
    } catch {
      // Metadata-only families may not ship a downloadable manifest yet.
    }
  }

  const provenance = indexEntry
    ? `google/fonts @ ${indexEntry.provenance.ref.slice(0, 7)} (${indexEntry.provenance.directory}/)`
    : 'Google Fonts'

  return {
    ...usage,
    license,
    licenseUrl,
    licenseText,
    designer: licenseText ? extractDesignerCredit(licenseText) : undefined,
    provenance,
    cached: Boolean(cached),
  }
}

/** Enrich collected usages with license/provenance when metadata is available. */
export async function resolveDocumentFontAttributions(
  usages: readonly DocumentFontUsage[],
): Promise<DocumentFontAttribution[]> {
  const index = await loadGoogleFontIndex().catch(() => [])
  const indexById = new Map(index.map((entry) => [entry.id, entry]))

  return Promise.all(
    usages.map(async (usage) => {
      if (usage.sourceKind === 'bundled') {
        const meta = bundledFontAttribution(usage.fontFamily)
        const licenseText = meta ? await loadBundledLicenseText(meta.licensePath) : undefined
        return {
          ...usage,
          displayName: meta?.displayName ?? usage.displayName,
          license: meta?.license,
          licenseUrl: meta ? publicUrl(meta.licensePath) : undefined,
          licenseText,
          designer: meta?.designer ?? (licenseText ? extractDesignerCredit(licenseText) : undefined),
          provenance: 'Bundled with Happy Shop',
        }
      }
      if (usage.sourceKind === 'google-fonts') {
        return resolveGoogleFontAttribution(usage, indexById)
      }
      return {
        ...usage,
        provenance: 'System font (installed on this device)',
      }
    }),
  )
}
