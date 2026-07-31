/**
 * Imaging worker message protocol (SPEC §16). Pure types only — this file
 * must stay free of React/Pixi/DOM-lib-specific globals so it can be shared
 * by both the worker script and the main-thread client.
 */

/** Hard/soft canvas limits passed down from `core/document/limits` callers. */
export type DecodeLimits = {
  /** Hard cap per side, in pixels (SPEC §1.3). Exceeding this rejects the decode. */
  maxSide: number
  /** Soft megapixel budget (SPEC §1.3). Exceeding it does not fail the
   * decode — the result carries `overSoftLimit` so the caller can ask the
   * user to confirm. */
  softMegapixelLimit?: number
}

export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

/** Placeholder shape for brush strokes (SPEC §11.3) — filled in during M3. */
export type StrokePoint = {
  x: number
  y: number
  pressure: number
}

export type Stroke = {
  points: StrokePoint[]
  color: string
  size: number
  hardness: number
  opacity: number
  mode: 'paint' | 'erase'
}

export type EncodeOptions = {
  format: 'png' | 'jpeg' | 'webp'
  quality?: number
  background?: 'transparent' | { color: string }
}

export type TileRevision = {
  tileX: number
  tileY: number
  revision: number
}

export type DecodeResultPayload = {
  width: number
  height: number
  /** Transferred, not copied — see transfer-list requirement in SPEC §16. */
  bitmap: ImageBitmap
  overSoftLimit: boolean
}

export type OpaqueBoundsPayload = {
  minX: number
  minY: number
  maxX: number
  maxY: number
} | null

export type ChromaKeyRequestParams = {
  keyR: number
  keyG: number
  keyB: number
  tolerance: number
  softness: number
  despill?: number
  choke?: number
  mode?: 'global' | 'flood'
  floodOrigins?: Array<{ x: number; y: number }>
}

export type ImagingRequest =
  | { id: number; type: 'decode'; blob: Blob; limits: DecodeLimits }
  | { id: number; type: 'apply-stroke'; surfaceId: string; stroke: Stroke }
  | { id: number; type: 'read-tiles'; surfaceId: string; region: Rect }
  | { id: number; type: 'encode'; surfaceId: string; options: EncodeOptions }
  | {
      id: number
      type: 'scan-opaque-bounds'
      width: number
      height: number
      /** RGBA buffer; transferred to worker when possible. */
      rgba: ArrayBuffer
    }
  | {
      id: number
      type: 'apply-chroma-key'
      width: number
      height: number
      rgba: ArrayBuffer
      params: ChromaKeyRequestParams
    }
  | {
      /** Exact 4-connected chroma flood, returned as a transferred A8 buffer. */
      id: number
      type: 'build-chroma-flood-mask'
      width: number
      height: number
      rgba: ArrayBuffer
      params: ChromaKeyRequestParams
    }
  | { id: number; type: 'cancel'; targetId: number }

export type ImagingEvent =
  | { requestId: number; type: 'progress'; completed: number; total: number }
  | { requestId: number; type: 'result'; payload: unknown }
  | { requestId: number; type: 'error'; code: string; message: string }
  | { type: 'tiles-dirty'; surfaceId: string; tiles: TileRevision[] }
