import type { RenderPatternKind } from '../contracts/RenderDocumentView'

export const PATTERN_KINDS: readonly RenderPatternKind[] = [
  'checker',
  'stripes',
  'dots',
  'noise',
]

export type PatternSampleOptions = {
  kind: RenderPatternKind
  scale: number
  angle?: number
  invert?: boolean
  offsetX?: number
  offsetY?: number
}

function fract(value: number): number {
  return value - Math.floor(value)
}

function hash(x: number, y: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453)
}

/** Shared procedural pattern contract for CPU effects and UI swatches. */
export function samplePattern(
  x: number,
  y: number,
  options: PatternSampleOptions,
): number {
  const cell = Math.max(options.scale * 0.08, 2)
  const angle = ((options.angle ?? 0) * Math.PI) / 180
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const offsetX = options.offsetX ?? 0
  const offsetY = options.offsetY ?? 0
  const rx = (x + offsetX) * c - (y + offsetY) * s
  const ry = (x + offsetX) * s + (y + offsetY) * c
  const px = rx / cell
  const py = ry / cell
  let value: number
  switch (options.kind) {
    case 'stripes':
      value = fract(px) >= 0.5 ? 1 : 0
      break
    case 'dots': {
      const dx = fract(px) - 0.5
      const dy = fract(py) - 0.5
      value = Math.hypot(dx, dy) <= 0.35 ? 1 : 0
      break
    }
    case 'noise':
      value = hash(Math.floor(px), Math.floor(py))
      break
    default:
      value = (Math.floor(px) + Math.floor(py)) % 2 === 0 ? 0 : 1
  }
  return options.invert ? 1 - value : value
}

/** WebGL mirror of `samplePattern`; keep filter and swatch semantics in sync. */
export const PATTERN_GLSL = `
float hsPatternHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float hsSamplePattern(vec2 point, float scale, float angle, float pattern, float invert, vec2 offset) {
    float cell = max(scale * 0.08, 2.0);
    float radiansAngle = radians(angle);
    float c = cos(radiansAngle);
    float s = sin(radiansAngle);
    vec2 shifted = point + offset;
    vec2 coord = vec2(shifted.x * c - shifted.y * s, shifted.x * s + shifted.y * c) / cell;
    float value = 0.0;
    if (pattern < 0.5) {
        vec2 grid = floor(coord);
        value = mod(grid.x + grid.y, 2.0);
    } else if (pattern < 1.5) {
        value = step(0.5, fract(coord.x));
    } else if (pattern < 2.5) {
        vec2 local = fract(coord) - 0.5;
        value = step(length(local), 0.35);
    } else {
        value = hsPatternHash(floor(coord));
    }
    return invert > 0.5 ? 1.0 - value : value;
}`
