import { describe, expect, test } from 'bun:test'
import type { GoogleFontCatalogEntry } from './catalogTypes'
import {
  defaultAxisValues,
  findMatchingStaticFile,
  hashVariationPinSync,
  needsVariablePin,
  normalizeAxisValues,
  variationSettingsString,
} from './variableAxis'

const sampleEntry: GoogleFontCatalogEntry = {
  id: 'roboto',
  family: 'Roboto',
  category: 'sans-serif',
  subsets: ['latin'],
  variable: true,
  axes: [
    { tag: 'wdth', min: 75, max: 100, default: 100 },
    { tag: 'wght', min: 100, max: 900, default: 400 },
  ],
  files: [{
    style: 'normal',
    weight: 400,
    url: 'https://fonts.gstatic.com/s/roboto/v51/static.woff2',
    sizeBytes: 1000,
  }],
  variableFile: {
    style: 'normal',
    url: 'https://fonts.gstatic.com/s/roboto/v51/variable.woff2',
    sizeBytes: 50000,
  },
  license: 'OFL-1.1',
  licenseUrl: 'https://example.com/OFL.txt',
  licenseText: 'OFL',
  version: 'v51',
}

describe('Google Font variable axis helpers', () => {
  test('uses stable pin hashes for identical axis maps', () => {
    const values = { wdth: 100, wght: 550 }
    expect(hashVariationPinSync(values)).toBe(hashVariationPinSync({ wght: 550, wdth: 100 }))
  })

  test('prefers shipped static instances at catalog defaults', () => {
    const values = defaultAxisValues(sampleEntry.axes)
    expect(findMatchingStaticFile(sampleEntry, 'normal', values)?.weight).toBe(400)
    expect(needsVariablePin(sampleEntry, 'normal', values)).toBe(false)
  })

  test('requires a variable pin for non-standard axis combinations', () => {
    const values = normalizeAxisValues(sampleEntry.axes, { wght: 550, wdth: 100 })
    expect(findMatchingStaticFile(sampleEntry, 'normal', values)).toBeUndefined()
    expect(needsVariablePin(sampleEntry, 'normal', values)).toBe(true)
  })

  test('builds sorted variationSettings for FontFace registration', () => {
    expect(variationSettingsString({ wght: 550, wdth: 87.5 })).toBe("'wdth' 87.5, 'wght' 550")
  })
})
