#!/usr/bin/env bun
/**
 * Human-run rank snapshot refresh. Fetches the public fonts.google.com metadata
 * endpoint (no API key) and writes scripts/google-fonts/rank-snapshot.json.
 *
 * bun scripts/google-fonts/refresh-rank-snapshot.ts
 */
const METADATA_URL = 'https://fonts.google.com/metadata/fonts'
const OUT = 'scripts/google-fonts/rank-snapshot.json'

type RawFamily = {
  family: string
  popularity?: number
  trending?: number
}

export type RankSnapshot = {
  fetchedAt: string
  source: string
  /** 1-based; lower rank = more popular/trending. Keys are catalog ids. */
  popularity: Record<string, number>
  trending: Record<string, number>
}

export function familyToCatalogId(family: string): string {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function buildRankMaps(families: readonly RawFamily[]): Pick<RankSnapshot, 'popularity' | 'trending'> {
  const popularitySorted = [...families]
    .filter((entry) => entry.popularity !== undefined)
    .sort((a, b) => {
      const delta = a.popularity! - b.popularity!
      return delta !== 0 ? delta : a.family.localeCompare(b.family)
    })
  const trendingSorted = [...families]
    .filter((entry) => entry.trending !== undefined)
    .sort((a, b) => {
      const delta = a.trending! - b.trending!
      return delta !== 0 ? delta : a.family.localeCompare(b.family)
    })

  const popularity: Record<string, number> = {}
  for (const [index, entry] of popularitySorted.entries()) {
    const id = familyToCatalogId(entry.family)
    if (popularity[id] === undefined) popularity[id] = index + 1
  }

  const trending: Record<string, number> = {}
  for (const [index, entry] of trendingSorted.entries()) {
    const id = familyToCatalogId(entry.family)
    if (trending[id] === undefined) trending[id] = index + 1
  }

  return { popularity, trending }
}

async function main(): Promise<void> {
  const response = await fetch(METADATA_URL, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Metadata request failed (${response.status}): ${METADATA_URL}`)
  const data = await response.json() as { familyMetadataList?: RawFamily[] }
  const families = data.familyMetadataList ?? []
  if (!families.length) throw new Error('Metadata response has no familyMetadataList entries')

  const snapshot: RankSnapshot = {
    fetchedAt: new Date().toISOString(),
    source: METADATA_URL,
    ...buildRankMaps(families),
  }

  await Bun.write(OUT, `${JSON.stringify(snapshot, null, 2)}\n`)
  console.log(
    `Wrote ${Object.keys(snapshot.popularity).length} popularity and ${Object.keys(snapshot.trending).length} trending ranks to ${OUT}.`,
  )
}

if (import.meta.main) {
  await main()
}
