/**
 * Alpha → euclidean distance field, by jump flooding.
 *
 * The dilation the outward FX need used to be a fixed ring of taps at radius
 * `size`: 16 samples around the circle plus 8 at half radius. The arc between
 * adjacent taps is `2 * size * sin(pi/16)`, so it exceeds a texel once `size`
 * passes ~3px and exceeds the glyph stem width around 20px — at which point the
 * "dilation" is visibly a fan of discrete copies of the shape rather than an
 * outline. No fixed tap budget fixes that; the budget has to grow with radius.
 *
 * A jump flood does that in log2(radius) passes of 9 taps, independent of how
 * the shape looks, and hands every consumer a single number — the signed
 * distance to the glyph outline — that Stroke, Outer Glow and Inner Glow can
 * each threshold their own way.
 *
 * Distances are in *device texels* of the filter texture throughout; consumers
 * convert their pass-pixel sizes with the input resolution.
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

/** Ceiling on the first jump; nothing can ask for a wider reach than the pad. */
const MAX_JUMP = 1024

/**
 * Jump sizes for a flood that has to resolve distances out to `radiusTexels`:
 * the next power of two at or above the radius, halving down to one texel.
 */
export function jumpFloodSteps(radiusTexels: number): number[] {
  const radius = Math.min(Math.max(radiusTexels, 1), MAX_JUMP)
  const steps: number[] = []
  for (let jump = 2 ** Math.ceil(Math.log2(radius)); jump >= 1; jump /= 2) {
    steps.push(jump)
  }
  return steps
}

/**
 * GLSL: pack/unpack a nearest-seed offset (in texels, relative to the reading
 * texel) into RGBA8 as two 16-bit fixed-point values, 1/16 texel steps over
 * ±2048.
 *
 * Relative offsets rather than absolute positions keep full precision no matter
 * how large the filter texture is, and make both degenerate byte patterns
 * harmless: all-zero (a cleared texel) and all-ones (the "no seed" marker) both
 * decode ~2048 texels away, further than any radius a consumer can ask about,
 * so they lose every `min` without needing a validity flag.
 */
export const GLSL_DISTANCE_FIELD = `
const float HS_DF_SCALE = 16.0;
const float HS_DF_BIAS = 32768.0;
const vec4 HS_DF_NONE = vec4(1.0);

vec4 hsDfPack(vec2 offset) {
    vec2 q = clamp(floor(offset * HS_DF_SCALE + HS_DF_BIAS + 0.5), 0.0, 65535.0);
    vec2 hi = floor(q / 256.0);
    vec2 lo = q - hi * 256.0;
    return vec4(hi.x, lo.x, hi.y, lo.y) / 255.0;
}

vec2 hsDfUnpack(vec4 c) {
    vec4 b = floor(c * 255.0 + 0.5);
    vec2 q = vec2(b.x * 256.0 + b.y, b.z * 256.0 + b.w);
    return (q - HS_DF_BIAS) / HS_DF_SCALE;
}

/**
 * Nearest device-texel centre for a UV. Packed bytes must never be linearly
 * filtered, and the pooled filter textures do not use nearest sampling.
 */
vec2 hsDfSnap(vec2 uv, vec4 inputPixel) {
    return (floor(uv * inputPixel.xy) + 0.5) * inputPixel.zw;
}
`

/**
 * GLSL for consumers: declares the field sampler and reads a signed distance in
 * device texels — negative inside the shape, positive outside.
 */
export const GLSL_DISTANCE_FIELD_SAMPLE = `
uniform sampler2D uFieldTexture;
uniform vec2 uFieldPixel;

${GLSL_DISTANCE_FIELD}

float hsFieldDistance(vec2 uv, vec4 inputPixel, float shapeAlpha) {
    vec2 fieldUv = (floor(uv * inputPixel.xy) + 0.5) / uFieldPixel;
    float d = length(hsDfUnpack(texture(uFieldTexture, fieldUv)));
    return shapeAlpha >= 0.5 ? -d : d;
}
`

const SEED_FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uInputPixel;
uniform vec4 uInputClamp;

${GLSL_DISTANCE_FIELD}

float alphaAt(vec2 uv) {
    return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw)).a;
}

