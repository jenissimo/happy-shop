import type { HappyDocument } from '../core/document'

export type ProjectLocator = {
  kind: 'directory'
  /** Absolute path to a `*.happyshop` project directory. */
  path: string
}

export type ProjectRevision = string

export type AssetId = string

export type ProjectAssetKind = 'layer' | 'asset' | 'thumbnail'

export type ProjectAssetDescriptor = {
  id: AssetId
  /** Path relative to the project root, e.g. `layers/<id>.png`. */
  relativePath: string
  kind: ProjectAssetKind
  width?: number
  height?: number
  mimeType?: string
}

export type ProjectManifest = {
  schemaVersion: 1
  revision: ProjectRevision
  savedAt: string
  document: HappyDocument
  assets: Record<AssetId, ProjectAssetDescriptor>
}

export type ProjectSnapshot = {
  locator: ProjectLocator
  revision: ProjectRevision
  document: HappyDocument
  assets: Record<AssetId, ProjectAssetDescriptor>
}

export type StagedAssetWrite = {
  id: AssetId
  kind: ProjectAssetKind
  blob: Blob
  width?: number
  height?: number
  mimeType?: string
}

export type ProjectSaveTransaction = {
  /** `null` means first save / create (no prior revision to conflict with). */
  expectedRevision: ProjectRevision | null
  document: HappyDocument
  assets: StagedAssetWrite[]
  removedAssetIds?: AssetId[]
}

export type ExportRequest = {
  format: 'png' | 'jpeg' | 'webp'
  quality?: number
  /** Absolute or workspace-relative destination path handled by the bridge. */
  destinationPath: string
  blob: Blob
}

export type ProjectConflictPayload = {
  error: 'revision conflict'
  currentRevision: ProjectRevision
  document: HappyDocument
}

export interface ProjectStore {
  /** Locator of the project opened in this store instance, if any. */
  readonly openLocator: ProjectLocator | null
  open(locator: ProjectLocator): Promise<ProjectSnapshot>
  readAsset(id: AssetId, signal?: AbortSignal): Promise<Blob>
  save(
    transaction: ProjectSaveTransaction,
    signal?: AbortSignal,
  ): Promise<ProjectRevision>
  exportFile(request: ExportRequest, signal?: AbortSignal): Promise<void>
}
