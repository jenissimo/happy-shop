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
export {
  BROWSER_PATH_PREFIX,
  PROJECT_DIR,
  PROJECT_DIR_SUFFIX,
  assertSafeProjectName,
  assertSafeProjectPath,
  isSafeProjectName,
  projectNameFromPath,
  projectPathForName,
  stripProjectSuffix,
} from './projectPath'
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
export {
  BrowserProjectStore,
  getBrowserProjectStore,
  resetBrowserProjectStoreForTests,
} from './BrowserProjectStore'
export { getProjectStore, isBrowserProjectBackend } from './projectStore'
