#!/usr/bin/env bun
/**
 * Human-run catalog vendoring. It is intentionally not a build/CI dependency:
 * runtime only reads checked-in assets from public/google-fonts.
 *
 * bun scripts/google-fonts/build-index.ts --github
 * bun scripts/google-fonts/build-index.ts --github --api-key "$GOOGLE_FONTS_API_KEY"
 * bun scripts/google-fonts/build-index.ts --apply-ranks
 * bun scripts/google-fonts/build-index.ts --curated
 *
 * Rank metadata comes from the committed rank-snapshot.json (keyless fonts.google.com
 * metadata). Refresh the snapshot with `bun scripts/google-fonts/refresh-rank-snapshot.ts`.
 *
 * Before publishing a full refresh, enrich each family with the authoritative
 * license text from a sparse google/fonts checkout (ofl/, apache/, ufl/) and
 * review the generated NOTICE. Do not use fonts.googleapis.com CSS.
 */
type ApiFamily = {
  family: string
  category: string
  subsets: string[]
  version: string
  variants: string[]
  files: Record<string, string>
}

type CuratedFamily = {
  id: string
  family: string
  category: 'serif' | 'sans-serif' | 'display' | 'handwriting' | 'monospace'
  subsets: string[]
  variable: boolean
  axes?: Array<{ tag: string; min: number; max: number; default: number }>
  files: Array<{ style: 'normal' | 'italic'; weight: number; url: string; sizeBytes: number }>
  variableFile?: { style: 'normal' | 'italic'; url: string; sizeBytes: number }
  license: 'OFL-1.1' | 'Apache-2.0'
  licenseUrl: string
  licenseText: string
  version: string
}

type MetadataIndexEntry = {
  id: string
  family: string
  category: CuratedFamily['category']
  subsets: string[]
  variable: boolean
  license: CuratedFamily['license'] | 'UFL-1.0'
  licenseUrl: string
  /** Immutable source reference for metadata-only entries; no font bytes are shipped. */
  provenance: {
    source: 'google/fonts'
    ref: string
    directory: 'ofl' | 'apache' | 'ufl'
  }
  version: string
  /** Best-effort 1-based rank from Developer API sort=popularity at vendoring time. */
  popularityRank?: number
  /** Best-effort 1-based rank from Developer API sort=trending at vendoring time. */
  trendingRank?: number
}

type GitTreeEntry = {
  path: string
  type: 'blob' | 'tree'
}

type GitTree = {
  sha: string
  tree: GitTreeEntry[]
  truncated: boolean
}

const SCRIPT_SHARDS = [
  'latin', 'cyrillic', 'greek', 'arabic', 'hebrew', 'devanagari', 'thai',
  'japanese', 'korean', 'chinese-simplified', 'chinese-traditional',
] as const

const args = Object.fromEntries(process.argv.slice(2).reduce<string[][]>((pairs, value, index, all) => {
  if (index % 2 === 0) pairs.push([value.replace(/^--/, ''), all[index + 1] ?? ''])
  return pairs
}, []))
const out = 'public/google-fonts'
const RANK_SNAPSHOT = 'scripts/google-fonts/rank-snapshot.json'
const GOOGLE_FONTS_API = 'https://api.github.com/repos/google/fonts/git/trees'
const LICENSES = {
  ofl: 'OFL-1.1',
  apache: 'Apache-2.0',
  ufl: 'UFL-1.0',
} as const

function asCategory(value: string): CuratedFamily['category'] {
  const normalized = value.toLowerCase().replace(/_/g, '-')
  return normalized === 'sans-serif' || normalized === 'serif' || normalized === 'display' ||
    normalized === 'handwriting' || normalized === 'monospace'
    ? normalized
    : 'sans-serif'
}

function quotedValues(metadata: string, field: string): string[] {
  return [...metadata.matchAll(new RegExp(`^${field}:\\s*"([^"]+)"\\s*$`, 'gm'))]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value))
}

function firstQuotedValue(metadata: string, field: string): string | undefined {
  return quotedValues(metadata, field)[0]
}