void main(void)
{
    vec2 px = uInputPixel.zw;
    vec2 uv = hsDfSnap(vTextureCoord, uInputPixel);
    float a = alphaAt(uv);
    // Central differences give the local coverage slope; on an antialiased edge
    // that slope is the true one, so (0.5 - a) / |grad| is the sub-texel signed
    // distance to the a = 0.5 contour. Seeding the contour instead of the texel
    // centre is what keeps a 1px stroke as smooth as the glyph it follows.
    vec2 g = vec2(
        0.5 * (alphaAt(uv + vec2(px.x, 0.0)) - alphaAt(uv - vec2(px.x, 0.0))),
        0.5 * (alphaAt(uv + vec2(0.0, px.y)) - alphaAt(uv - vec2(0.0, px.y)))
    );
    float len = length(g);
    // Flat neighbourhoods are solid interior or empty space: no contour here.
    if (len < 0.004) {
        finalColor = HS_DF_NONE;
        return;
    }
    float d = (0.5 - a) / len;
    if (abs(d) > 1.5) {
        finalColor = HS_DF_NONE;
        return;
    }
    finalColor = hsDfPack(g * (d / len));
}
`

const STEP_FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uInputPixel;
uniform vec4 uInputClamp;
uniform float uJump;

${GLSL_DISTANCE_FIELD}

void main(void)
{
    vec2 px = uInputPixel.zw;
    vec2 uv = hsDfSnap(vTextureCoord, uInputPixel);
    vec2 best = hsDfUnpack(texture(uTexture, uv));
    float bestD = dot(best, best);

    for (float y = -1.0; y <= 1.0; y += 1.0) {
        for (float x = -1.0; x <= 1.0; x += 1.0) {
            vec2 sampleUv = clamp(uv + vec2(x, y) * uJump * px, uInputClamp.xy, uInputClamp.zw);
            sampleUv = hsDfSnap(sampleUv, uInputPixel);
            // Clamping at the border lands on a different texel than asked for,
            // so derive the step actually taken instead of assuming the jump.
            vec2 taken = (sampleUv - uv) * uInputPixel.xy;
            vec2 candidate = hsDfUnpack(texture(uTexture, sampleUv)) + taken;
            float d = dot(candidate, candidate);
            if (d < bestD) {
                bestD = d;
                best = candidate;
            }
        }
    }

    finalColor = hsDfPack(best);
}
`

class SeedFilter extends Filter {
  constructor() {
    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: SEED_FRAGMENT,
        name: 'hs-df-seed',
      }),
      resources: {},
      padding: 0,
    })
  }
}

class StepFilter extends Filter {
  constructor() {
    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: STEP_FRAGMENT,
        name: 'hs-df-step',
      }),
      resources: {
        dfStepUniforms: new UniformGroup({
          uJump: { value: 1, type: 'f32' },
        }),
      },
      padding: 0,
    })
  }

  set jump(value: number) {
    ;(this.resources.dfStepUniforms.uniforms as { uJump: number }).uJump = value
  }
}

let seedFilter: SeedFilter | null = null
let stepFilter: StepFilter | null = null

/**
 * Distance field for `input`'s alpha, accurate out to `radiusTexels`.
 * The caller owns the returned texture and must hand it to
 * `releaseAlphaDistanceField`.
 *
 * The field stays bound to the consumer's second sampler until its `apply`
 * returns, and goes back to `TexturePool` still bound. That is safe only because
 * Pixi detaches a render target's colour textures from every texture unit at the
 * start of each pass (`GlRenderTargetAdaptor.startRenderPass`), so a texture
 * re-acquired from the pool can never be sampled and drawn into at once. Nothing
 * here may depend on that silently: `e2e/layer-fx-feedback.spec.ts` shadows the
 * real GL binding state and fails if any draw forms such a loop.
 */
export function renderAlphaDistanceField(
  filterManager: FilterSystem,
  input: Texture,
  radiusTexels: number,
): Texture {
  seedFilter ??= new SeedFilter()
  stepFilter ??= new StepFilter()

  let front = TexturePool.getSameSizeTexture(input)
  let back = TexturePool.getSameSizeTexture(input)
  seedFilter.apply(filterManager, input, front, true)

  for (const jump of jumpFloodSteps(radiusTexels)) {
    stepFilter.jump = jump
    stepFilter.apply(filterManager, front, back, true)
    const swap = front
    front = back
    back = swap
  }

  TexturePool.returnTexture(back)
  return front
}

export function releaseAlphaDistanceField(texture: Texture): void {
  TexturePool.returnTexture(texture)
}

/**
 * Point a consumer filter at a field texture. `uFieldPixel` is the field
 * source's device size, which need not match the input's.
 */
export function bindDistanceField(filter: Filter, field: Texture): void {
  const resources = filter.resources as Record<string, unknown>
  resources.uFieldTexture = field.source
  resources.uFieldSampler = field.source.style
  const uniforms = (filter.resources.fieldUniforms as UniformGroup).uniforms as {
    uFieldPixel: number[]
  }
  uniforms.uFieldPixel[0] = field.source.pixelWidth
  uniforms.uFieldPixel[1] = field.source.pixelHeight
}

/** Resource entries every distance-field consumer must declare. */
export function distanceFieldResources(): Record<string, unknown> {
  return {
    fieldUniforms: new UniformGroup({
      uFieldPixel: { value: [1, 1], type: 'vec2<f32>' },
    }),
    uFieldTexture: Texture.EMPTY.source,
    uFieldSampler: Texture.EMPTY.source.style,
  }
}
