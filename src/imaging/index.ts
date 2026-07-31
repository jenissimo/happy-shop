/**
 * Public API for the imaging subsystem (SPEC §16). Everything here runs on
 * the main thread; the worker itself lives under `./worker` and is loaded
 * lazily via `ImagingClient`.
 */

export {
  ImagingClient,
  ImagingRequestError,
  getImagingClient,
  disposeImagingClient,
} from './ImagingClient'
export type {
  DecodeOptions,
  ImagingClientOptions,
  ImagingProgressHandler,
  ImagingWorkerLike,
} from './ImagingClient'

export { probeClipboardImageSize, writeClipboardImage } from './clipboard'
export type {
  ClipboardImageProbe,
  ProbeClipboardResult,
  WriteClipboardResult,
} from './clipboard'

export {
  registerRasterSurface,
  getRasterSurface,
  releaseRasterSurface,
  listRasterSurfaceIds,
  clearRasterSurfaceStore,
} from './RasterSurfaceStore'
export type { RasterSurfaceEntry } from './RasterSurfaceStore'
export { createTransparentRasterSurface } from './createBlankRasterSurface'

export { collectTransferables, collectTransferablesFromPayload } from './transfer'

export type {
  DecodeLimits,
  DecodeResultPayload,
  EncodeOptions,
  ImagingEvent,
  ImagingRequest,
  Rect,
  Stroke,
  StrokePoint,
  TileRevision,
} from './worker/protocol'

export { floodSelectMask } from './worker/floodSelect'
export type { FloodSelectParams } from './worker/floodSelect'

export { DEFAULT_DECODE_LIMITS } from './worker/defaults'
export { checkDecodeLimits } from './worker/decodeLimits'
export type { DecodeLimitCheck } from './worker/decodeLimits'
export { decodeImageBlob } from './worker/decodeImage'
export type {
  CreateImageBitmapFn,
  DecodeImageErr,
  DecodeImageOk,
  DecodeImageOutcome,
} from './worker/decodeImage'

export {
  TiledRasterSurface,
  TILE_SIZE,
  type RasterPatch,
  type RasterTile,
} from './surfaces/TiledRasterSurface'
export {
  ensureEditableSurface,
  getEditableSurface,
  syncEditableSurfaceToBitmap,
  scheduleEditableSurfaceFlush,
  cancelEditableSurfaceFlush,
  clearEditableSurfaces,
} from './surfaces/EditableSurfaceStore'
