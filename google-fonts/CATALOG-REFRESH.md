# Google Fonts metadata refresh

This checked-in offline index contains 2022 metadata entries derived from the authoritative `google/fonts` repository and no font binaries.
Every entry records its SPDX license and the exact google/fonts commit, top-level license directory, and canonical license URL used as provenance.

Downloadability remains intentionally narrower: only reviewed OFL-1.1 or Apache-2.0 per-family manifests under `families/` may contain pinned direct WOFF2 URLs and license text. UFL metadata is browse-only; it is never promoted by this repository policy.

Refresh manually with `bun scripts/google-fonts/build-index.ts --github`, inspect the metadata/provenance diff, then run `bun scripts/google-fonts/build-index.ts --curated` to preserve reviewed manifests and regenerate script shards and NOTICE. This vendoring step is never CI or runtime work.

## Popularity / trending ranks

The FontPicker uses optional `popularityRank` and `trendingRank` fields (1-based; lower = more popular/trending). When absent, sort silently falls back to A–Z.

Ranks are baked into `index.json` at vendoring time from the committed snapshot at `scripts/google-fonts/rank-snapshot.json`. No API key or network is required for CI or normal builds.

To refresh ranks (human-run, quarterly-ish):

1. `bun scripts/google-fonts/refresh-rank-snapshot.ts` — fetches the public, keyless `https://fonts.google.com/metadata/fonts` endpoint and rewrites the snapshot.
2. `bun scripts/google-fonts/build-index.ts --apply-ranks` — merges snapshot ranks into the checked-in `index.json` without rebuilding family metadata from GitHub.

After a full `--github` metadata refresh, ranks are applied automatically from the snapshot. Re-run step 1 first if you want up-to-date ordering.

Optional override: pass `--api-key "$GOOGLE_FONTS_API_KEY"` with `--apply-ranks` or `--github` to replace ranks from the [Developer API](https://developers.google.com/fonts/docs/developer_api) `sort=popularity` / `sort=trending` lists instead. Requires a free Google Cloud API key; not needed for routine refreshes.

Variable downloadable families also record axis ranges (`wght`, `wdth`, `opsz`) and a direct variable WOFF2 URL in each manifest. After editing manifests, run `bun scripts/google-fonts/enrich-variable-manifests.ts` to refresh axis metadata and variable URLs from the pinned `google/fonts` commit (one-time vendoring helper; not CI/runtime).
