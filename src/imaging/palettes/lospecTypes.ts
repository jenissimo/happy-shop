import { z } from 'zod'

export const HexColorSchema = z.string().regex(/^#[0-9A-F]{6}$/)

export const LospecPaletteIndexEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  author: z.string().min(1),
  colorCount: z.number().int().positive(),
  license: z.string().min(1),
  sourceUrl: z.string().url(),
  tags: z.array(z.string()).optional(),
})

export const LospecPaletteSchema = LospecPaletteIndexEntrySchema.extend({
  licenseNote: z.string().min(1),
  colors: z.array(HexColorSchema).min(1),
})

export type LospecPaletteIndexEntry = z.infer<typeof LospecPaletteIndexEntrySchema>
export type LospecPalette = z.infer<typeof LospecPaletteSchema>
