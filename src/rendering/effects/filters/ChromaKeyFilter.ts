import { BufferImageSource, Filter, GlProgram, UniformGroup } from 'pixi.js'
import type { RenderChromaConnectivityMask } from '../../contracts/RenderDocumentView'
import { DEFAULT_FILTER_VERT } from './defaultFilterVert'

const FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec3 uKeyRgb;
uniform float uTolerance;
uniform float uSoftness;
uniform float uDespill;
uniform float uChoke;
uniform float uFloodMode;
uniform float uFloodMaskReady;
uniform sampler2D uFloodMaskTexture;

vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 rgbToLab(vec3 rgb) {
    vec3 lin = srgbToLinear(rgb);
    float x = lin.r * 0.4124564 + lin.g * 0.3575761 + lin.b * 0.1804375;
    float y = lin.r * 0.2126729 + lin.g * 0.7151522 + lin.b * 0.0721750;
    float z = lin.r * 0.0193339 + lin.g * 0.1191920 + lin.b * 0.9503041;
    vec3 xyz = vec3(x / 0.95047, y, z / 1.08883);
    vec3 f = mix(
        7.787 * xyz + 16.0 / 116.0,
        pow(xyz, vec3(1.0 / 3.0)),
        step(0.008856, xyz)
    );
    return vec3(116.0 * f.y - 16.0, 500.0 * (f.x - f.y), 200.0 * (f.y - f.z));
}

float keyedAlpha(vec4 src) {
    vec3 lab = rgbToLab(src.rgb);
    vec3 keyLab = rgbToLab(uKeyRgb);
    float dist = distance(lab, keyLab);
    float inner = uTolerance;
    float outer = uTolerance + uSoftness;
    if (dist <= inner) {
        return 0.0;
    }
    if (dist < outer) {
        float t = (dist - inner) / max(outer - inner, 1e-6);
        float s = t * t * (3.0 - 2.0 * t);
        return src.a * s;
    }
    return src.a;
}

float floodKeyedAlpha(vec4 src, vec2 uv) {
    if (uFloodMode > 0.5) {
        // While the worker result is pending, never substitute global-key
        // behavior. Once ready, nearest A8 samples gate the normal key curve.
        if (uFloodMaskReady < 0.5 || texture(uFloodMaskTexture, uv).r < 0.5) {
            return src.a;
        }
    }
    return keyedAlpha(src);
}

void main(void)
{
    vec4 src = texture(uTexture, vTextureCoord);
    float a = floodKeyedAlpha(src, vTextureCoord);
    float choke = clamp(floor(uChoke + 0.5), 0.0, 5.0);
    if (choke > 0.0) {
        vec2 px = 1.0 / vec2(textureSize(uTexture, 0));
        float eroded = 1.0;
        for (float y = -5.0; y <= 5.0; y += 1.0) {
            for (float x = -5.0; x <= 5.0; x += 1.0) {
                if (abs(x) > choke || abs(y) > choke) continue;
                vec2 sampleUv = vTextureCoord + vec2(x, y) * px;
                eroded = min(eroded, floodKeyedAlpha(texture(uTexture, sampleUv), sampleUv));
            }
        }
        a = eroded;
    }

    float srcA = max(src.a, 1e-6);
    float removed = clamp((src.a - a) / srcA, 0.0, 1.0);
    float foreground = max(1.0 - removed, 1e-5);
    vec3 straightRgb = src.rgb / srcA;
    vec3 unspilled = clamp((straightRgb - uKeyRgb * removed) / foreground, 0.0, 1.0);
    vec3 outRgb = mix(straightRgb, unspilled, clamp(uDespill, 0.0, 1.0)) * a;
    finalColor = vec4(outRgb, a);
}
`

export type ChromaKeyFilterOptions = {
  keyRgb?: [number, number, number]
  tolerance?: number
  softness?: number
  despill?: number
  choke?: number
  mode?: 'global' | 'flood'
  /** Worker-generated exact 4-connected A8 connectivity data. */
  connectivityMask?: RenderChromaConnectivityMask
  padding?: number
}

/** GPU CIE Lab chroma-key preview filter (SPECS/CHROMA-KEY-AND-TRIM.md). */
export class ChromaKeyFilter extends Filter {
  constructor(options: ChromaKeyFilterOptions = {}) {
    const keyRgb = options.keyRgb ?? [0, 1, 0]
    const tolerance = options.tolerance ?? 30
    const softness = options.softness ?? 30
    const padding = options.padding ?? 0
    const floodMask = createFloodMaskSource(options.connectivityMask)

    const uniforms = new UniformGroup({
      uKeyRgb: { value: [...keyRgb], type: 'vec3<f32>' },
      uTolerance: { value: tolerance, type: 'f32' },
      uSoftness: { value: softness, type: 'f32' },
      uDespill: { value: options.despill ?? 0.7, type: 'f32' },
      uChoke: { value: options.choke ?? 0, type: 'f32' },
      uFloodMode: { value: options.mode === 'flood' ? 1 : 0, type: 'f32' },
      uFloodMaskReady: { value: options.connectivityMask ? 1 : 0, type: 'f32' },
    })

    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-chroma-key-filter',
      }),
      resources: {
        chromaKeyUniforms: uniforms,
        uFloodMaskTexture: floodMask,
        uFloodMaskSampler: floodMask.style,
      },
      padding,
    })
  }

  setParams(options: ChromaKeyFilterOptions): void {
    const u = this.resources.chromaKeyUniforms.uniforms as {
      uKeyRgb: number[]
      uTolerance: number
      uSoftness: number
      uDespill: number
      uChoke: number
      uFloodMode: number
      uFloodMaskReady: number
    }
    if (options.keyRgb) {
      u.uKeyRgb[0] = options.keyRgb[0]!
      u.uKeyRgb[1] = options.keyRgb[1]!
      u.uKeyRgb[2] = options.keyRgb[2]!
    }
    if (options.tolerance != null) u.uTolerance = options.tolerance
    if (options.softness != null) u.uSoftness = options.softness
    if (options.despill != null) u.uDespill = options.despill
    if (options.choke != null) u.uChoke = options.choke
    if (options.mode != null) u.uFloodMode = options.mode === 'flood' ? 1 : 0
    if (options.connectivityMask != null) {
      const floodMask = createFloodMaskSource(options.connectivityMask)
      this.resources.uFloodMaskTexture = floodMask
      this.resources.uFloodMaskSampler = floodMask.style
      u.uFloodMaskReady = 1
    } else if (options.mode === 'flood') {
      u.uFloodMaskReady = 0
    }
    if (options.padding != null) this.padding = options.padding
  }
}

function createFloodMaskSource(mask: RenderChromaConnectivityMask | undefined): BufferImageSource {
  return new BufferImageSource({
    resource: mask?.data ?? new Uint8Array([0]),
    width: mask?.width ?? 1,
    height: mask?.height ?? 1,
    format: 'r8unorm',
    scaleMode: 'nearest',
    autoGenerateMipmaps: false,
    addressMode: 'clamp-to-edge',
  })
}
