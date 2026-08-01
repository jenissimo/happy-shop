/**
 * Thin, renderer-facing view of a document. This is intentionally NOT the domain
 * `HappyDocument` schema (owned by `src/core/document/**`). It exists so the
 * rendering layer never imports domain types, and so `src/core` never needs to
 * know Pixi/GPU concepts exist.
 *
 * A future `RenderCoordinator` maps `HappyDocument` (+ resolved assets) into one
 * of these per frame/update. Until that mapping exists, callers can hand-build a
 * `RenderDocumentView` directly (see `viewport/demoDocument.ts`).
 */

export type RenderLayerId = string

/** Mirrors `BlendMode` from SPEC §8.1 — kept as an independent type so rendering
 * never imports the domain module. */
export type RenderBlendMode =
  | 'normal'
  | 'dissolve'
  | 'pass-through'
  | 'darken'
  | 'multiply'
  | 'color-burn'
  | 'linear-burn'
  | 'darker-color'
  | 'lighten'
  | 'screen'
  | 'color-dodge'
  | 'linear-dodge'
  | 'lighter-color'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'vivid-light'
  | 'linear-light'
  | 'pin-light'
  | 'hard-mix'
  | 'difference'
  | 'exclusion'
  | 'subtract'
  | 'divide'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

/** Mirrors `Transform` from SPEC §8.1. */
export interface RenderLayerTransform {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotationDeg: number
  skewXDeg: number
  skewYDeg: number
  pivotX: number
  pivotY: number
}

export function identityTransform(): RenderLayerTransform {
  return {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotationDeg: 0,
    skewXDeg: 0,
    skewYDeg: 0,
    pivotX: 0,
    pivotY: 0,
  }
}

/**
 * Pixel source for a raster layer. `image-bitmap` and `url` are the two real
 * paths (worker-decoded bitmap, or a plain asset URL Pixi can load). `color` is
 * a solid-fill placeholder used by fixtures/demos before real pixels exist.
 */
export type RenderLayerSource =
  | { kind: 'color'; color: string }
  | { kind: 'image-bitmap'; bitmap: ImageBitmap }
  | { kind: 'url'; url: string }

export type RenderContourPreset =
  | 'linear'
  | 'gaussian'
  | 'cone'
  | 'cone-inverted'
  | 'ring'
  | 'ring-double'
  | 'rolling-slope'
  | 'rounded-steps'
  | 'sawtooth'

export type RenderGradientStop = {
  offset: number
  color: string
  opacity: number
}

export type RenderPatternKind = 'checker' | 'stripes' | 'dots' | 'noise'

/**
 * Worker-produced A8 flood connectivity data. It deliberately lives only in
 * the render contract: document metadata retains seeds, never GPU resources.
 */
export type RenderChromaConnectivityMask = {
  width: number
  height: number
  data: Uint8Array
  revision: string
}

/**
 * Renderer-facing effect params (mirrors domain LayerEffect).
 * See SPECS/LAYER-STYLES.md for Adobe stacking order + GPU vs CPU fidelity.
 */
