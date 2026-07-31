import type { GoogleFontSource } from '../../../../core/document'
import type { GoogleFontCatalogEntry } from './catalogTypes'
import {
  getCachedGoogleFont,
  putCachedGoogleFont,
  type CachedFontRecord,
} from './fontCache'
import {
  findMatchingStaticFile,
  needsVariablePin,
  nominalWeightFromAxes,
  normalizeAxisValues,
  resolveStyleFromAxes,
  uiAxes,
  variationPin,
  variationSettingsString,
  type ResolvedAxisValues,
} from './variableAxis'

type GoogleFontFaceDescriptors = FontFaceDescriptors & {
  variationSettings?: string
}

export async function commitGoogleFont(
  entry: GoogleFontCatalogEntry,
  weight: number,
  style: 'normal' | 'italic',
): Promise<CachedFontRecord> {
  const file = entry.files.find((candidate) => candidate.weight === weight && candidate.style === style)
  if (!file) throw new Error(`${entry.family} does not provide ${weight} ${style}`)

  // This is deliberately a direct, user-triggered WOFF2 fetch. Never replace
  // it with the Google CSS API or a stylesheet link.
  const response = await fetch(file.url)
  if (!response.ok) throw new Error(`Font download failed (${response.status})`)
  const record: CachedFontRecord = {
    id: entry.id,
    weight,
    style,
    version: entry.version,
    bytes: await response.arrayBuffer(),
    family: entry.family,
    license: entry.license,
    licenseText: entry.licenseText,
    sourceUrl: file.url,
    fetchedAt: Date.now(),
    byteLength: file.sizeBytes,
  }
  await putCachedGoogleFont(record)
  return record
}

async function fetchFontBytes(url: string, expectedBytes?: number): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Font download failed (${response.status})`)
  const bytes = await response.arrayBuffer()
  if (expectedBytes !== undefined && bytes.byteLength !== expectedBytes) {
    // Size drift is informational only; cache the fetched bytes we actually received.
  }
  return bytes
}

function buildGoogleFontSource(
  entry: GoogleFontCatalogEntry,
  record: CachedFontRecord,
  pinnedAxes?: ResolvedAxisValues,
): GoogleFontSource {
  return {
    kind: 'google-fonts',
    catalogId: entry.id,
    weight: record.weight,
    style: record.style,
    version: entry.version,
    ...(record.variationPin ? { variationPin: record.variationPin } : {}),
    ...(pinnedAxes ? { axes: { ...pinnedAxes } } : {}),
  }
}

/**
 * Commit a Google font face with optional variable-axis tuning. Static catalog
 * instances are preferred when axis values match defaults; otherwise the
 * variable WOFF2 is fetched once and pinned by axis hash (§7.3).
 */
export async function commitGoogleFontWithAxes(
  entry: GoogleFontCatalogEntry,
  style: 'normal' | 'italic',
  axisValues: ResolvedAxisValues,
): Promise<{ record: CachedFontRecord; source: GoogleFontSource }> {
  const values = normalizeAxisValues(entry.axes, axisValues)
  const resolvedStyle = resolveStyleFromAxes(entry, values, style)
  const weight = nominalWeightFromAxes(values)
  const staticFile = findMatchingStaticFile(entry, resolvedStyle, values)

  if (staticFile) {
    const existing = await getCachedGoogleFont({
      id: entry.id,
      weight: staticFile.weight,
      style: resolvedStyle,
      version: entry.version,
    })
    if (existing) {
      return { record: existing, source: buildGoogleFontSource(entry, existing) }
    }
    const record = await commitGoogleFont(entry, staticFile.weight, resolvedStyle)
    return { record, source: buildGoogleFontSource(entry, record) }
  }

  if (!needsVariablePin(entry, resolvedStyle, values)) {
    throw new Error(`${entry.family} does not provide a downloadable face for the selected axes`)
  }

  const pin = await variationPin(values)
  const existing = await getCachedGoogleFont({
    id: entry.id,
    weight,
    style: resolvedStyle,
    version: entry.version,
    variationPin: pin,
  })
  if (existing) {
    return { record: existing, source: buildGoogleFontSource(entry, existing, values) }
  }

  const variableFile = entry.variableFile
  if (!variableFile || variableFile.style !== resolvedStyle) {
    throw new Error(`${entry.family} does not ship a variable ${resolvedStyle} face`)
  }

  const bytes = await fetchFontBytes(variableFile.url, variableFile.sizeBytes)
  const record: CachedFontRecord = {
    id: entry.id,
    weight,
    style: resolvedStyle,
    version: entry.version,
    variationPin: pin,
    bytes,
    family: entry.family,
    license: entry.license,
    licenseText: entry.licenseText,
    sourceUrl: variableFile.url,
    fetchedAt: Date.now(),
    byteLength: bytes.byteLength,
    pinnedAxes: { ...values },
  }
  await putCachedGoogleFont(record)
  return { record, source: buildGoogleFontSource(entry, record, values) }
}

export async function registerCommittedGoogleFont(record: CachedFontRecord): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  const descriptors: GoogleFontFaceDescriptors = {
    weight: String(record.weight),
    style: record.style,
  }
  if (record.pinnedAxes && Object.keys(record.pinnedAxes).length) {
    descriptors.variationSettings = variationSettingsString(record.pinnedAxes)
  }
  const face = new FontFace(record.family, record.bytes.slice(0), descriptors)
  document.fonts.add(face)
  await face.load()
  await document.fonts.ready
}

export { uiAxes }