function isVariableMetadata(metadata: string): boolean {
  return /axes\s*\{|axes\s*:|filename:\s*"[^"]*(?:\[|Variable)/i.test(metadata)
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`)
  return response.json() as Promise<T>
}

async function mapConcurrent<T, U>(items: readonly T[], limit: number, mapper: (item: T) => Promise<U>): Promise<U[]> {
  const results: U[] = []
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await mapper(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function familyToCatalogId(family: string): string {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

type RankSnapshot = {
  fetchedAt: string
  source: string
  popularity: Record<string, number>
  trending: Record<string, number>
}

async function loadRankSnapshot(): Promise<RankSnapshot | null> {
  const file = Bun.file(RANK_SNAPSHOT)
  if (!(await file.exists())) return null
  return JSON.parse(await file.text()) as RankSnapshot
}

function rankMapsFromSnapshot(snapshot: RankSnapshot): { popularity: Map<string, number>; trending: Map<string, number> } {
  return {
    popularity: new Map(Object.entries(snapshot.popularity)),
    trending: new Map(Object.entries(snapshot.trending)),
  }
}

function applyRankMaps(
  index: MetadataIndexEntry[],
  popularity: Map<string, number>,
  trending: Map<string, number>,
  label: string,
): MetadataIndexEntry[] {
  let popularityMatches = 0
  let trendingMatches = 0
  const enriched = index.map((entry) => {
    const popularityRank = popularity.get(entry.id) ?? popularity.get(familyToCatalogId(entry.family))
    const trendingRank = trending.get(entry.id) ?? trending.get(familyToCatalogId(entry.family))
    if (popularityRank !== undefined) popularityMatches++
    if (trendingRank !== undefined) trendingMatches++
    return {
      ...entry,
      ...(popularityRank !== undefined ? { popularityRank } : {}),
      ...(trendingRank !== undefined ? { trendingRank } : {}),
    }
  })
  console.log(
    `Rank enrichment (${label}): ${popularityMatches}/${index.length} popularity, ${trendingMatches}/${index.length} trending.`,
  )
  return enriched
}

async function enrichRankFromSnapshot(index: MetadataIndexEntry[]): Promise<MetadataIndexEntry[]> {
  const snapshot = await loadRankSnapshot()
  if (!snapshot) {
    console.log('Rank enrichment: no rank-snapshot.json; skipping (index will fall back to A–Z sort).')
    return index
  }
  const maps = rankMapsFromSnapshot(snapshot)
  return applyRankMaps(index, maps.popularity, maps.trending, `snapshot ${snapshot.fetchedAt.slice(0, 10)}`)
}

async function fetchDeveloperApiRankMap(
  apiKey: string,
  sort: 'popularity' | 'trending',
): Promise<Map<string, number>> {
  const url = `https://www.googleapis.com/webfonts/v1/webfonts?key=${encodeURIComponent(apiKey)}&sort=${sort}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Developer API ${sort} request failed (${response.status}): ${url}`)
  }
  const data = await response.json() as { items?: Array<{ family: string }> }
  const ranks = new Map<string, number>()
  for (const [index, item] of (data.items ?? []).entries()) {
    const id = familyToCatalogId(item.family)
    if (!ranks.has(id)) ranks.set(id, index + 1)
  }
  return ranks
}

async function enrichRankFromDeveloperApi(index: MetadataIndexEntry[], apiKey: string): Promise<MetadataIndexEntry[]> {
  const [popularity, trending] = await Promise.all([
    fetchDeveloperApiRankMap(apiKey, 'popularity'),
    fetchDeveloperApiRankMap(apiKey, 'trending'),
  ])
  return applyRankMaps(index, popularity, trending, 'Developer API')
}

