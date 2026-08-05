/**
 * Separable two-pass Gaussian blur for the soft-edge FX.
 *
 * The single-pass helper this replaces spread a fixed 7×7 grid of taps over
 * `radius / 3` each, and weighted them by `exp(-(x²+y²) / 2σ²)` with `x,y` in
 * *tap indices* but σ in *pixels*. Two failures compound: past a few pixels of
 * radius every weight rounds to 1, so the "gaussian" is a box; and the taps
 * themselves sit `radius / 3` apart — 40px apart at radius 120 — so a hard glyph
 * edge comes out as seven discrete copies of itself with visible banding
 * between them. A fixed tap budget cannot cover a growing radius, exactly as
 * with the old ring-of-taps dilation behind Stroke and the glows.
 *
 * A gaussian is separable, so two 1-D passes cost O(σ) taps instead of O(σ²)
 * and every tap can sit on its own texel. Adjacent texel pairs are fetched with
 * a single bilinear sample placed at the pair's weighted centroid, which
 * reproduces the two-tap sum exactly and halves the fetches. The result is a
 * blurred copy of the input that consumers sample as a second texture, so one
 * blur can serve two reads (Satin) or a read at an offset (Drop/Inner Shadow).
 *
 * Sigma is in *device texels* throughout; consumers convert their pass-pixel
 * sizes with the input resolution.
 */
import {
  Filter,
  GlProgram,
  Texture,
  TexturePool,
  UniformGroup,
  type FilterSystem,
} from 'pixi.js'
import { DEFAULT_FILTER_VERT } from './defaultFilterVert'

/**
 * Photoshop's "Size" is the reach of the softening, not its standard
 * deviation: the falloff is finished by `size` pixels from the edge. A gaussian
 * carries 99.7% of its mass inside 3σ, so `σ = size / 3` puts the visible end
 * of the ramp exactly where the effect descriptors already reserve padding for
 * it.
 */
export const SIGMA_PER_SIZE = 1 / 3

/**
 * Content-phase Gaussian Blur / Sharpen / High Pass call their parameter
 * "Radius" in Photoshop's sense, which is about twice the standard deviation —
 * a much stronger blur per unit than a style's Size. Their descriptors already
 * reserve `3 × radius`, comfortably past the 1.5 × radius this reaches.
 */
export const SIGMA_PER_RADIUS = 1 / 2

/**
 * Bilinear samples per side, per pass. 96 pairs reach 192 texels, which covers
 * every size the UI offers at 1× and all but the largest at 2×; beyond that the
 * kernel grid stretches instead of growing, trading exactness for a bounded
 * cost of `steps + 1` fetches per pass.
 */
export const MAX_BLUR_STEPS = 96

export type BlurTapPlan = {
  /** Bilinear samples per side; 0 is a passthrough copy. */
  steps: number
  /** Kernel grid spacing in texels; 1 keeps every tap on its own texel. */
  unit: number
}

export function blurTapPlan(sigmaTexels: number): BlurTapPlan {
  const sigma = Math.max(sigmaTexels, 0)
  const reach = Math.ceil(sigma * 3)
  if (reach < 1) return { steps: 0, unit: 1 }
  const unit = Math.max(1, reach / (2 * MAX_BLUR_STEPS))
  return { steps: Math.min(MAX_BLUR_STEPS, Math.ceil(reach / (2 * unit))), unit }
}

// Wide kernels accumulate hundreds of taps and step UVs by fractions of a
// texel; mediump (Pixi's default) visibly quantises both.
const BLUR_FRAGMENT = `precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform highp vec4 uInputPixel;
uniform vec4 uInputClamp;
uniform vec2 uDirection;
uniform float uSigma;
uniform float uUnit;
uniform float uSteps;

vec4 tap(vec2 offset) {
    return texture(uTexture, clamp(vTextureCoord + offset, uInputClamp.xy, uInputClamp.zw));
}

void main(void)
{
    vec2 texel = uInputPixel.zw * uDirection;
    float inv2s2 = 1.0 / (2.0 * max(uSigma * uSigma, 1e-6));
    vec4 sum = tap(vec2(0.0));
    float wsum = 1.0;

    // GLSL ES 1.00 only allows a constant loop bound, so the tap count is a
    // ceiling with an early break rather than the bound itself.
    for (int pair = 1; pair <= ${MAX_BLUR_STEPS}; pair++) {
        float i = float(pair);
        if (i > uSteps) break;
        // One bilinear fetch stands in for the texel pair (2i-1, 2i): placing it
        // at the pair's weighted centroid makes the hardware interpolation
        // return exactly w0*t0 + w1*t1, normalised.
        float k0 = (2.0 * i - 1.0) * uUnit;
        float k1 = (2.0 * i) * uUnit;
        float w0 = exp(-k0 * k0 * inv2s2);
        float w1 = exp(-k1 * k1 * inv2s2);
        float w = w0 + w1;
        vec2 offset = texel * ((k0 * w0 + k1 * w1) / max(w, 1e-8));
        sum += (tap(offset) + tap(-offset)) * w;
        wsum += 2.0 * w;
    }

    finalColor = sum / wsum;
}
`

