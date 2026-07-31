/**
 * Minimal `RasterSurfaceStore` stub (SPEC §9/§16). This is intentionally a
 * flat module-level `Map`, not the tiled `RasterSurface` interface from
 * SPEC §9.1 — that lands with the M3 raster editing milestone. Today it only
 * needs to hold the `ImageBitmap`s produced by import/decode so a
 * `RasterAssetRef` on a `HappyDocument` layer resolves to real pixels for
 * the (future) renderer.
 */

export type RasterSurfaceEntry = {
  assetId: string
  width: number
  height: number
  bitmap: ImageBitmap
  /** Immutable original bytes (SPEC §9.2) — kept for re-decode/export. */
  sourceBlob?: Blob
}

const store = new Map<string, RasterSurfaceEntry>()

export function registerRasterSurface(entry: RasterSurfaceEntry): void {
  const existing = store.get(entry.assetId)
  if (existing && existing.bitmap !== entry.bitmap) {
    existing.bitmap.close()
  }
  store.set(entry.assetId, entry)
}

export function getRasterSurface(assetId: string): RasterSurfaceEntry | undefined {
  return store.get(assetId)
}

export function releaseRasterSurface(assetId: string): void {
  const entry = store.get(assetId)
  if (!entry) return
  entry.bitmap.close()
  store.delete(assetId)
}

export function listRasterSurfaceIds(): string[] {
  return [...store.keys()]
}

/** Test/session-teardown helper — releases every registered surface. */
export function clearRasterSurfaceStore(): void {
  for (const id of listRasterSurfaceIds()) releaseRasterSurface(id)
}
