#!/usr/bin/env bun
/**
 * Human-run vendoring: generate downloadable family manifests for every eligible
 * offline-index entry (OFL-1.1 / Apache-2.0, non-CJK). Not a CI/build dependency.
 *
 * bun scripts/google-fonts/generate-family-manifests.ts
 * bun scripts/google-fonts/generate-family-manifests.ts --force
 * bun scripts/google-fonts/generate-family-manifests.ts --ids inter,roboto --force
 * bun scripts/google-fonts/generate-family-manifests.ts --limit 20
 *
 * After a successful run: bun scripts/google-fonts/build-index.ts --curated
 */
import { GoogleFontCatalogEntrySchema, type GoogleFontCatalogEntry } from '../../src/editor/tools/text/googleFonts/catalogTypes'

const UA = 'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:40.0) Gecko/20100101 Firefox/40.0'
const OUT = 'public/google-fonts'
const CJK_SUBSETS = new Set([
  'japanese',
  'korean',
  'chinese-simplified',
  'chinese-traditional',
])
const CONCURRENCY = 8

type Axis = { tag: string; min: number; max: number; default: number }

type IndexEntry = {
  id: string
  family: string
  category: GoogleFontCatalogEntry['category']
  subsets: string[]
  variable: boolean
  license: 'OFL-1.1' | 'Apache-2.0' | 'UFL-1.0'
  licenseUrl: string
  provenance: { source: 'google/fonts'; ref: string; directory: 'ofl' | 'apache' | 'ufl' }
  version: string
}

const args: Record<string, string> = {}
for (let i = 2; i < process.argv.length; i++) {
  const token = process.argv[i]!
  if (!token.startsWith('--')) continue
  const key = token.slice(2)
  const next = process.argv[i + 1]
  if (next && !next.startsWith('--')) {
    args[key] = next
    i++
  } else {
    args[key] = ''
  }
}
const force = Object.hasOwn(args, 'force')
const limit = args.limit ? Number(args.limit) : undefined
const onlyIds = args.ids
  ? new Set(
      args.ids
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    )
  : undefined

function parseAxes(metadata: string): Axis[] {
  const axes: Axis[] = []
  const lines = metadata.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.trim().startsWith('axes {')) continue
    let tag = ''
    let min = Number.NaN
    let max = Number.NaN
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]!.trim()
      if (line.startsWith('}')) break
      const tagMatch = line.match(/^tag:\s*"([^"]+)"/)
      if (tagMatch) tag = tagMatch[1]!
      const minMatch = line.match(/^min_value:\s*([0-9.]+)/)
      if (minMatch) min = Number(minMatch[1])
      const maxMatch = line.match(/^max_value:\s*([0-9.]+)/)
      if (maxMatch) max = Number(maxMatch[1])
    }
    if (!tag || !Number.isFinite(min) || !Number.isFinite(max)) continue
    axes.push({
      tag,
      min,
      max,
      default: tag === 'wght' ? 400 : tag === 'wdth' ? 100 : tag === 'opsz' ? Math.max(min, Math.min(max, 14)) : min,
    })
  }
  return axes
}

function versionFromUrl(url: string): string | undefined {
  const match = url.match(/\/(v\d+)\//)
  return match?.[1]
}

async function fetchText(url: string, retries = 3): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
      return await response.text()
    } catch (error) {
      lastError = error
      await Bun.sleep(250 * (attempt + 1))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function fetchCss(familySpec: string): Promise<string | undefined> {
  const url = `https://fonts.googleapis.com/css2?family=${familySpec}&display=swap`
  try {
    const response = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!response.ok) return undefined
    return await response.text()
  } catch {
    return undefined
  }
}

async function headSize(url: string): Promise<number> {
  try {
    const response = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA } })
    if (!response.ok) return 0
    return Number(response.headers.get('content-length') ?? 0)
  } catch {
    return 0
  }
}

function cssFamilyName(family: string): string {
  return family.replace(/ /g, '+')
}

async function pickLargestWoff2(css: string): Promise<{ url: string; sizeBytes: number } | undefined> {
  const urls = [...new Set([...css.matchAll(/url\((https:[^)]+\.woff2)\)/g)].map((match) => match[1]!))]
  let best: { url: string; sizeBytes: number } | undefined
  for (const url of urls) {
    try {
      const sizeBytes = await headSize(url)
      if (!sizeBytes) continue
      if (!best || sizeBytes > best.sizeBytes) best = { url, sizeBytes }
    } catch {
      // try next url
    }
  }
  return best
}

async function probeStaticRegular(
  family: string,
  axes: Axis[],
): Promise<{ url: string; sizeBytes: number; weight: number } | undefined> {
  const cssFamily = cssFamilyName(family)
  const wght = axes.find((axis) => axis.tag === 'wght')
  const defaultWeight = wght
    ? Math.round(Math.min(wght.max, Math.max(wght.min, 400)))
    : 400
  const weightAttempts = [...new Set([
    defaultWeight,
    400,
    wght ? Math.round(wght.min) : undefined,
    wght ? Math.round(wght.max) : undefined,
    700,
    500,
    300,
  ].filter((weight): weight is number => weight !== undefined))]

  const specs: Array<{ spec: string; weight: number }> = [
    ...weightAttempts.map((weight) => ({ spec: `${cssFamily}:wght@${weight}`, weight })),
    { spec: cssFamily, weight: defaultWeight },
  ]

  for (const { spec, weight } of specs) {
    const css = await fetchCss(spec)
    if (!css) continue
    const file = await pickLargestWoff2(css)
    if (file) return { ...file, weight }
  }
  return undefined
}

