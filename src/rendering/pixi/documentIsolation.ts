import { Filter, GlProgram } from 'pixi.js'
import { DEFAULT_FILTER_VERT } from '../effects/filters/defaultFilterVert'

const PASSTHROUGH_FRAG = `in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
void main(void) {
    finalColor = texture(uTexture, vTextureCoord);
}
`

/**
 * Identity filter whose only job is to give the document its own framebuffer.
 *
 * Its region is the tight union of the layer bounds — Pixi's `FilterEffect` has
 * no `addBounds`, so a child's own filter padding never widens its parent's
 * region. Without a margin here every outward layer effect is cut off at the
 * document content bounds when it lands in this texture, which is the straight
 * edge you see around a big Stroke or Drop Shadow. The margin is set per sync
 * from the enclosed layers (see `PixiRenderBackend.syncIsolationPadding`).
 */
export class DocumentIsolationFilter extends Filter {
  constructor() {
    super({
      glProgram: GlProgram.from({
        vertex: DEFAULT_FILTER_VERT,
        fragment: PASSTHROUGH_FRAG,
        name: 'hs-document-isolation',
      }),
      padding: 0,
    })
  }
}

/**
 * Isolates document compositing from the checkerboard drawn beneath it.
 *
 * The checkerboard sprite is a sibling of the content in `documentLayer`, so
 * both land in the same framebuffer. Pixi 8 blend modes read that framebuffer:
 * native equations (`multiply`, `screen`, `add`, ...) blend against whatever
 * the GPU already has in the destination — the checkerboard, wherever the
 * document is transparent — and filter-based advanced blends copy the bound
 * framebuffer wholesale (`FilterSystem.getBackTexture` →
 * `renderTarget.copyToTexture`).
 *
 * A render group does NOT help: `RenderGroupPipe._executeDirect` replays the
 * group's instructions into the *same* framebuffer. Only a real render target
 * switch isolates, and a filter is the cheapest one Pixi offers — a filtered
 * container is rendered into a freshly cleared input texture
 * (`FilterSystem` binds `filterData.inputTexture` with `clear: true`), so the
 * layers blend against transparency and the finished document composites over
 * the checkerboard in one draw.
 *
 * `createPassthrough` is injectable so unit tests avoid constructing GL programs.
 */
export function documentIsolationFilters(
  createPassthrough: () => Filter = () => new DocumentIsolationFilter(),
): Filter[] {
  return [createPassthrough()]
}
