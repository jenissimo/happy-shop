import {
  Filter,
  GlProgram,
  Texture,
  UniformGroup,
  type FilterSystem,
  type RenderSurface,
} from 'pixi.js'
import type {
  RenderContourPreset,
  RenderLayerTransform,
  RenderPatternKind,
} from '../../contracts/RenderDocumentView'
import {
  bevelTechniqueToUniform,
  type BevelTechnique,
} from '../bevelTechnique'
import { DEFAULT_FILTER_VERT } from './defaultFilterVert'
import { PATTERN_GLSL } from '../patterns'
import {
  gaussianBlurResources,
  GLSL_GAUSSIAN_BLUR_SAMPLE,
  withGaussianBlur,
} from './separableGaussian'
import { blendModeToUniform, GLSL_BLEND_MODES } from './shaderCommon'

const FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec3 uHighlight;
uniform vec3 uShadow;
uniform float uHighlightOpacity;
uniform float uShadowOpacity;
uniform float uSize;
uniform float uDepth;
uniform float uAngle;
uniform float uAltitude;
uniform float uDirection; // 1=up, -1=down
uniform float uStyle; // 0=inner, 1=outer, 2=emboss, 3=pillow
uniform float uHighlightMode;
uniform float uShadowMode;
uniform float uContourEnabled;
uniform float uContour;
uniform float uContourRange;
uniform float uContourAntiAliased;
uniform float uTextureEnabled;
uniform float uTexturePattern;
uniform float uTextureScale;
uniform float uTextureDepth;
uniform float uTextureInvert;
uniform float uTextureAlignWithLayer;
uniform vec2 uTextureDocumentXAxis;
uniform vec2 uTextureDocumentYAxis;
uniform vec2 uTextureDocumentOffset;
uniform float uTechnique; // 0=smooth, 1=chisel-hard, 2=chisel-soft

${GLSL_BLEND_MODES}
${GLSL_GAUSSIAN_BLUR_SAMPLE}
${PATTERN_GLSL}

float hsBevelHeight(float alpha) {
    float a = clamp(alpha, 0.0, 1.0);
    if (uTechnique < 0.5) return a;
    float steps = max(4.0, uSize * 0.45);
    float scaled = a * steps;
    float band = floor(scaled + 0.0001) / steps;
    if (uTechnique < 1.5) return band;
    float frac = scaled - floor(scaled);
    float eased = frac * frac * (3.0 - 2.0 * frac);
    return band + eased / steps;
}

/**
 * Bevel height at uv. The height field is the Gaussian-blurred alpha, so the
 * ramp between "outside" and "inside" is continuous over the whole Size; taking
 * the gradient of raw alpha instead only ever saw the shape's own hard edge and
 * quantised the lighting into bands.
 */
float hsHeightAt(vec2 uv) {
    return hsBevelHeight(hsBlurAlpha(uv, uInputClamp));
}

float hsContour(float t, float preset) {
    t = clamp(t, 0.0, 1.0);
    float value = t;
    if (preset >= 0.5 && preset < 1.5) value = smoothstep(0.0, 1.0, t); // gaussian
    else if (preset < 2.5) value = 1.0 - abs(2.0 * t - 1.0); // cone
    else if (preset < 3.5) value = abs(2.0 * t - 1.0); // inverted cone
    else if (preset < 4.5) value = 1.0 - abs(4.0 * fract(t) - 2.0); // ring
    else if (preset < 5.5) value = 1.0 - abs(8.0 * fract(t) - 4.0); // double ring
    else if (preset < 6.5) value = 0.5 + 0.5 * sin((t - 0.5) * 3.14159265); // rolling slope
    else if (preset < 7.5) value = floor(t * 4.0 + 0.5) / 4.0; // rounded steps
    else value = fract(t * 4.0); // sawtooth
    return clamp(value, 0.0, 1.0);
}

