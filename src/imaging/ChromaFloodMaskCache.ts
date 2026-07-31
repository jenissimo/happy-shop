import type { RenderChromaConnectivityMask } from '../rendering/contracts/RenderDocumentView'
import { getImagingClient, type ImagingClient } from './ImagingClient'
import type { ChromaKeyRequestParams } from './worker/protocol'

type FloodEffectParams = {
  keyColor: string
  tolerance: number
  softness: number
  floodOrigins?: ReadonlyArray<{ x: number; y: number }>
}

const bitmapIds = new WeakMap<ImageBitmap, number>()
let nextBitmapId = 1

function bitmapId(bitmap: ImageBitmap): number {
  let id = bitmapIds.get(bitmap)
  if (id == null) {
    id = nextBitmapId++
    bitmapIds.set(bitmap, id)
  }
  return id
}

function rgb(color: string): [number, number, number] {
  const hex = color.replace('#', '')
  if (hex.length < 6) return [0, 0, 0]
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ]
}

function snapshotRgba(bitmap: ImageBitmap, width: number, height: number): Uint8ClampedArray | null {
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : typeof document !== 'undefined'
        ? Object.assign(document.createElement('canvas'), { width, height })
        : null
  if (!canvas) return null
  const context = canvas.getContext('2d', { willReadFrequently: true }) as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null
  if (!context) return null
  context.drawImage(bitmap, 0, 0, width, height)
  return context.getImageData(0, 0, width, height).data
}

/**
 * Coalesces worker flood-mask requests by bitmap identity and chroma params.
 * Image readback only snapshots pixels; all connectivity work stays in the
 * imaging worker. Callers subscribe to rerender once a mask becomes available.
 */
export class ChromaFloodMaskCache {
  private readonly values = new Map<string, RenderChromaConnectivityMask>()
  private readonly pending = new Set<string>()
  private readonly listeners = new Set<() => void>()

  constructor(private readonly imaging: Pick<ImagingClient, 'buildChromaFloodMask'> = getImagingClient()) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getOrRequest(
    bitmap: ImageBitmap,
    width: number,
    height: number,
    effect: FloodEffectParams,
  ): RenderChromaConnectivityMask | undefined {
    const [keyR, keyG, keyB] = rgb(effect.keyColor)
    const params: ChromaKeyRequestParams = {
      keyR,
      keyG,
      keyB,
      tolerance: effect.tolerance,
      softness: effect.softness,
      mode: 'flood',
      floodOrigins: [...(effect.floodOrigins ?? [])],
    }
    const key = `${bitmapId(bitmap)}:${width}x${height}:${JSON.stringify(params)}`
    const cached = this.values.get(key)
    if (cached || this.pending.has(key)) return cached

    const rgba = snapshotRgba(bitmap, width, height)
    if (!rgba) return undefined
    this.pending.add(key)
    void this.imaging.buildChromaFloodMask(rgba, width, height, params)
      .then(({ width: maskWidth, height: maskHeight, mask }) => {
        this.values.set(key, { width: maskWidth, height: maskHeight, data: mask, revision: key })
        for (const listener of this.listeners) listener()
      })
      // The filter remains a flood no-op if worker/canvas readback is unavailable.
      .catch(() => undefined)
      .finally(() => this.pending.delete(key))
    return undefined
  }
}
