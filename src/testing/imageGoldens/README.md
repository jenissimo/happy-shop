# Image goldens (blend / FX)

CPU reference kernels in `src/rendering/effects/layerEffects.ts` (backed by
`imaging/worker/pixelScan.ts` for chroma) produce expected RGBA for small
fixtures. Tests compare against checked-in golden buffers with a documented
per-channel tolerance.

Full Layer Style param matrix + GPU/CPU fidelity: [`SPECS/LAYER-STYLES.md`](../../../SPECS/LAYER-STYLES.md).

## Tolerance

| Metric | Value | Notes |
|---|---|---|
| Max channel delta (`maxAbsDiff`) | **2** | 8-bit rounding / soft-edge |
| Mean absolute error (`meanAbsDiff`) | **0.5** | Across all channels including alpha |
| Exact match required for | solid fills, hard chroma clear | Soft blur/stroke edges use maxAbsDiff |

## CPU contract vs GPU preview (SPEC §21.6)

| Path | Role | Notes |
|---|---|---|
| **CPU kernels** | Export / goldens / worker | Source of truth for listed kernels. Chroma supports `global` + `flood`. |
| **GPU Pixi filters** | Interactive viewport preview | Gaussian soft edges + blend modes for most styles; see `SPECS/LAYER-STYLES.md` matrix. |
| **GPU chroma** | Preview | **Global Lab only** — flood/despill/choke not on GPU yet. |
| **CI** | Unit tests | No WebGL readback / bit-identical GPU parity in CI. |

Export and viewport share effect **order + params** (see `buildLayerFilters.ts`
Adobe order comment). They do **not** promise bit-identical GPU↔CPU pixels.

## Covered effects (CPU goldens)

color-overlay, chroma-key, stroke, drop-shadow, outer-glow, inner-glow,
inner-shadow, satin, bevel-emboss, gradient-overlay, pattern-overlay, blends.

## Layout

- `fixtures/` — compact JSON `{ width, height, rgba: number[] }` inputs/expected
- `compareRgba.ts` — diff helpers
- `blendFx.golden.test.ts` — bun tests
