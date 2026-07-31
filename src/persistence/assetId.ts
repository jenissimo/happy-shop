/** Client-safe asset id guard (no Node path APIs). */
export function assertSafeAssetId(id: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new Error('invalid asset id')
  }
  return id
}