class GaussianPassFilter extends Filter {
  constructor() {
    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: BLUR_FRAGMENT,
        name: 'hs-gaussian-pass',
      }),
      resources: {
        gaussianPassUniforms: new UniformGroup({
          uDirection: { value: [1, 0], type: 'vec2<f32>' },
          uSigma: { value: 1, type: 'f32' },
          uUnit: { value: 1, type: 'f32' },
          uSteps: { value: 0, type: 'f32' },
        }),
      },
      padding: 0,
    })
  }

  configure(horizontal: boolean, plan: BlurTapPlan, sigma: number): void {
    const u = this.resources.gaussianPassUniforms.uniforms as {
      uDirection: number[]
      uSigma: number
      uUnit: number
      uSteps: number
    }
    u.uDirection[0] = horizontal ? 1 : 0
    u.uDirection[1] = horizontal ? 0 : 1
    u.uSigma = sigma
    u.uUnit = plan.unit
    u.uSteps = plan.steps
  }
}

let passFilter: GaussianPassFilter | null = null

/**
 * Blur `input` with a gaussian of `sigmaTexels`, premultiplied RGBA. The caller
 * owns the returned texture and must hand it to `releaseGaussianBlur`.
 *
 * Both intermediates come from `TexturePool` and go back to it while still
 * bound to a sampler; that is safe only because Pixi detaches a render target's
 * colour textures from every texture unit at the start of each pass. See
 * `alphaDistanceField` for the full argument — `e2e/layer-fx-feedback.spec.ts`
 * pins it for these filters too.
 */
export function renderGaussianBlur(
  filterManager: FilterSystem,
  input: Texture,
  sigmaTexels: number,
): Texture {
  passFilter ??= new GaussianPassFilter()
  const sigma = Math.max(sigmaTexels, 0)
  const plan = blurTapPlan(sigma)

  const horizontal = TexturePool.getSameSizeTexture(input)
  const vertical = TexturePool.getSameSizeTexture(input)

  passFilter.configure(true, plan, sigma)
  passFilter.apply(filterManager, input, horizontal, true)
  passFilter.configure(false, plan, sigma)
  passFilter.apply(filterManager, horizontal, vertical, true)

  TexturePool.returnTexture(horizontal)
  return vertical
}

export function releaseGaussianBlur(texture: Texture): void {
  TexturePool.returnTexture(texture)
}

/**
 * GLSL for consumers: declares the blurred sampler and reads it.
 *
 * The blurred texture is a same-size pooled sibling of the filter's own input,
 * so it shares the input's UV space and `uInputClamp` exactly — no remapping.
 */
export const GLSL_GAUSSIAN_BLUR_SAMPLE = `
uniform sampler2D uBlurTexture;

vec4 hsBlurTexel(vec2 uv, vec4 clampRect) {
    return texture(uBlurTexture, clamp(uv, clampRect.xy, clampRect.zw));
}

float hsBlurAlpha(vec2 uv, vec4 clampRect) {
    return hsBlurTexel(uv, clampRect).a;
}

/** Coverage-weighted mean colour, un-premultiplied. */
vec3 hsBlurRgb(vec2 uv, vec4 clampRect) {
    vec4 c = hsBlurTexel(uv, clampRect);
    return c.a > 1e-5 ? c.rgb / c.a : c.rgb;
}
`

/** Point a consumer filter at a blurred texture produced by `renderGaussianBlur`. */
export function bindGaussianBlur(filter: Filter, blurred: Texture): void {
  const resources = filter.resources as Record<string, unknown>
  resources.uBlurTexture = blurred.source
  resources.uBlurSampler = blurred.source.style
}

/** Resource entries every blur consumer must declare. */
export function gaussianBlurResources(): Record<string, unknown> {
  return {
    uBlurTexture: Texture.EMPTY.source,
    uBlurSampler: Texture.EMPTY.source.style,
  }
}

/**
 * Run `draw` with a blur of `sizePassPixels` bound to `filter`. Sizes arrive in
 * pass pixels (already multiplied by the render-pass scale); the kernel works
 * in the input's device texels.
 */
export function withGaussianBlur(
  filter: Filter,
  filterManager: FilterSystem,
  input: Texture,
  sizePassPixels: number,
  draw: () => void,
  sigmaPerUnit = SIGMA_PER_SIZE,
): void {
  const sigma =
    Math.max(sizePassPixels, 0) * sigmaPerUnit * input.source._resolution
  const blurred = renderGaussianBlur(filterManager, input, sigma)
  bindGaussianBlur(filter, blurred)
  draw()
  releaseGaussianBlur(blurred)
}
