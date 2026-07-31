import type {
  AssetId,
  LayerId,
  PathId,
  RasterAssetRef,
  RasterMaskRef,
} from './schema'

/**
 * Brands are a TypeScript-only nominal typing device (see `schema.ts`); at
 * runtime these refs/ids are plain strings, so casting a validated string is
 * safe as long as callers go through these constructors rather than
 * fabricating branded values by hand.
 */

export function createLayerId(): LayerId {
  return crypto.randomUUID() as LayerId
}

export function createAssetId(): AssetId {
  return crypto.randomUUID() as AssetId
}

export function createPathId(): PathId {
  return crypto.randomUUID() as PathId
}

/**
 * Transparent backing reference reserved for documents created without an
 * imported or painted raster surface. It distinguishes the initial blank
 * layer from a user layer that happens to be named "Layer 1".
 */
export const EMPTY_INITIAL_RASTER_ASSET_ID =
  '__happy-shop-empty-initial-raster__' as AssetId

export function asRasterAssetRef(value: string): RasterAssetRef {
  return value as RasterAssetRef
}

export function asRasterMaskRef(value: string): RasterMaskRef {
  return value as RasterMaskRef
}
