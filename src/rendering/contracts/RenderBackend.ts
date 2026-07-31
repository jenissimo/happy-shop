import type { RenderDocumentView } from './RenderDocumentView'
import type { ViewportFrame } from './ViewportFrame'

/** SPEC §4.1 — WebGPU stays experimental/opt-in; WebGL is the production default. */
export type RendererPreference = 'webgl' | 'webgpu-experimental'

export interface RuntimeCapabilities {
  preference: RendererPreference
  antialias: boolean
  backgroundAlpha: number
  powerPreference: 'high-performance' | 'low-power' | 'default'
}

export interface ExportRegionRequest {
  /** Region in document pixel coordinates. */
  x: number
  y: number
  width: number
  height: number
  /** Extra output resolution multiplier (e.g. export at 2x). Defaults to 1. */
  scale?: number
}

/**
 * SPEC §4.1 contract. Implementations (Pixi today, potentially something else
 * later) live under `src/rendering/pixi/**` and must not leak their types past
 * this interface.
 */
export interface RenderBackend {
  init(target: HTMLCanvasElement, capabilities: RuntimeCapabilities): Promise<void>
  syncDocument(view: RenderDocumentView): void
  render(frame: ViewportFrame): void
  exportRegion(request: ExportRegionRequest): Promise<ImageBitmap>
  destroy(): void
}
