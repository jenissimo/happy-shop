import { loadGoogleFontFamily } from './catalogIndex'
import type { GoogleFontCatalogEntry } from './catalogTypes'

type PreviewFace = {
  family: string
  face: FontFace
}

const previewFaces = new Map<string, PreviewFace>()
const MAX_PREVIEW_FACES = 48

function previewFamily(entry: GoogleFontCatalogEntry): string {
  return `Happy Shop preview ${entry.id}`
}

function preferredFile(entry: GoogleFontCatalogEntry) {
  return entry.files.find((file) => file.weight === 400 && file.style === 'normal') ?? entry.files[0]
}

function discardOldestPreview(): void {
  const oldest = previewFaces.entries().next().value as [string, PreviewFace] | undefined
  if (!oldest) return
  previewFaces.delete(oldest[0])
  document.fonts?.delete(oldest[1].face)
}

/**
 * Loads a row-only font face. It deliberately never writes to IndexedDB; only
 * `commitGoogleFont()` promotes a face to the deterministic Tier-3 cache.
 */
export async function loadGoogleFontLivePreview(id: string, signal: AbortSignal): Promise<string> {
  const cached = previewFaces.get(id)
  if (cached) {
    // Keep recently visible faces at the end of the tiny session cache.
    previewFaces.delete(id)
    previewFaces.set(id, cached)
    return cached.family
  }

  const entry = await loadGoogleFontFamily(id)
  const file = preferredFile(entry)
  if (!file) throw new Error(`${entry.family} has no previewable face`)

  const response = await fetch(file.url, { signal })
  if (!response.ok) throw new Error(`Live preview unavailable (${response.status})`)
  const bytes = await response.arrayBuffer()
  if (signal.aborted) throw new DOMException('Preview request cancelled', 'AbortError')
  if (typeof document === 'undefined' || !document.fonts) throw new Error('Font loading is unavailable')

  const face = new FontFace(previewFamily(entry), bytes, {
    weight: String(file.weight),
    style: file.style,
  })
  await face.load()
  if (signal.aborted) throw new DOMException('Preview request cancelled', 'AbortError')
  document.fonts.add(face)

  while (previewFaces.size >= MAX_PREVIEW_FACES) discardOldestPreview()
  previewFaces.set(id, { family: previewFamily(entry), face })
  return previewFamily(entry)
}

export function clearGoogleFontLivePreviewsForTests(): void {
  for (const preview of previewFaces.values()) document.fonts?.delete(preview.face)
  previewFaces.clear()
}