async function probeVariableUrl(
  family: string,
  axes: Axis[],
): Promise<{ url: string; sizeBytes: number } | undefined> {
  const cssFamily = cssFamilyName(family)
  const wght = axes.find((axis) => axis.tag === 'wght')
  const wdth = axes.find((axis) => axis.tag === 'wdth')
  const opsz = axes.find((axis) => axis.tag === 'opsz')
  const specs = [
    wdth && wght
      ? `${cssFamily}:wdth,wght@${wdth.min}..${wdth.max},${wght.min}..${wght.max}`
      : undefined,
    opsz && wght
      ? `${cssFamily}:opsz,wght@${opsz.min}..${opsz.max},${wght.min}..${wght.max}`
      : undefined,
    wght ? `${cssFamily}:wght@${wght.min}..${wght.max}` : undefined,
    `${cssFamily}:wght@100..900`,
  ].filter((spec): spec is string => Boolean(spec))

  for (const spec of specs) {
    const css = await fetchCss(spec)
    if (!css) continue
    const file = await pickLargestWoff2(css)
    if (file) return file
  }
  return undefined
}

function isEligible(entry: IndexEntry): boolean {
  if (entry.license === 'UFL-1.0') return false
  if (entry.license !== 'OFL-1.1' && entry.license !== 'Apache-2.0') return false
  if (entry.subsets.some((subset) => CJK_SUBSETS.has(subset))) return false
  return true
}

async function mapConcurrent<T, U>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const index = next++
        if (index >= items.length) return
        results[index] = await mapper(items[index]!, index)
      }
    }),
  )
  return results
}

async function generateOne(entry: IndexEntry): Promise<'wrote' | 'skipped' | 'failed'> {
  const path = `${OUT}/families/${entry.id}.json`
  if (!force && (await Bun.file(path).exists())) return 'skipped'

  try {
    const licenseText = (await fetchText(entry.licenseUrl)).trim()
    if (!licenseText) throw new Error('empty license text')

    let axes: Axis[] = []
    let variableFile: GoogleFontCatalogEntry['variableFile']
    if (entry.variable) {
      const metadataUrl =
        `https://raw.githubusercontent.com/google/fonts/${entry.provenance.ref}/` +
        `${entry.provenance.directory}/${entry.id}/METADATA.pb`
      try {
        const metadata = await fetchText(metadataUrl)
        axes = parseAxes(metadata)
      } catch {
        axes = []
      }
      const probed = await probeVariableUrl(entry.family, axes)
      if (probed) variableFile = { style: 'normal', ...probed }
    }

    const staticFile = await probeStaticRegular(entry.family, axes)
    if (!staticFile) throw new Error('no static regular WOFF2')

    const version = versionFromUrl(staticFile.url)
      ?? versionFromUrl(variableFile?.url ?? '')
      ?? entry.version

    const isVariable = Boolean(variableFile) && axes.length > 0
    const manifest = GoogleFontCatalogEntrySchema.parse({
      id: entry.id,
      family: entry.family,
      category: entry.category,
      subsets: entry.subsets,
      variable: isVariable,
      axes: isVariable ? axes : [],
      files: [{ style: 'normal' as const, weight: staticFile.weight, url: staticFile.url, sizeBytes: staticFile.sizeBytes }],
      ...(isVariable ? { variableFile } : {}),
      license: entry.license,
      licenseUrl: entry.licenseUrl,
      licenseText,
      version,
    })

    await Bun.write(path, `${JSON.stringify(manifest, null, 2)}\n`)
    return 'wrote'
  } catch (error) {
    console.error(`${entry.id}: ${error instanceof Error ? error.message : error}`)
    return 'failed'
  }
}

const index = JSON.parse(await Bun.file(`${OUT}/index.json`).text()) as IndexEntry[]
let candidates = index.filter(isEligible)
if (onlyIds) candidates = candidates.filter((entry) => onlyIds.has(entry.id))
if (limit !== undefined && Number.isFinite(limit)) candidates = candidates.slice(0, limit)

console.log(`Generating manifests for ${candidates.length} families (force=${force})…`)

let wrote = 0
let skipped = 0
let failed = 0
await mapConcurrent(candidates, CONCURRENCY, async (entry, index) => {
  const result = await generateOne(entry)
  if (result === 'wrote') wrote++
  else if (result === 'skipped') skipped++
  else failed++
  if ((index + 1) % 50 === 0 || index + 1 === candidates.length) {
    console.log(`progress ${index + 1}/${candidates.length} · wrote=${wrote} skipped=${skipped} failed=${failed}`)
  }
  return result
})

const downloadable: string[] = []
const glob = new Bun.Glob('families/*.json')
for await (const path of glob.scan({ cwd: OUT })) {
  downloadable.push(path.replace(/^families\//, '').replace(/\.json$/, ''))
}
downloadable.sort()
await Bun.write(`${OUT}/downloadable.json`, `${JSON.stringify(downloadable, null, 2)}\n`)

console.log(
  `Done. wrote=${wrote} skipped=${skipped} failed=${failed} · downloadable.json=${downloadable.length}`,
)
if (failed > 0) process.exitCode = 1
