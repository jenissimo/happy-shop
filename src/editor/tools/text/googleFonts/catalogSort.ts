import type { GoogleFontIndexEntry } from './catalogTypes'

export type GoogleFontSortMode = 'alpha' | 'popularity' | 'trending'

export function indexHasPopularityRanks(
  entries: readonly Pick<GoogleFontIndexEntry, 'popularityRank'>[],
): boolean {
  return entries.some((entry) => entry.popularityRank !== undefined)
}

export function indexHasTrendingRanks(
  entries: readonly Pick<GoogleFontIndexEntry, 'trendingRank'>[],
): boolean {
  return entries.some((entry) => entry.trendingRank !== undefined)
}

export function defaultGoogleFontSortMode(
  entries: readonly GoogleFontIndexEntry[],
): GoogleFontSortMode {
  if (indexHasPopularityRanks(entries)) return 'popularity'
  return 'alpha'
}

/** Falls back to alphabetical when the chosen mode lacks catalog metadata. */
export function effectiveGoogleFontSortMode(
  mode: GoogleFontSortMode,
  entries: readonly GoogleFontIndexEntry[],
): GoogleFontSortMode {
  if (mode === 'popularity' && !indexHasPopularityRanks(entries)) return 'alpha'
  if (mode === 'trending' && !indexHasTrendingRanks(entries)) return 'alpha'
  return mode
}

function compareAlpha(a: GoogleFontIndexEntry, b: GoogleFontIndexEntry): number {
  return a.family.localeCompare(b.family, undefined, { sensitivity: 'base' })
}

function compareByRank(
  a: GoogleFontIndexEntry,
  b: GoogleFontIndexEntry,
  field: 'popularityRank' | 'trendingRank',
): number {
  const rankA = a[field]
  const rankB = b[field]
  if (rankA !== undefined && rankB !== undefined) return rankA - rankB
  if (rankA !== undefined) return -1
  if (rankB !== undefined) return 1
  return compareAlpha(a, b)
}

export function sortGoogleFontIndex(
  entries: readonly GoogleFontIndexEntry[],
  mode: GoogleFontSortMode,
): GoogleFontIndexEntry[] {
  const effective = effectiveGoogleFontSortMode(mode, entries)
  const sorted = [...entries]
  switch (effective) {
    case 'popularity':
      sorted.sort((a, b) => compareByRank(a, b, 'popularityRank'))
      break
    case 'trending':
      sorted.sort((a, b) => compareByRank(a, b, 'trendingRank'))
      break
    default:
      sorted.sort(compareAlpha)
  }
  return sorted
}
