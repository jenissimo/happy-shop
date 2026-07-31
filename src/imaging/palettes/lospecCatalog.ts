import { publicUrl } from '../../lib/publicUrl'
import {
  LospecPaletteIndexEntrySchema,
  LospecPaletteSchema,
  type LospecPalette,
  type LospecPaletteIndexEntry,
} from './lospecTypes'
import { normalizeHexColor } from './normalizeHex'

let indexPromise: Promise<LospecPaletteIndexEntry[]> | undefined
const paletteCache = new Map<string, LospecPalette>()

export async function loadLospecPaletteIndex(): Promise<LospecPaletteIndexEntry[]> {
  indexPromise ??= fetch(publicUrl('/palettes/lospec/index.json'))
    .then(async (response) => {
      if (!response.ok) throw new Error(`Lospec palette catalog unavailable (${response.status})`)
      return LospecPaletteIndexEntrySchema.array().parse(await response.json())
    })
  return indexPromise
}

export async function loadLospecPalette(id: string): Promise<LospecPalette> {
  const cached = paletteCache.get(id)
  if (cached) return cached
  const response = await fetch(publicUrl(`/palettes/lospec/palettes/${encodeURIComponent(id)}.json`))
  if (!response.ok) throw new Error(`Lospec palette "${id}" unavailable (${response.status})`)
  const raw = LospecPaletteSchema.parse(await response.json())
  const palette: LospecPalette = {
    ...raw,
    colors: raw.colors.map((color) => normalizeHexColor(color)),
  }
  paletteCache.set(id, palette)
  return palette
}

export function clearLospecPaletteCacheForTests(): void {
  indexPromise = undefined
  paletteCache.clear()
}