void main(void)
{
    vec2 px = uInputSize.zw;
    vec4 src = texture(uTexture, vTextureCoord);
    if (src.a <= 0.001 && uStyle < 0.5) {
        finalColor = src;
        return;
    }

    float size = max(uSize, 1.0);
    float hL = hsHeightAt(vTextureCoord + vec2(-size, 0.0) * px);
    float hR = hsHeightAt(vTextureCoord + vec2( size, 0.0) * px);
    float hU = hsHeightAt(vTextureCoord + vec2(0.0, -size) * px);
    float hD = hsHeightAt(vTextureCoord + vec2(0.0,  size) * px);
    vec2 grad = vec2(hR - hL, hD - hU) * uDirection;

    if (uTextureEnabled > 0.5) {
        vec2 point = vTextureCoord * uInputSize.xy;
        if (uTextureAlignWithLayer < 0.5) {
            point = uTextureDocumentOffset
                + point.x * uTextureDocumentXAxis
                + point.y * uTextureDocumentYAxis;
        }
        vec2 texStep = vec2(1.0, 1.0);
        float tL = hsSamplePattern(point - vec2(texStep.x, 0.0), uTextureScale, 0.0, uTexturePattern, uTextureInvert, vec2(0.0));
        float tR = hsSamplePattern(point + vec2(texStep.x, 0.0), uTextureScale, 0.0, uTexturePattern, uTextureInvert, vec2(0.0));
        float tU = hsSamplePattern(point - vec2(0.0, texStep.y), uTextureScale, 0.0, uTexturePattern, uTextureInvert, vec2(0.0));
        float tD = hsSamplePattern(point + vec2(0.0, texStep.y), uTextureScale, 0.0, uTexturePattern, uTextureInvert, vec2(0.0));
        grad += vec2(tR - tL, tD - tU) * (uTextureDepth / 100.0) * 0.35 * uDirection;
    }

    float ang = radians(uAngle);
    float alt = radians(uAltitude);
    vec3 light = normalize(vec3(cos(ang) * cos(alt), sin(ang) * cos(alt), sin(alt)));
    float depthScale = (uDepth / 100.0) * 1.35;
    vec3 normal = normalize(vec3(-grad.x * depthScale, -grad.y * depthScale, 1.0));
    float ndotl = dot(normal, light);

    // Soft highlight/shadow separation; chisel uses tighter ramps for facet edges.
    float hiEdge = uTechnique < 0.5 ? 0.85 : (uTechnique < 1.5 ? 0.28 : 0.48);
    float hiRaw = smoothstep(-0.05, hiEdge, ndotl);
    float shRaw = smoothstep(-0.05, hiEdge, -ndotl);
    if (uContourEnabled > 0.5) {
        float range = clamp(uContourRange / 100.0, 0.0, 1.0);
        float hiContour = hsContour(hiRaw, uContour);
        float shContour = hsContour(shRaw, uContour);
        // Range blends the contour from linear (0%) to full strength (100%).
        hiRaw = mix(hiRaw, hiContour, range);
        shRaw = mix(shRaw, shContour, range);
        if (uContourAntiAliased > 0.5) {
            hiRaw = smoothstep(0.0, 1.0, hiRaw);
            shRaw = smoothstep(0.0, 1.0, shRaw);
        }
    }
    float hi = pow(hiRaw, 1.35) * uHighlightOpacity;
    float sh = pow(shRaw, 1.1) * uShadowOpacity * 0.92;

    // Outer bevel: light outside alpha; pillow flips.
    if (uStyle > 0.5 && uStyle < 1.5) {
        float edge = abs(hR - hL) + abs(hD - hU);
        edge = smoothstep(0.0, uTechnique < 0.5 ? 0.35 : 0.22, edge);
        hi *= edge;
        sh *= edge;
    }
    if (uStyle > 2.5) {
        float t = hi;
        hi = sh;
        sh = t;
    }

    vec3 lit = src.a > 1e-5 ? src.rgb / src.a : src.rgb;
    lit = hsBlendMix(uHighlightMode, lit, uHighlight, clamp(hi, 0.0, 1.0));
    lit = hsBlendMix(uShadowMode, lit, uShadow, clamp(sh, 0.0, 1.0));
    finalColor = vec4(lit * src.a, src.a);
}
`

export type BevelEmbossFilterOptions = {
  highlightColor?: [number, number, number]
  shadowColor?: [number, number, number]
  highlightOpacity?: number
  shadowOpacity?: number
  size?: number
  depth?: number
  angle?: number
  altitude?: number
  direction?: 'up' | 'down'
  technique?: BevelTechnique
  style?:
    | 'outer-bevel'
    | 'inner-bevel'
    | 'emboss'
    | 'pillow-emboss'
    | 'stroke-emboss'
  highlightMode?: string
  shadowMode?: string
  contourEnabled?: boolean
  contour?: RenderContourPreset
  contourRange?: number
  contourAntiAliased?: boolean
  textureEnabled?: boolean
  texturePattern?: RenderPatternKind
  textureScale?: number
  textureDepth?: number
  textureInvert?: boolean
  textureAlignWithLayer?: boolean
  /**
   * Maps filter-input pixels into document pixels. Required for a texture whose
   * origin is the document rather than its layer.
   */
  textureDocumentTransform?: DocumentTextureTransform
  padding?: number
}

/**
 * Affine map from the filter's input pixel coordinates to document pixels.
 * `documentPoint = offset + point.x * xAxis + point.y * yAxis`.
 */
export type DocumentTextureTransform = {
  xAxis: [number, number]
  yAxis: [number, number]
  offset: [number, number]
}

/**
 * Build the document-space map for a Pixi layer. `localOrigin` is the number
 * of pixels before the actual layer content in the filter input (edge/filter
 * padding), so document coordinate (0, 0) remains anchored at the layer's
 * unpadded local origin.
 */
export function documentTextureTransformForLayer(
  transform: RenderLayerTransform,
  localOriginX = 0,
  localOriginY = 0,
): DocumentTextureTransform {
  const rotation = (transform.rotationDeg * Math.PI) / 180
  const skewX = (transform.skewXDeg * Math.PI) / 180
  const skewY = (transform.skewYDeg * Math.PI) / 180
  const xAxis: [number, number] = [
    Math.cos(rotation + skewY) * transform.scaleX,
    Math.sin(rotation + skewY) * transform.scaleX,
  ]
  const yAxis: [number, number] = [
    -Math.sin(rotation - skewX) * transform.scaleY,
    Math.cos(rotation - skewX) * transform.scaleY,
  ]
  const originX = transform.pivotX + localOriginX
  const originY = transform.pivotY + localOriginY
  return {
    xAxis,
    yAxis,
    offset: [
      transform.x - originX * xAxis[0] - originY * yAxis[0],
      transform.y - originX * xAxis[1] - originY * yAxis[1],
    ],
  }
}

function styleToUniform(
  style: BevelEmbossFilterOptions['style'],
): number {
  switch (style) {
    case 'outer-bevel':
      return 1
    case 'emboss':
      return 2
    case 'pillow-emboss':
      return 3
    case 'stroke-emboss':
      return 2
    default:
      return 0
  }
}

function contourToUniform(contour: RenderContourPreset | undefined): number {
  return [
    'linear',
    'gaussian',
    'cone',
    'cone-inverted',
    'ring',
    'ring-double',
    'rolling-slope',
    'rounded-steps',
    'sawtooth',
  ].indexOf(contour ?? 'linear')
}

function patternToUniform(pattern: RenderPatternKind | undefined): number {
  return ['checker', 'stripes', 'dots', 'noise'].indexOf(pattern ?? 'checker')
}

/** GPU bevel & emboss — soft multi-scale lighting + highlight/shadow blend modes. */
export class BevelEmbossFilter extends Filter {
  constructor(options: BevelEmbossFilterOptions = {}) {
    const hi = options.highlightColor ?? [1, 1, 1]
    const sh = options.shadowColor ?? [0, 0, 0]
    const textureTransform = options.textureDocumentTransform ?? {
      xAxis: [1, 0] as [number, number],
      yAxis: [0, 1] as [number, number],
      offset: [0, 0] as [number, number],
    }
    const uniforms = new UniformGroup({
      uHighlight: { value: hi, type: 'vec3<f32>' },
      uShadow: { value: sh, type: 'vec3<f32>' },
      uHighlightOpacity: { value: options.highlightOpacity ?? 0.75, type: 'f32' },
      uShadowOpacity: { value: options.shadowOpacity ?? 0.75, type: 'f32' },
      uSize: { value: options.size ?? 5, type: 'f32' },
      uDepth: { value: options.depth ?? 100, type: 'f32' },
      uAngle: { value: options.angle ?? 120, type: 'f32' },
      uAltitude: { value: options.altitude ?? 30, type: 'f32' },
      uDirection: { value: options.direction === 'down' ? -1 : 1, type: 'f32' },
      uTechnique: {
        value: bevelTechniqueToUniform(options.technique),
        type: 'f32',
      },
      uStyle: { value: styleToUniform(options.style), type: 'f32' },
      uHighlightMode: {
        value: blendModeToUniform(options.highlightMode ?? 'screen'),
        type: 'f32',
      },
      uShadowMode: {
        value: blendModeToUniform(options.shadowMode ?? 'multiply'),
        type: 'f32',
      },
      uContourEnabled: { value: options.contourEnabled ? 1 : 0, type: 'f32' },
      uContour: { value: contourToUniform(options.contour), type: 'f32' },
      uContourRange: { value: options.contourRange ?? 50, type: 'f32' },
      uContourAntiAliased: {
        value: options.contourAntiAliased ? 1 : 0,
        type: 'f32',
      },
      uTextureEnabled: { value: options.textureEnabled ? 1 : 0, type: 'f32' },
      uTexturePattern: {
        value: patternToUniform(options.texturePattern),
        type: 'f32',
      },
      uTextureScale: { value: options.textureScale ?? 100, type: 'f32' },
      uTextureDepth: { value: options.textureDepth ?? 100, type: 'f32' },
      uTextureInvert: { value: options.textureInvert ? 1 : 0, type: 'f32' },
      uTextureAlignWithLayer: {
        value: options.textureAlignWithLayer === false ? 0 : 1,
        type: 'f32',
      },
      uTextureDocumentXAxis: { value: textureTransform.xAxis, type: 'vec2<f32>' },
      uTextureDocumentYAxis: { value: textureTransform.yAxis, type: 'vec2<f32>' },
      uTextureDocumentOffset: { value: textureTransform.offset, type: 'vec2<f32>' },
    })

    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: FRAGMENT,
        name: 'hs-bevel-emboss-filter',
      }),
      resources: { bevelUniforms: uniforms, ...gaussianBlurResources() },
      padding: options.padding ?? 0,
    })
  }

  override apply(
    filterManager: FilterSystem,
    input: Texture,
    output: RenderSurface,
    clearMode: boolean,
  ): void {
    const u = this.resources.bevelUniforms.uniforms as { uSize: number }
    withGaussianBlur(this, filterManager, input, u.uSize, () => {
      filterManager.applyFilter(this, input, output, clearMode)
    })
  }

  setParams(options: BevelEmbossFilterOptions = {}): void {
    const u = this.resources.bevelUniforms.uniforms as {
      uHighlight: number[]
      uShadow: number[]
      uHighlightOpacity: number
      uShadowOpacity: number
      uSize: number
      uDepth: number
      uAngle: number
      uAltitude: number
      uDirection: number
      uTechnique: number
      uStyle: number
      uHighlightMode: number
      uShadowMode: number
      uContourEnabled: number
      uContour: number
      uContourRange: number
      uContourAntiAliased: number
      uTextureEnabled: number
      uTexturePattern: number
      uTextureScale: number
      uTextureDepth: number
      uTextureInvert: number
      uTextureAlignWithLayer: number
      uTextureDocumentXAxis: number[]
      uTextureDocumentYAxis: number[]
      uTextureDocumentOffset: number[]
    }
    if (options.highlightColor) {
      u.uHighlight[0] = options.highlightColor[0]!
      u.uHighlight[1] = options.highlightColor[1]!
      u.uHighlight[2] = options.highlightColor[2]!
    }
    if (options.shadowColor) {
      u.uShadow[0] = options.shadowColor[0]!
      u.uShadow[1] = options.shadowColor[1]!
      u.uShadow[2] = options.shadowColor[2]!
    }
    if (options.highlightOpacity != null) u.uHighlightOpacity = options.highlightOpacity
    if (options.shadowOpacity != null) u.uShadowOpacity = options.shadowOpacity
    if (options.size != null) u.uSize = options.size
    if (options.depth != null) u.uDepth = options.depth
    if (options.angle != null) u.uAngle = options.angle
    if (options.altitude != null) u.uAltitude = options.altitude
    if (options.direction != null) u.uDirection = options.direction === 'down' ? -1 : 1
    if (options.technique != null) u.uTechnique = bevelTechniqueToUniform(options.technique)
    if (options.style != null) u.uStyle = styleToUniform(options.style)
    if (options.highlightMode != null) {
      u.uHighlightMode = blendModeToUniform(options.highlightMode)
    }
    if (options.shadowMode != null) u.uShadowMode = blendModeToUniform(options.shadowMode)
    if (options.contourEnabled != null) u.uContourEnabled = options.contourEnabled ? 1 : 0
    if (options.contour != null) u.uContour = contourToUniform(options.contour)
    if (options.contourRange != null) u.uContourRange = options.contourRange
    if (options.contourAntiAliased != null) {
      u.uContourAntiAliased = options.contourAntiAliased ? 1 : 0
    }
    if (options.textureEnabled != null) u.uTextureEnabled = options.textureEnabled ? 1 : 0
    if (options.texturePattern != null) {
      u.uTexturePattern = patternToUniform(options.texturePattern)
    }
    if (options.textureScale != null) u.uTextureScale = options.textureScale
    if (options.textureDepth != null) u.uTextureDepth = options.textureDepth
    if (options.textureInvert != null) u.uTextureInvert = options.textureInvert ? 1 : 0
    if (options.textureAlignWithLayer != null) {
      u.uTextureAlignWithLayer = options.textureAlignWithLayer === false ? 0 : 1
    }
    if (options.textureDocumentTransform) {
      u.uTextureDocumentXAxis[0] = options.textureDocumentTransform.xAxis[0]
      u.uTextureDocumentXAxis[1] = options.textureDocumentTransform.xAxis[1]
      u.uTextureDocumentYAxis[0] = options.textureDocumentTransform.yAxis[0]
      u.uTextureDocumentYAxis[1] = options.textureDocumentTransform.yAxis[1]
      u.uTextureDocumentOffset[0] = options.textureDocumentTransform.offset[0]
      u.uTextureDocumentOffset[1] = options.textureDocumentTransform.offset[1]
    }
    if (options.padding != null) this.padding = options.padding
  }
}
