import { Filter, GlProgram, UniformGroup } from 'pixi.js'
import { DEFAULT_FILTER_VERT } from './defaultFilterVert'
import { blendModeToUniform, GLSL_BLEND_MODES } from './shaderCommon'

const FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
const int MAX_GRADIENT_STOPS = 16;
uniform vec4 uStops[MAX_GRADIENT_STOPS]; // offset, r, g, b
uniform float uStopOpacity[MAX_GRADIENT_STOPS];
uniform int uStopCount;
uniform float uOpacity;
uniform float uAngle;
uniform float uScale;
uniform float uStyle; // 0=linear, 1=radial, 2=angle, 3=reflected, 4=diamond
uniform float uReverse;
uniform vec2 uOffset;
uniform float uBlendMode;

${GLSL_BLEND_MODES}

vec4 sampleGradient(float t) {
    vec4 previous = uStops[0];
    float previousOpacity = uStopOpacity[0];
    for (int i = 1; i < MAX_GRADIENT_STOPS; i++) {
        if (i >= uStopCount) break;
        vec4 next = uStops[i];
        float nextOpacity = uStopOpacity[i];
        if (t <= next.x) {
            float span = max(next.x - previous.x, 0.00001);
            float localT = clamp((t - previous.x) / span, 0.0, 1.0);
            return vec4(mix(previous.yzw, next.yzw, localT), mix(previousOpacity, nextOpacity, localT));
        }
        previous = next;
        previousOpacity = nextOpacity;
    }
    return vec4(previous.yzw, previousOpacity);
}

void main(void)
{
    vec4 src = texture(uTexture, vTextureCoord);
    if (src.a <= 0.001) {
        finalColor = src;
        return;
    }

    vec2 uv = vTextureCoord - 0.5 - uOffset * 0.01;
    float ang = radians(uAngle);
    float c = cos(ang);
    float s = sin(ang);
    vec2 rot = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
    rot /= max(uScale / 100.0, 0.01);

    float t = 0.0;
    if (uStyle < 0.5) {
        t = rot.x + 0.5;
    } else if (uStyle < 1.5) {
        t = length(rot) * 1.414;
    } else if (uStyle < 2.5) {
        t = atan(rot.y, rot.x) / 6.2831853 + 0.5;
    } else if (uStyle < 3.5) {
        t = abs(rot.x) * 2.0;
    } else {
        t = (abs(rot.x) + abs(rot.y));
    }
    t = clamp(t, 0.0, 1.0);
    if (uReverse > 0.5) t = 1.0 - t;

    vec4 grad = sampleGradient(t);
    float a = uOpacity * grad.a;
    vec3 srcRgb = src.a > 1e-5 ? src.rgb / src.a : src.rgb;
    vec3 outRgb = hsBlendMix(uBlendMode, srcRgb, grad.rgb, a);
    finalColor = vec4(outRgb * src.a, src.a);
}
`

export type GradientOverlayFilterOptions = {
  /** Stops are normalized, sorted by offset, and capped at 16 for GPU parity. */
  stops?: ReadonlyArray<{
    offset: number
    color: [number, number, number]
    opacity: number
  }>
  opacity?: number
  angle?: number
  scale?: number
  style?: 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond'
  reverse?: boolean
  offsetX?: number
  offsetY?: number
  blendMode?: string
  padding?: number
}

function styleUniform(style: GradientOverlayFilterOptions['style']): number {
  switch (style) {
    case 'radial':
      return 1
    case 'angle':
      return 2
    case 'reflected':
      return 3
    case 'diamond':
      return 4
    default:
      return 0
  }
}

const MAX_GRADIENT_STOPS = 16

function normalizedStops(
  stops: GradientOverlayFilterOptions['stops'],
): Array<{ offset: number; color: [number, number, number]; opacity: number }> {
  const source = stops?.length
    ? stops
    : [
        { offset: 0, color: [0, 0, 0] as [number, number, number], opacity: 1 },
        { offset: 1, color: [1, 1, 1] as [number, number, number], opacity: 1 },
      ]
  const sorted = [...source]
    .sort((a, b) => a.offset - b.offset)
    .slice(0, MAX_GRADIENT_STOPS)
    .map((stop) => ({
      offset: Math.max(0, Math.min(1, stop.offset)),
      color: stop.color,
      opacity: Math.max(0, Math.min(1, stop.opacity)),
    }))
  return sorted.length >= 2 ? sorted : [...sorted, { ...sorted[0]!, offset: 1 }]
}

/** GPU gradient overlay — samples every persisted stop (up to 16) + blend modes. */
export class GradientOverlayFilter extends Filter {
  constructor(options: GradientOverlayFilterOptions = {}) {
    const stops = normalizedStops(options.stops)
    const packedStops = new Float32Array(MAX_GRADIENT_STOPS * 4)
    const packedOpacity = new Float32Array(MAX_GRADIENT_STOPS)
    for (let i = 0; i < MAX_GRADIENT_STOPS; i++) {
      const stop = stops[Math.min(i, stops.length - 1)]!
      packedStops.set([stop.offset, ...stop.color], i * 4)
      packedOpacity[i] = stop.opacity
    }
    const uniforms = new UniformGroup({
      uStops: { value: packedStops, type: 'array<vec4<f32>, 16>' },
      uStopOpacity: { value: packedOpacity, type: 'array<f32, 16>' },
      uStopCount: { value: stops.length, type: 'i32' },
      uOpacity: { value: options.opacity ?? 1, type: 'f32' },
      uAngle: { value: options.angle ?? 90, type: 'f32' },
      uScale: { value: options.scale ?? 100, type: 'f32' },
      uStyle: { value: styleUniform(options.style), type: 'f32' },
      uReverse: { value: options.reverse ? 1 : 0, type: 'f32' },
      uOffset: {
        value: [options.offsetX ?? 0, options.offsetY ?? 0],
        type: 'vec2<f32>',
      },
      uBlendMode: { value: blendModeToUniform(options.blendMode), type: 'f32' },
    })

    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-gradient-overlay-filter',
      }),
      resources: { gradientOverlayUniforms: uniforms },
      padding: options.padding ?? 0,
    })
  }

  setParams(options: GradientOverlayFilterOptions = {}): void {
    const u = this.resources.gradientOverlayUniforms.uniforms as {
      uStops: Float32Array
      uStopOpacity: Float32Array
      uStopCount: number
      uOpacity: number
      uAngle: number
      uScale: number
      uStyle: number
      uReverse: number
      uOffset: number[]
      uBlendMode: number
    }
    if (options.stops) {
      const stops = normalizedStops(options.stops)
      for (let i = 0; i < MAX_GRADIENT_STOPS; i++) {
        const stop = stops[Math.min(i, stops.length - 1)]!
        u.uStops.set([stop.offset, ...stop.color], i * 4)
        u.uStopOpacity[i] = stop.opacity
      }
      u.uStopCount = stops.length
    }
    if (options.opacity != null) u.uOpacity = options.opacity
    if (options.angle != null) u.uAngle = options.angle
    if (options.scale != null) u.uScale = options.scale
    if (options.style != null) u.uStyle = styleUniform(options.style)
    if (options.reverse != null) u.uReverse = options.reverse ? 1 : 0
    if (options.offsetX != null) u.uOffset[0] = options.offsetX
    if (options.offsetY != null) u.uOffset[1] = options.offsetY
    if (options.blendMode != null) u.uBlendMode = blendModeToUniform(options.blendMode)
    if (options.padding != null) this.padding = options.padding
  }
}