async function buildGithubIndex(): Promise<MetadataIndexEntry[]> {
  const root = await fetchJson<GitTree>(`${GOOGLE_FONTS_API}/main`)
  const rawAtCommit = `https://raw.githubusercontent.com/google/fonts/${root.sha}`
  const folders = (Object.keys(LICENSES) as Array<keyof typeof LICENSES>).map((directory) => {
    const tree = root.tree.find((entry) => entry.path === directory && entry.type === 'tree')
    if (!tree) throw new Error(`google/fonts root has no ${directory}/ tree`)
    return { directory, tree }
  })

  const entries = await Promise.all(folders.map(async ({ directory, tree }) => {
    const listing = await fetchJson<GitTree>(`${GOOGLE_FONTS_API}/${tree.sha}?recursive=1`)
    if (listing.truncated) throw new Error(`google/fonts ${directory}/ tree response was truncated`)
    return mapConcurrent(
      listing.tree.filter((entry) => entry.type === 'blob' && entry.path.endsWith('/METADATA.pb')),
      12,
      async (entry) => {
        const metadataUrl = `${rawAtCommit}/${directory}/${entry.path}`
        const response = await fetch(metadataUrl)
        if (!response.ok) throw new Error(`Metadata request failed (${response.status}): ${metadataUrl}`)
        const metadata = await response.text()
        const family = firstQuotedValue(metadata, 'name')
        if (!family) throw new Error(`METADATA.pb has no family name: ${metadataUrl}`)
        const category = asCategory(firstQuotedValue(metadata, 'category') ?? 'SANS_SERIF')
        const subsets = quotedValues(metadata, 'subsets').filter((subset) => subset !== 'menu')
        const id = familyToCatalogId(family)
        const licenseFile = directory === 'apache' ? 'LICENSE.txt' : directory === 'ufl' ? 'UFL.txt' : 'OFL.txt'
        return {
          id,
          family,
          category,
          subsets,
          variable: isVariableMetadata(metadata),
          license: LICENSES[directory],
          licenseUrl: `${rawAtCommit}/${directory}/${entry.path.slice(0, -'METADATA.pb'.length)}${licenseFile}`,
          provenance: { source: 'google/fonts' as const, ref: root.sha, directory },
          version: `google-fonts-${root.sha.slice(0, 12)}`,
        } satisfies MetadataIndexEntry
      },
    )
  }))

  const deduped = new Map<string, MetadataIndexEntry>()
  for (const entry of entries.flat()) {
    if (deduped.has(entry.id)) throw new Error(`Duplicate family id from google/fonts: ${entry.id}`)
    deduped.set(entry.id, entry)
  }
  return [...deduped.values()].sort((a, b) => a.family.localeCompare(b.family))
}

async function writeScriptShards(index: Array<{ id: string; subsets: string[] }>): Promise<void> {
  for (const subset of SCRIPT_SHARDS) {
    const ids = index.filter((entry) => entry.subsets.includes(subset)).map((entry) => entry.id)
    await Bun.write(`${out}/by-script/${subset}.json`, `${JSON.stringify(ids, null, 2)}\n`)
  }
}