export type RenderLayerEffect = {
  id: string
} & (
  | {
      type: 'drop-shadow'
      enabled: boolean
      blendMode: RenderBlendMode
      color: string
      opacity: number
      angle: number
      distance: number
      spread: number
      size: number
      contour: RenderContourPreset
      noise: number
      layerKnocksOutDropShadow: boolean
    }
  | {
      type: 'inner-shadow'
      enabled: boolean
      blendMode: RenderBlendMode
      color: string
      opacity: number
      angle: number
      distance: number
      choke: number
      size: number
      contour: RenderContourPreset
      noise: number
    }
  | {
      type: 'outer-glow'
      enabled: boolean
      blendMode: RenderBlendMode
      opacity: number
      noise: number
      technique: 'softer' | 'precise'
      color: string
      spread: number
      size: number
      contour: RenderContourPreset
      range: number
      jitter: number
    }
  | {
      type: 'inner-glow'
      enabled: boolean
      blendMode: RenderBlendMode
      opacity: number
      noise: number
      technique: 'softer' | 'precise'
      source: 'center' | 'edge'
      color: string
      choke: number
      size: number
      contour: RenderContourPreset
      range: number
      jitter: number
    }
  | {
      type: 'bevel-emboss'
      enabled: boolean
      style:
        | 'outer-bevel'
        | 'inner-bevel'
        | 'emboss'
        | 'pillow-emboss'
        | 'stroke-emboss'
      technique: 'smooth' | 'chisel-hard' | 'chisel-soft'
      depth: number
      direction: 'up' | 'down'
      size: number
      soften: number
      angle: number
      altitude: number
      highlightColor: string
      highlightOpacity: number
      highlightMode: RenderBlendMode
      shadowColor: string
      shadowOpacity: number
      shadowMode: RenderBlendMode
      contourEnabled: boolean
      contour: RenderContourPreset
      contourRange: number
      contourAntiAliased: boolean
      textureEnabled: boolean
      texturePattern: RenderPatternKind
      textureScale: number
      textureDepth: number
      textureInvert: boolean
      textureAlignWithLayer: boolean
    }
  | {
      type: 'satin'
      enabled: boolean
      blendMode: RenderBlendMode
      color: string
      opacity: number
      angle: number
      distance: number
      size: number
      contour: RenderContourPreset
      invert: boolean
    }
  | {
      type: 'color-overlay'
      enabled: boolean
      blendMode: RenderBlendMode
      color: string
      opacity: number
    }
  | {
      type: 'gradient-overlay'
      enabled: boolean
      blendMode: RenderBlendMode
      opacity: number
      stops: RenderGradientStop[]
      style: 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond'
      angle: number
      scale: number
      reverse: boolean
      offsetX: number
      offsetY: number
    }
  | {
      type: 'pattern-overlay'
      enabled: boolean
      blendMode: RenderBlendMode
      opacity: number
      pattern: RenderPatternKind
      scale: number
      angle: number
      invert: boolean
      offsetX: number
      offsetY: number
    }
  | {
      type: 'stroke'
      enabled: boolean
      blendMode: RenderBlendMode
      color: string
      opacity: number
      size: number
      position?: 'inside' | 'center' | 'outside'
      overprint?: boolean
      fillType?: 'color' | 'gradient' | 'pattern'
    }
  | {
      type: 'chroma-key'
      enabled: boolean
      keyColor: string
      mode?: 'global' | 'flood'
      floodOrigins?: { x: number; y: number }[]
      /** Present only after the worker resolves flood connectivity. */
      connectivityMask?: RenderChromaConnectivityMask
      tolerance: number
      softness: number
      despill?: number
      choke?: number
      edgeBlur?: number
    }
  | {
      type: 'gaussian-blur'
      enabled: boolean
      radius: number
    }
  | {
      type: 'sharpen'
      enabled: boolean
      amount: number
      radius: number
    }
    | {
      type: 'adjustment'
      enabled: boolean
      adjustment:
        | { type: 'brightness-contrast'; brightness: number; contrast: number }
        | { type: 'hue-saturation'; hueDeg: number; saturation: number; lightness: number }
        | { type: 'levels'; black: number; white: number; gamma: number }
        | { type: 'curves'; master: { x: number; y: number }[]; red?: { x: number; y: number }[]; green?: { x: number; y: number }[]; blue?: { x: number; y: number }[] }
    }
  | {
      type: 'noise'
      enabled: boolean
      amount: number
      distribution: 'uniform' | 'gaussian'
      monochromatic: boolean
    }
)

/** Document-space grayscale layer mask (white reveals, black hides). */
export type RenderLayerMask = {
  bitmap: ImageBitmap
  width: number
  height: number
}

