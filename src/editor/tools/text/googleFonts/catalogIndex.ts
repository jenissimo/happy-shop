import { publicUrl } from '../../../../lib/publicUrl'
import {
  GoogleFontCatalogEntrySchema,
  GoogleFontIndexEntrySchema,
  type GoogleFontCatalogEntry,
  type GoogleFontIndexEntry,
} from './catalogTypes'

let indexPromise: Promise<GoogleFontIndexEntry[]> | undefined
let downloadablePromise: Promise<ReadonlySet<string>> | undefined
const familyCache = new Map<string, GoogleFontCatalogEntry>()

export async function loadGoogleFontIndex(): Promise<GoogleFontIndexEntry[]> {
  indexPromise ??= fetch(publicUrl('/google-fonts/index.json'))
    .then(async (response) => {
      if (!response.ok) throw new Error(`Google Fonts catalog unavailable (${response.status})`)
      return GoogleFontIndexEntrySchema.array().parse(await response.json())
    })
  return indexPromise
}

/** Ids that ship a reviewed downloadable `families/{id}.json` manifest. */
export async function loadDownloadableGoogleFontIds(): Promise<ReadonlySet<string>> {
  downloadablePromise ??= fetch(publicUrl('/google-fonts/downloadable.json'))
    .then(async (response) => {
      if (!response.ok) throw new Error(`Google Fonts downloadable list unavailable (${response.status})`)
      const ids = await response.json() as unknown
      if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === 'string')) {
        throw new Error('Google Fonts downloadable list is malformed')
      }
      return new Set(ids)
    })
  return downloadablePromise
}

export async function loadGoogleFontFamily(id: string): Promise<GoogleFontCatalogEntry> {
  const cached = familyCache.get(id)
  if (cached) return cached
  const response = await fetch(publicUrl(`/google-fonts/families/${encodeURIComponent(id)}.json`))
  if (!response.ok) throw new Error(`Google Fonts family "${id}" unavailable (${response.status})`)
  const family = GoogleFontCatalogEntrySchema.parse(await response.json())
  familyCache.set(id, family)
  return family
}

export function clearGoogleFontCatalogCacheForTests(): void {
  indexPromise = undefined
  downloadablePromise = undefined
  familyCache.clear()
}