if (args.curated !== undefined) {
  const glob = new Bun.Glob('families/*.json')
  const families: CuratedFamily[] = []
  for await (const path of glob.scan({ cwd: out })) {
    families.push(JSON.parse(await Bun.file(`${out}/${path}`).text()) as CuratedFamily)
  }
  const existing = JSON.parse(await Bun.file(`${out}/index.json`).text()) as MetadataIndexEntry[]
  const existingById = new Map(existing.map((entry) => [entry.id, entry]))
  const invalid = families.filter((family) =>
    !family.id || !family.family || !['OFL-1.1', 'Apache-2.0'].includes(family.license) ||
    !family.licenseText || family.files.some((file) => !file.url.endsWith('.woff2') || file.sizeBytes <= 0) ||
    existingById.get(family.id)?.license !== family.license ||
    existingById.get(family.id)?.licenseUrl !== family.licenseUrl,
  )
  if (invalid.length) throw new Error(`Invalid curated manifests: ${invalid.map((family) => family.id).join(', ')}`)

  const committed = new Map(families.map((family) => [family.id, family]))
  const index = existing.map((entry) => {
    const family = committed.get(String(entry.id))
    return family
      ? {
          ...entry,
          id: family.id,
          family: family.family,
          category: family.category,
          subsets: family.subsets,
          variable: family.variable,
          license: family.license,
          licenseUrl: family.licenseUrl,
          version: family.version,
        }
      : entry
  })
  await Bun.write(`${out}/index.json`, `${JSON.stringify(index, null, 2)}\n`)

  await writeScriptShards(index.map((entry) => ({
    id: String(entry.id),
    subsets: Array.isArray(entry.subsets) ? entry.subsets.filter((subset): subset is string => typeof subset === 'string') : [],
  })))
  const notice = [
    '# Google Fonts notices',
    '',
    `The application does not bundle Google Fonts binaries. The offline browse index contains ${existing.length} metadata-only families from the authoritative \`google/fonts\` repository; each index entry records an SPDX license, canonical license URL, and the exact source commit/folder that establishes its provenance. Add to document fetches only the pinned WOFF2 face below after explicit user confirmation; the full license text is retained with the IndexedDB cache record.`,
    '',
    '## Curated downloadable faces',
    '',
    ...families.sort((a, b) => a.family.localeCompare(b.family)).map((family) => `- **${family.family}** — ${family.license}; ${family.licenseUrl}`),
    '',
    'CJK families remain catalog metadata only in P0: their Unicode-partitioned WOFF2 delivery requires a multi-face cache key and is deliberately not represented as a misleading single-face download. UFL metadata is likewise browse-only; downloadable manifests are restricted to reviewed OFL-1.1 or Apache-2.0 families.',
    '',
  ].join('\n')
  await Bun.write(`${out}/NOTICE.md`, notice)
  console.log(`Wrote ${families.length} curated downloadable manifests, index, script shards, and NOTICE.`)
} else if (args['apply-ranks'] !== undefined) {
  const index = JSON.parse(await Bun.file(`${out}/index.json`).text()) as MetadataIndexEntry[]
  const apiKey = args['api-key']
  let enriched = await enrichRankFromSnapshot(index)
  if (apiKey) enriched = await enrichRankFromDeveloperApi(enriched, apiKey)
  await Bun.write(`${out}/index.json`, `${JSON.stringify(enriched, null, 2)}\n`)
  console.log(`Applied rank metadata to ${enriched.length} index entries.`)
} else if (args.github !== undefined) {
  let index = await buildGithubIndex()
  const apiKey = args['api-key']
  index = await enrichRankFromSnapshot(index)
  if (apiKey) index = await enrichRankFromDeveloperApi(index, apiKey)
  await Bun.write(`${out}/index.json`, `${JSON.stringify(index, null, 2)}\n`)
  await writeScriptShards(index)
  await Bun.write(`${out}/CATALOG-REFRESH.md`, [
    '# Google Fonts metadata refresh',
    '',
    `This checked-in offline index contains ${index.length} metadata entries derived from the authoritative \`google/fonts\` repository and no font binaries.`,
    'Every entry records its SPDX license and the exact google/fonts commit, top-level license directory, and canonical license URL used as provenance.',
    '',
    'Downloadability remains intentionally narrower: only reviewed OFL-1.1 or Apache-2.0 per-family manifests under `families/` may contain pinned direct WOFF2 URLs and license text. UFL metadata is browse-only; it is never promoted by this repository policy.',
    '',
    'Refresh manually with `bun scripts/google-fonts/build-index.ts --github`, inspect the metadata/provenance diff, then run `bun scripts/google-fonts/build-index.ts --curated` to preserve reviewed manifests and regenerate script shards and NOTICE.',
    '',
    'Rank metadata: the checked-in `scripts/google-fonts/rank-snapshot.json` (from the keyless `fonts.google.com/metadata/fonts` endpoint) is applied automatically during `--github` and via `--apply-ranks`. Refresh ranks with `bun scripts/google-fonts/refresh-rank-snapshot.ts` then `bun scripts/google-fonts/build-index.ts --apply-ranks`. Optionally pass `--api-key "$GOOGLE_FONTS_API_KEY"` to override from the Developer API instead. Vendoring-time only; the app falls back to A–Z when ranks are absent. Never CI or runtime work.',
    '',
  ].join('\n'))
  console.log(`Wrote ${index.length} provenance-backed catalog metadata entries and ${SCRIPT_SHARDS.length} script shards.`)
} else {
  throw new Error('Missing --github, --apply-ranks, or --curated')
}
