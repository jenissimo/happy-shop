# Happy Shop

Happy Shop is a local, browser-based raster image editor aimed at Photoshop-parity workflows: real layer trees, non-destructive effects, and a professional tool surface without pretending to be a full Photoshop clone.

The editor chrome—React shell, dockview panels, command registry, shortcuts, themes, and project bridge—is forked from Happy Editor Framework patterns **in this repository**. The framework is a one-time template, not a runtime dependency. The graphics core (document model, raster store, Pixi viewport, history, and persistence) is purpose-built here.

**Stack:** React 19 · Vite 8 · PixiJS 8 (WebGL2) · TypeScript · Bun (preferred) or npm.

---

## Getting started

**Requirements:** Node.js 20+ and [Bun](https://bun.sh) (recommended—lockfile is `bun.lock`; tests run via `bun test`). npm works for install and most scripts if Bun is unavailable for tests.

```bash
git clone https://github.com/jenissimo/happy-shop.git
cd happy-shop

bun install          # or: npm install
bun run dev          # or: npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`). Project files are stored under `.happy-shop/`; sample documents live in `demo/documents/`.

### Scripts

| Command | Description |
|---------|-------------|
| `dev` | Start the Vite dev server with the project bridge |
| `build` | Production build (`tsc -b && vite build`) |
| `preview` | Preview the production build locally |
| `typecheck` | Type-check all project references |
| `test` | Unit tests under `src/` (`bun test`) |
| `test:e2e` | Playwright end-to-end tests (`e2e/`) |
| `test:all` | Unit tests, then E2E |

Full verify pass:

```bash
bun run typecheck && bun run build && bun test && bun run test:e2e
```

E2E requires Chromium: `bunx playwright install chromium`.

---

## GitHub Pages

The site deploys automatically from the `master` branch via [GitHub Actions](.github/workflows/deploy-pages.yml).

1. In the repo on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `master` (or run the **Deploy GitHub Pages** workflow manually).

Live URL: **https://jenissimo.github.io/happy-shop/**

Production builds set `GITHUB_PAGES=true`, which configures Vite `base` to `/happy-shop/` (derived from `package.json` `name`). Local `bun run dev` keeps `base: '/'`.

Preview a Pages-style build locally:

```bash
GITHUB_PAGES=true bun run build
bun run preview -- --base /happy-shop/
```

---

## Documentation

High-level architecture and feature coverage are in the **Architecture** and **Feature highlights** sections below. Application source is organized under `src/` (`core/`, `rendering/`, `imaging/`, `editor/`, `persistence/`, etc.).

---

## Feature highlights

**Layers & effects** — Raster layers, groups (pass-through and isolated), opacity/blend modes, masks, and a full Layer Style set (drop shadow, stroke, glows, overlays, bevel/emboss). Non-destructive effect stacks with content- and style-phase nodes; group FX on isolated groups; Effects panel, FX clipboard, and named presets.

**Brushes & retouch** — Round brush and eraser, hard Pencil with pixel-perfect strokes, bundled CC0 stamp packs, user ABR import, Clone/History/Pattern Stamp, Healing, Smudge, Blur/Sharpen, Dodge/Burn/Sponge, and Liquify (warp, bloat, pucker, twirl, freeze/thaw mask).

**Text & fonts** — Editable text layers with rich character runs; Character and Paragraph panels; bundled OFL fonts; optional Google Fonts catalog with offline download and provenance tracking.

**Selection** — Rectangular/elliptical marquee, freehand/polygonal/magnetic lasso, magic wand, combine modes, feather and anti-alias, transform selection, clipboard copy/cut/paste.

**Vector paths** — Pen tool and Direct Selection; Paths panel; make selection, fill path, and stroke path commands.

**Deform** — Cage Transform for mesh-based pixel deformation inside a selection or layer bounds.

**Pixel art** — Pixel grid, pixelated preview, nearest-neighbor resampling, Bresenham pixel-perfect pencil strokes.

**Palettes** — Offline Lospec palette catalog; Swatches panel for browsing and picking colors.

**Workspaces** — Essentials, Painting, Typography, and Pixel Art layout presets; save and recall custom dock arrangements; session persistence across reload.

---

## Architecture

The canonical document lives outside React and the Pixi scene graph. React owns chrome; domain stores hold metadata; raster stores hold pixels; the renderer produces a derived view only.

```
src/
  app/              bootstrap, providers
  ui/               shell (menus, title bar), base primitives
  editor/           dockview layout, viewport, tools, panels, session
  core/             document schema, commands, history, geometry
  rendering/        render contracts, Pixi backend, effects, shaders
  imaging/          raster surfaces, tiles, codecs, worker, brushes, palettes
  persistence/      project store, bridge I/O
  bridge/           Vite/Bun API sidecar
  testing/          fixtures, image goldens
```

**Data flow (simplified):** user input → tool controllers → domain commands + tile-local raster ops → transactional history → Pixi compositor → canvas. Export and save paths share the same effect semantics as the viewport where possible.

v0.1 targets 8-bit premultiplied sRGB, desktop Chromium, and documents up to 8192 px per side. CMYK, HDR, and lossless PSD round-trip are explicitly out of scope.

---

## License

Public GitHub repository. No project-level license file yet. Third-party assets (bundled brushes, fonts, Lospec palettes) carry their own `LICENSE` files under `public/`.
