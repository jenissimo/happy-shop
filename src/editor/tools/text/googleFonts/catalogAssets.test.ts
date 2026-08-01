import { describe, expect, test } from 'bun:test'
import { GoogleFontCatalogEntrySchema, GoogleFontIndexEntrySchema } from './catalogTypes'

const CJK_SUBSETS = new Set([
  'japanese',
  'korean',
  'chinese-simplified',
  'chinese-traditional',
])

describe('Google Fonts offline metadata catalog', () => {
  test('ships a provenance-backed full catalog with accurate script shards', async () => {
    const index = GoogleFontIndexEntrySchema.array().parse(
      JSON.parse(await Bun.file('public/google-fonts/index.json').text()),
    )

    expect(index.length).toBeGreaterThanOrEqual(1_500)
    expect(new Set(index.map((entry) => entry.id)).size).toBe(index.length)
    for (const subset of [
      'cyrillic', 'arabic', 'devanagari', 'thai', 'japanese', 'korean',
      'chinese-simplified', 'chinese-traditional',
    ]) {
      expect(index.some((entry) => entry.subsets.includes(subset))).toBe(true)
    }

    for (const entry of index) {
      expect(entry.licenseUrl).toBe(
        `https://raw.githubusercontent.com/google/fonts/${entry.provenance.ref}/${entry.provenance.directory}/` +
        `${entry.licenseUrl.split('/').at(-2)}/${entry.provenance.directory === 'apache' ? 'LICENSE.txt' : entry.provenance.directory === 'ufl' ? 'UFL.txt' : 'OFL.txt'}`,
      )
      expect(
        entry.license === 'OFL-1.1' ? 'ofl' : entry.license === 'Apache-2.0' ? 'apache' : 'ufl',
      ).toBe(entry.provenance.directory)
      if (entry.popularityRank !== undefined) expect(entry.popularityRank).toBeGreaterThan(0)
      if (entry.trendingRank !== undefined) expect(entry.trendingRank).toBeGreaterThan(0)
    }

    expect(index.some((entry) => entry.popularityRank !== undefined)).toBe(true)
    expect(index.some((entry) => entry.trendingRank !== undefined)).toBe(true)
    const roboto = index.find((entry) => entry.id === 'roboto')
    expect(roboto?.popularityRank).toBe(1)

    for (const subset of [
      'latin', 'cyrillic', 'greek', 'arabic', 'hebrew', 'devanagari', 'thai',
      'japanese', 'korean', 'chinese-simplified', 'chinese-traditional',
    ]) {
      const shard = JSON.parse(await Bun.file(`public/google-fonts/by-script/${subset}.json`).text()) as string[]
      expect(shard).toEqual(index.filter((entry) => entry.subsets.includes(subset)).map((entry) => entry.id))
    }

    const assetGlob = new Bun.Glob('**/*')
    const assetPaths = []
    for await (const path of assetGlob.scan({ cwd: 'public/google-fonts' })) assetPaths.push(path)
    expect(assetPaths.filter((path) => /\.(?:otf|ttf|woff2?)$/i.test(path))).toEqual([])
  })

  test('keeps downloadable manifests license-pinned and CSS-hotlink free', async () => {
    const index = GoogleFontIndexEntrySchema.array().parse(
      JSON.parse(await Bun.file('public/google-fonts/index.json').text()),
    )
    const indexById = new Map(index.map((entry) => [entry.id, entry]))
    const downloadable = JSON.parse(
      await Bun.file('public/google-fonts/downloadable.json').text(),
    ) as string[]
    expect(downloadable).toContain('inter')
    expect(downloadable.length).toBeGreaterThan(100)

    const glob = new Bun.Glob('families/*.json')
    const manifests = []
    for await (const path of glob.scan({ cwd: 'public/google-fonts' })) {
      manifests.push(GoogleFontCatalogEntrySchema.parse(
        JSON.parse(await Bun.file(`public/google-fonts/${path}`).text()),
      ))
    }

    expect(manifests.length).toBe(downloadable.length)
    expect(new Set(manifests.map((manifest) => manifest.id))).toEqual(new Set(downloadable))
    expect(manifests.some((manifest) => manifest.id === 'inter')).toBe(true)

    for (const manifest of manifests) {
      expect(['OFL-1.1', 'Apache-2.0']).toContain(manifest.license)
      expect(manifest.licenseText.trim()).not.toBe('')
      expect(manifest.licenseUrl).toMatch(/^https:\/\/raw\.githubusercontent\.com\/google\/fonts\//)
      expect(manifest.files).not.toHaveLength(0)
      for (const file of manifest.files) {
        expect(file.url).toMatch(/^https:\/\/fonts\.gstatic\.com\/.+\.woff2$/)
        expect(file.url).not.toContain('fonts.googleapis.com')
      }
      if (manifest.variable) {
        expect(manifest.axes.length).toBeGreaterThan(0)
        expect(manifest.variableFile?.url).toMatch(/^https:\/\/fonts\.gstatic\.com\/.+\.woff2$/)
      } else {
        expect(manifest.axes).toEqual([])
        expect(manifest.variableFile).toBeUndefined()
      }
      const indexEntry = indexById.get(manifest.id)
      expect(indexEntry?.license).toBe(manifest.license)
      expect(indexEntry?.subsets.some((subset) => CJK_SUBSETS.has(subset))).toBe(false)
    }

    for (const entry of index) {
      if (entry.license === 'UFL-1.0' || entry.subsets.some((subset) => CJK_SUBSETS.has(subset))) {
        expect(downloadable).not.toContain(entry.id)
      }
    }
  })
})
