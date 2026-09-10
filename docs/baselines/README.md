# Milestone 0 baselines

Captured 2026-09-03 from the unmodified archives under `/legacy-reference/`. Nothing here is generated from the new implementation; these are the reference points the migration is compared against.

## Contents

| Path | What it is | Produced by |
|---|---|---|
| `seo-baseline.json` | Per-route SEO surface of the legacy Syed AI site and the Search Evidence Console, extracted with **JavaScript disabled**: status, `<title>`, meta description, canonical, robots, OG/Twitter tags, H1 list and count, heading outline, JSON-LD block count and every `@type`, internal links, images (alt/dimensions), word count, scripts, stylesheets, external hosts. Includes console errors per viewport from a JS-enabled render. | `tools/baseline/capture-baseline.mjs` |
| `screenshots/syed-ai-site/<route>-<width>.png` | Chromium renders of `/`, `/geo-pricing/`, `/geo-vs-seo/`, `/cited-not-recommended/`, `/glossary/`, `/404.html` at 360, 390, 768, 1024 and 1440 CSS px (full-page at ≥1024). | same |
| `screenshots/search-evidence-console/home-<width>.png` | Chromium renders of the console's first stage at the same five widths. | same |
| `ses-fixtures/*.json` | **Characterization fixtures** for the Search Evidence Suite engines: the suite's own seeded `sampleData()` (LCG seed 7) pushed through the exact `run()` pipeline (`app.js:7601`) with rendering and IndexedDB removed and `Date.now` pinned to `2026-09-03T12:00:00Z`. Every engine output is dumped: datasets ledger, gates, calibrated CTR curve, all eight finding families, action queue (pre- and post-`augmentActions`), clusters and page map, 46 technical issues, six-pillar score (`SCORE_MODEL = 2`), backlinks, internal-link plan, briefs, media/schema/hreflang, SERP features, AI Search pass, AI-readiness pillar, and the 45 synthetic crawl pages. `SUMMARY.json` carries headline numbers. | `tools/baseline/ses-characterize.mjs` |

## Headline numbers (legacy behaviour to preserve)

**Syed AI site.** Six routes, all 200, exactly one `<h1>` each, every image carries `alt` and dimensions, zero JavaScript required for any content or metadata. Homepage JSON-LD graph expands to 35 distinct `@type`s; sub-pages 8–13. The only external hosts at load are `fonts.googleapis.com`/`fonts.gstatic.com` (Bodoni Moda 500–700 + Jost 400/500/600) plus outbound citation links. The single console error recorded (`ERR_TUNNEL_CONNECTION_FAILED`) is this sandbox's egress proxy blocking Google Fonts, not a site defect — but it does confirm the fonts are a third-party runtime dependency.

**Search Evidence Suite on its sample project.** Overall **71 / Solid**; pillars crawl 96, on-page 93, topics 66, search 64, AI readiness 34, off-page 61. 261 ranked actions; 14 topic clusters (9 owned, 1 split, 4 missing); 46 technical issues; 9 data gates (7 pass, 2 designed warnings). Findings: 112 striking-distance, 12 CTR-gap, 43 decay, 35 risers, 43 cannibalisation, 49 keyword gaps, 5 Semrush drops, 0 reconcile.

## Reproducing

```bash
# from the repository root; requires php (built-in server) and playwright on NODE_PATH
node tools/baseline/capture-baseline.mjs
node tools/baseline/ses-characterize.mjs
```

The characterization run is deterministic: two consecutive runs produce byte-identical fixture files (verified). Any future extraction of an engine into `packages/search-evidence-core` must reproduce these outputs on the same inputs before the legacy implementation is retired.

## Known limits

- Baselines were captured from a local static server, so `.htaccess` behaviour (redirects, headers, CSP) is documented from the file itself (`docs/discovery/syed-ai-site-inventory.md` §2), not observed.
- PHP endpoints were not exercised end-to-end (they require SMTP credentials and a `syedai-config.php` that is deliberately not in the archive). Their behaviour is documented from source.
- The console's crawler and GSC connector were not exercised (network + OAuth); the sample project uses an imported synthetic crawl (`sampleCrawl`) instead.