export interface RenderRasterLayerView {
  id: RenderLayerId
  kind: 'raster'
  visible: boolean
  opacity: number
  /** Photoshop Fill Opacity (0..1). */
  fillOpacity: number
  blendMode: RenderBlendMode
  transform: RenderLayerTransform
  /** Layer-local content size in document pixels, before `transform` is applied. */
  width: number
  height: number
  source: RenderLayerSource
  effects?: RenderLayerEffect[]
  /** Present when the layer has an enabled mask. */
  mask?: RenderLayerMask
  /** When true, mask clips post-FX output; default false (pre-FX content mask). */
  maskHidesEffects?: boolean
}

/** Editable text layer view (SPECS/TEXT-TOOL.md) — no pixel buffer. */
export interface RenderTextLayerView {
  id: RenderLayerId
  kind: 'text'
  visible: boolean
  opacity: number
  fillOpacity: number
  blendMode: RenderBlendMode
  transform: RenderLayerTransform
  content: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  italic: boolean
  underline: boolean
  color: string
  runs: Array<{
    start: number
    end: number
    fontFamily: string
    fontSize: number
    fontWeight: number
    italic: boolean
    color: string
    underline?: boolean
    tracking?: number
    baselineShift?: number
  }>
  tracking: number
  leading: number
  baselineShift: number
  align: 'left' | 'center' | 'right' | 'justify'
  textMode: 'point' | 'box'
  /** Box wrap size; ignored for point mode except as optional max. */
  bounds: { w: number; h: number }
  effects?: RenderLayerEffect[]
  mask?: RenderLayerMask
  maskHidesEffects?: boolean
}

/** Vector shape layer view (SPECS/UX-PHOTOSHOP.md) — Pixi Graphics, no pixel buffer. */
export interface RenderShapeLayerView {
  id: RenderLayerId
  kind: 'shape'
  visible: boolean
  opacity: number
  fillOpacity: number
  blendMode: RenderBlendMode
  transform: RenderLayerTransform
  primitive: 'rect' | 'ellipse' | 'polygon' | 'star' | 'line' | 'arrow' | 'svg-path'
  bounds: { x: number; y: number; w: number; h: number }
  fill: { enabled: boolean; color: string; opacity: number }
  stroke: { enabled: boolean; color: string; opacity: number; width: number }
  cornerRadius?: number
  sides?: number
  starPoints?: number
  starInset?: number
  pathData?: string
  effects?: RenderLayerEffect[]
  mask?: RenderLayerMask
  maskHidesEffects?: boolean
}

/**
 * Isolated group (`GroupLayer.isolated === true`, see `SPECS/GROUP-LAYER-FX.md`).
 * The compositor renders `children` to an offscreen buffer first, then treats
 * that buffer as one flattened layer: `effects`/`opacity`/`blendMode`/
 * `fillOpacity`/`mask` apply to the composited result, exactly like any other
 * layer kind. Pass-through groups (`isolated: false`, the default) never
 * produce this node — their children are inlined directly into the parent's
 * `children`/`layers` array by the mapper, unchanged from today's behavior.
 */
export interface RenderGroupLayerView {
  id: RenderLayerId
  kind: 'group'
  visible: boolean
  opacity: number
  fillOpacity: number
  blendMode: RenderBlendMode
  transform: RenderLayerTransform
  effects?: RenderLayerEffect[]
  mask?: RenderLayerMask
  maskHidesEffects?: boolean
  /** Bottom -> top, already resolved (nested pass-through groups inlined). */
  children: RenderLayerView[]
}

/** Raster + text + shape + isolated group. Pass-through groups/adjustments are
 * never represented directly — see `RenderGroupLayerView` and `SPECS/GROUP-LAYER-FX.md`. */
export type RenderLayerView =
  | RenderRasterLayerView
  | RenderTextLayerView
  | RenderShapeLayerView
  | RenderGroupLayerView

export interface RenderDocumentView {
  id: string
  width: number
  height: number
  background: 'transparent' | { color: string }
  /** Bottom -> top. Isolated groups nest as `RenderGroupLayerView`; everything
   * else (including pass-through group contents) is flattened in paint order. */
  layers: RenderLayerView[]
}
