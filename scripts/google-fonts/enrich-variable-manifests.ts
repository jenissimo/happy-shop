#!/usr/bin/env bun
/**
 * One-time vendoring helper: enrich curated variable-family manifests with
 * axis metadata and direct variable WOFF2 URLs. Not a CI/build dependency.
 *
 * bun scripts/google-fonts/enrich-variable-manifests.ts
 */
import { GoogleFontCatalogEntrySchema } from '../../src/editor/tools/text/googleFonts/catalogTypes'

const UA = 'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:40.0) Gecko/20100101 Firefox/40.0'

type Axis = { tag: string; min: number; max: number; default: number }

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

async function probeVariableUrl(
  family: string,
  style: 'normal' | 'italic',
  axes: Axis[],
): Promise<{ url: string; sizeBytes: number } | undefined> {
  const cssFamily = family.replace(/ /g, '+')
  const wght = axes.find((axis) => axis.tag === 'wght')
  const wdth = axes.find((axis) => axis.tag === 'wdth')
  const specs = [
    wdth && wght
      ? `${cssFamily}:wdth,wght@${wdth.min}..${wdth.max},${wght.min}..${wght.max}`
      : undefined,
    wght ? `${cssFamily}:wght@${wght.min}..${wght.max}` : `${cssFamily}:wght@100..900`,
    style === 'italic'
      ? `${cssFamily}:ital,wght@1,100..900`
      : `${cssFamily}:wght@100..900`,
  ].filter((spec): spec is string => Boolean(spec))

  let best: { url: string; sizeBytes: number } | undefined
  for (const spec of specs) {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${spec}&display=swap`, { headers: { 'User-Agent': UA } }).then((r) => r.text())
    const urls = [...new Set([...css.matchAll(/url\((https:[^)]+\.woff2)\)/g)].map((match) => match[1]!))]
    for (const url of urls) {
      const head = await fetch(url, { method: 'HEAD' })
      const size = Number(head.headers.get('content-length') ?? 0)
      if (!head.ok || !size) continue
      if (!best || size > best.sizeBytes) best = { url, sizeBytes: size }
    }
    if (best) break
  }
  return best
}

const glob = new Bun.Glob('families/*.json')
for await (const path of glob.scan({ cwd: 'public/google-fonts' })) {
  const filePath = `public/google-fonts/${path}`
  const entry = GoogleFontCatalogEntrySchema.parse(JSON.parse(await Bun.file(filePath).text()))
  if (!entry.variable) continue

  const licenseParts = entry.licenseUrl.split('/')
  const ref = licenseParts[5]
  const directory = licenseParts[6]
  const id = licenseParts[7]
  const metadataUrl = `https://raw.githubusercontent.com/google/fonts/${ref}/${directory}/${id}/METADATA.pb`
  const metadata = await fetch(metadataUrl).then((r) => r.text())
  const axes = parseAxes(metadata)
  const variableFile = await probeVariableUrl(entry.family, 'normal', axes)

  const next = {
    ...entry,
    axes,
    ...(variableFile ? { variableFile: { style: 'normal' as const, ...variableFile } } : {}),
  }
  await Bun.write(filePath, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`${entry.id}: ${axes.map((axis) => axis.tag).join(', ') || 'no axes'} · VF ${variableFile ? `${Math.ceil(variableFile.sizeBytes / 1024)}KB` : 'missing'}`)
}
