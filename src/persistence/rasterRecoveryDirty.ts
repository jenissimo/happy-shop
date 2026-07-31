/**
 * Tracks raster assets changed in this tab. It deliberately holds identifiers
 * only; recovery bytes remain in the raster store / IndexedDB.
 */
const dirtyAssetIds = new Set<string>()

export function markRasterRecoveryDirty(assetId: string): void {
  dirtyAssetIds.add(assetId)
}

export function getDirtyRasterRecoveryAssetIds(): string[] {
  return [...dirtyAssetIds]
}

export function clearDirtyRasterRecoveryAssets(): void {
  dirtyAssetIds.clear()
}
