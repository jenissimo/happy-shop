import type { DecodeLimits } from './protocol'

/** Product defaults from SPEC §1.3 — hard 8192px/side, soft 64 megapixels. */
export const DEFAULT_DECODE_LIMITS: DecodeLimits = {
  maxSide: 8192,
  softMegapixelLimit: 64,
}
