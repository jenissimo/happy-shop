export type {
  AssetId,
  ExportRequest,
  ProjectAssetDescriptor,
  ProjectAssetKind,
  ProjectConflictPayload,
  ProjectLocator,
  ProjectManifest,
  ProjectRevision,
  ProjectSaveTransaction,
  ProjectSnapshot,
  ProjectStore,
  StagedAssetWrite,
} from './types'

export {
  ProjectAssetDescriptorSchema,
  ProjectManifestSchema,
  createEmptyManifest,
  parseManifest,
} from './manifest'

export { assertSafeAssetId } from './assetId'
export { encodeSurfaceToPng } from './encodeSurfacePng'
export { collectSaveAssets } from './collectSaveAssets'
export {
  RECOVERY_BUDGET_BYTES,
  canRecoverGeneration,
  clearRasterRecoveryAfterSave,
  discardRasterRecovery,
  getPendingRasterRecovery,
  recoverPendingRasterGeneration,
  writeRasterRecoveryGeneration,
  type RecoveryGeneration,
} from './rasterRecovery'
export {
  BridgeProjectStore,
  ProjectConflictError,
  getBridgeProjectStore,
} from './BridgeProjectStore'
