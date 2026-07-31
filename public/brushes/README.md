# Bundled brush packs

Static brush tip assets served from `/brushes/…`. Nothing here is bundled into the JS chunk — tips are
fetched lazily by `src/imaging/brushes/tipRegistry.ts`. Full contract:
[`SPECS/PREMIUM-CONTROLS-VISION.md`](../../SPECS/PREMIUM-CONTROLS-VISION.md) §3.

**Status:** all three v1 stamp packs are vendored.

## Layout (once packs land)

```
public/brushes/
  index.json            # list of pack ids to load
  NOTICE.md             # attribution table for every pack
  <pack>/
    manifest.json       # BrushTipDescriptor[]  (see src/imaging/brushes/tipDescriptor.ts)
    LICENSE             # verbatim license text
    <tip>.png           # 8-bit grayscale alpha, ≤512 px long edge, ≤25 KB target
```

## Packs planned for v1 — licenses verified 2026-07-31

| Pack id | Name | Tips | Source | License | Phase |
|---|---|---|---|---|---|
| `proc` | Happy Round Set | 8 | generated in-repo (`src/imaging/brushes/presets/proc.ts`, no files here) | repo license | P0 |
| `oga-rd` | Structure & Texture | 12 | [60 free gimp / krita brushes](https://opengameart.org/content/60-free-gimp-krita-brushes) by *rubberduck* | **CC0-1.0** | P0 |
| `oga-grunge` | Grunge & Splatter | 10 | [~100 grunge brushstrokes and splatters set](https://opengameart.org/content/100-grunge-brushstrokes-and-splatters-set) | **CC0-1.0** | P1 |
| `dr-grain` | Media Grains | 10 | [Krita brushes 2025-01 bundle](https://www.davidrevoy.com/article1060/krita-brushes-2025-01-bundle) by *David Revoy* — brushes released CC-0 with explicit permission to include in software | **CC-0** | P1 |

## Rules

- **Never commit third-party `.abr` / `.gbr` / `.gih` / `.kpp` / `.bundle` files.** Only our converted
  PNG + JSON output, produced by `scripts/brushes/convert.ts` from a `.gitignore`d `vendor-tmp/` input.
- Allowed licenses: CC0-1.0, Apache-2.0, MIT, and CC-BY-4.0 with a `NOTICE.md` entry.
  **Rejected:** GPL art (GIMP data), CC-BY-SA (share-alike on our converted derivatives),
  mixed-license Krita default bundles, and any "free for personal use" ABR set.
- Every pack needs a `LICENSE` file, a `NOTICE.md` row, and non-empty `license` fields in its manifest;
  `src/imaging/brushes/licenses.test.ts` enforces this and the 1.5 MB total-bytes cap.
