import { describe, expect, test } from 'bun:test'
import type { GoogleFontIndexEntry } from './catalogTypes'
import {
  defaultGoogleFontSortMode,
  effectiveGoogleFontSortMode,
  indexHasPopularityRanks,
  indexHasTrendingRanks,
  sortGoogleFontIndex,
} from './catalogSort'

const base = (overrides: Partial<GoogleFontIndexEntry> & Pick<GoogleFontIndexEntry, 'id' | 'family'>): GoogleFontIndexEntry => ({
  category: 'sans-serif',
  subsets: ['latin'],
  variable: false,
  license: 'OFL-1.1',
  licenseUrl: 'https://example.com/OFL.txt',
  provenance: {
    source: 'google/fonts',
    ref: '2796410152d4f9524b68ed46e69c1b60f8e0f7c3',
    directory: 'ofl',
  },
  version: 'google-fonts-test',
  ...overrides,
})

describe('Google Font catalog sort', () => {
  test('detects optional rank metadata on the index', () => {
    const ranked = [base({ id: 'roboto', family: 'Roboto', popularityRank: 1 })]
    const unranked = [base({ id: 'roboto', family: 'Roboto' })]

    expect(indexHasPopularityRanks(ranked)).toBe(true)
    expect(indexHasPopularityRanks(unranked)).toBe(false)
    expect(indexHasTrendingRanks([base({ id: 'inter', family: 'Inter', trendingRank: 2 })])).toBe(true)
  })

  test('defaults to popularity when ranks are present, otherwise A–Z', () => {
    expect(defaultGoogleFontSortMode([base({ id: 'roboto', family: 'Roboto', popularityRank: 3 })])).toBe('popularity')
    expect(defaultGoogleFontSortMode([base({ id: 'roboto', family: 'Roboto' })])).toBe('alpha')
  })

  test('falls back to alphabetical when the chosen mode lacks metadata', () => {
    const entries = [base({ id: 'roboto', family: 'Roboto' })]
    expect(effectiveGoogleFontSortMode('popularity', entries)).toBe('alpha')
    expect(effectiveGoogleFontSortMode('trending', entries)).toBe('alpha')
    expect(effectiveGoogleFontSortMode('alpha', entries)).toBe('alpha')
  })

  test('sorts alphabetically by family name', () => {
    const entries = [
      base({ id: 'roboto', family: 'Roboto' }),
      base({ id: 'abel', family: 'Abel' }),
      base({ id: 'montserrat', family: 'Montserrat' }),
    ]
    expect(sortGoogleFontIndex(entries, 'alpha').map((entry) => entry.id)).toEqual([
      'abel',
      'montserrat',
      'roboto',
    ])
  })

  test('sorts by popularity rank with unranked families last (alphabetically among themselves)', () => {
    const entries = [
      base({ id: 'montserrat', family: 'Montserrat', popularityRank: 3 }),
      base({ id: 'roboto', family: 'Roboto', popularityRank: 1 }),
      base({ id: 'abel', family: 'Abel' }),
      base({ id: 'open-sans', family: 'Open Sans', popularityRank: 2 }),
      base({ id: 'raleway', family: 'Raleway' }),
    ]
    expect(sortGoogleFontIndex(entries, 'popularity').map((entry) => entry.id)).toEqual([
      'roboto',
      'open-sans',
      'montserrat',
      'abel',
      'raleway',
    ])
  })

  test('sorts by trending rank independently of popularity', () => {
    const entries = [
      base({ id: 'roboto', family: 'Roboto', trendingRank: 2, popularityRank: 1 }),
      base({ id: 'inter', family: 'Inter', trendingRank: 1, popularityRank: 5 }),
    ]
    expect(sortGoogleFontIndex(entries, 'trending').map((entry) => entry.id)).toEqual(['inter', 'roboto'])
  })

  test('silently uses alphabetical order when popularity metadata is absent', () => {
    const entries = [
      base({ id: 'roboto', family: 'Roboto' }),
      base({ id: 'abel', family: 'Abel' }),
    ]
    expect(sortGoogleFontIndex(entries, 'popularity').map((entry) => entry.id)).toEqual(['abel', 'roboto'])
  })
})
