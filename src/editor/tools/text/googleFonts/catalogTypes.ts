import { z } from 'zod'

export const GoogleFontLicenseSchema = z.enum(['OFL-1.1', 'Apache-2.0', 'UFL-1.0'])
export type GoogleFontLicense = z.infer<typeof GoogleFontLicenseSchema>

export const GoogleFontFileSchema = z.object({
  style: z.enum(['normal', 'italic']),
  weight: z.number().int().min(100).max(900),
  url: z.string().url(),
  sizeBytes: z.number().int().positive(),
})
export type GoogleFontFile = z.infer<typeof GoogleFontFileSchema>

export const GoogleFontAxisSchema = z.object({
  tag: z.string().min(1),
  min: z.number(),
  max: z.number(),
  default: z.number(),
})
export type GoogleFontAxis = z.infer<typeof GoogleFontAxisSchema>

export const GoogleFontVariableFileSchema = z.object({
  style: z.enum(['normal', 'italic']),
  url: z.string().url(),
  sizeBytes: z.number().int().positive(),
})

export const GoogleFontCatalogEntrySchema = z.object({
  id: z.string().min(1),
  family: z.string().min(1),
  category: z.enum(['serif', 'sans-serif', 'display', 'handwriting', 'monospace']),
  subsets: z.array(z.string()),
  variable: z.boolean(),
  axes: z.array(GoogleFontAxisSchema).default([]),
  files: z.array(GoogleFontFileSchema).min(1),
  variableFile: GoogleFontVariableFileSchema.optional(),
  license: GoogleFontLicenseSchema,
  licenseUrl: z.string().url(),
  licenseText: z.string().min(1),
  version: z.string().min(1),
})
export type GoogleFontCatalogEntry = z.infer<typeof GoogleFontCatalogEntrySchema>

export const GoogleFontIndexEntrySchema = GoogleFontCatalogEntrySchema.pick({
  id: true,
  family: true,
  category: true,
  subsets: true,
  variable: true,
  license: true,
  version: true,
}).extend({
  /** Canonical license file pinned to the google/fonts source commit. */
  licenseUrl: z.string().url(),
  provenance: z.object({
    source: z.literal('google/fonts'),
    ref: z.string().regex(/^[0-9a-f]{40}$/),
    directory: z.enum(['ofl', 'apache', 'ufl']),
  }),
  /** Best-effort 1-based rank from vendored Developer API order; absent means unranked. */
  popularityRank: z.number().int().positive().optional(),
  /** Best-effort 1-based trending rank from vendored Developer API order; absent means unranked. */
  trendingRank: z.number().int().positive().optional(),
})
export type GoogleFontIndexEntry = z.infer<typeof GoogleFontIndexEntrySchema>
