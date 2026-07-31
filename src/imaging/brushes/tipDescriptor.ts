import { z } from 'zod'

export const BrushTipDescriptorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  pack: z.string().min(1),
  kind: z.enum(['procedural', 'stamp']),
  /** Analytic stamp footprint; square tips use integer N×N blocks with no fringe. */
  shape: z.enum(['round', 'square']).default('round'),
  hardness: z.number().min(0).max(1).default(0.85),
  roundness: z.number().min(0.05).max(1).default(1),
  angle: z.number().default(0),
  spacing: z.number().min(0.02).max(2).default(0.25),
  texture: z
    .object({
      src: z.string().min(1),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
  defaults: z
    .object({
      size: z.number().positive().optional(),
      opacity: z.number().min(0).max(1).optional(),
      flow: z.number().min(0).max(1).optional(),
    })
    .default({}),
  license: z.object({
    spdx: z.string().min(1),
    pack: z.string().min(1),
    source: z.string().url(),
    author: z.string().optional(),
  }),
})

export type BrushTipDescriptor = z.infer<typeof BrushTipDescriptorSchema>
