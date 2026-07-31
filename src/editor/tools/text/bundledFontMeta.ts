import type { GoogleFontLicense } from './googleFonts/catalogTypes'

export type BundledFontAttribution = {
  displayName: string
  license: GoogleFontLicense
  licensePath: string
  designer: string
}

/** Offline attribution for self-hosted OFL faces in `public/fonts/`. */
export const BUNDLED_FONT_ATTRIBUTION: Readonly<
  Record<string, BundledFontAttribution>
> = {
  'Inter, sans-serif': {
    displayName: 'Inter',
    license: 'OFL-1.1',
    licensePath: 'fonts/inter/LICENSE',
    designer: 'The Inter Project Authors',
  },
  '"Source Serif 4", Georgia, serif': {
    displayName: 'Source Serif 4',
    license: 'OFL-1.1',
    licensePath: 'fonts/source-serif-4/LICENSE',
    designer: 'Google Inc.',
  },
}

export function bundledFontAttribution(
  fontFamily: string,
): BundledFontAttribution | undefined {
  return BUNDLED_FONT_ATTRIBUTION[fontFamily]
}
