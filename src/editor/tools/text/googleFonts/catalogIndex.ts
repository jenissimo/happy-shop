import { publicUrl } from '../../../../lib/publicUrl'
import {
  GoogleFontCatalogEntrySchema,
  GoogleFontIndexEntrySchema,
  type GoogleFontCatalogEntry,
  type GoogleFontIndexEntry,
} from './catalogTypes'

let indexPromise: Promise<GoogleFontIndexEntry[]> | undefined
const familyCache = new Map<string, GoogleFontCatalogEntry>()

export async function loadGoogleFontIndex(): Promise<GoogleFontIndexEntry[]> {
  indexPromise ??= fetch(publicUrl('/google-fonts/index.json'))
    .then(async (response) => {
      if (!response.ok) throw new Error(`Google Fonts catalog unavailable (${response.status})`)
      return GoogleFontIndexEntrySchema.array().parse(await response.json())
    })
  return indexPromise
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
  familyCache.clear()
}
