import { Filter, GlProgram } from 'pixi.js'
import { DEFAULT_FILTER_VERT } from '../effects/filters/defaultFilterVert'

/**
 * Extra filter bounds so MSAA coverage samples are not clipped at the RT edge.
 * Main framebuffer stays `antialias: false` (SPEC §3.1); only this offscreen
 * pass is multisampled.
 */
export const SHAPE_AA_PADDING = 1

const PASSTHROUGH_FRAG = `in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
void main(void) {
    finalColor = texture(uTexture, vTextureCoord);
}
`

/** Identity filter whose only job is to host an MSAA'd intermediate RT. */
export class ShapeEdgeAAFilter extends Filter {
  constructor() {
    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: PASSTHROUGH_FRAG,
        name: 'hs-shape-edge-aa',
      }),
      antialias: 'on',
      padding: SHAPE_AA_PADDING,
    })
  }
}

/**
 * Enable offscreen MSAA on a filter chain (FilterSystem disables MSAA if any
 * filter is `'off'`).
 */
export function applyShapeEdgeAntialiasFlags(filters: Filter[]): void {
  for (const filter of filters) {
    filter.antialias = 'on'
  }
  const first = filters[0]
  if (first) {
    first.padding = Math.max(first.padding ?? 0, SHAPE_AA_PADDING)
  }
}

/**
 * Force shape layers through an antialiased offscreen filter RT.
 *
 * Pixi's filter system rasterizes the display object (with world transform)
 * into a screen-aligned texture; with `antialias: 'on'` that texture is MSAA'd,
 * so rotated/zoomed vector edges get coverage AA without enabling framebuffer
 * MSAA. Overlay handles stay on a separate pass and remain crisp.
 *
 * `createPassthrough` is injectable so unit tests can avoid constructing GL programs.
 */
export function withShapeEdgeAntialias(
  filters: Filter[] | null | undefined,
  createPassthrough: () => Filter = () => new ShapeEdgeAAFilter(),
): Filter[] {
  const list =
    filters != null && filters.length > 0
      ? filters.slice()
      : [createPassthrough()]

  applyShapeEdgeAntialiasFlags(list)
  return list
}

/** Test helper: every filter in the chain requests offscreen MSAA. */
export function shapeFiltersHaveEdgeAntialias(
  filters: Filter[] | null | undefined,
): boolean {
  if (!filters?.length) return false
  return filters.every((f) => f.antialias === 'on')
}
