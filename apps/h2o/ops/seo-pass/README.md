# Master SEO Pass R1 — runbook

Control Tower brief 2026-10-04. Inputs are OGCS `H2O_MASTER_SEO_PASS_R1_2026-10-03.zip` (SHA-256 `43226a9c…4683`) and `H2O_MASTER_SEO_PASS_R1_1_MISSING_METAS_2026-10-04.tsv` (SHA-256 `35b5ee24…3433`). Staging only. PRODUCTION = LOCKED.

## What ships in code (the image)

- **Release authority.** `release/authority.mjs` reads `content/release/seo-pass-r1.json`, and `content/release/route-ledger.json` carries the 29 resulting rows:
  - 3 published held articles;
  - 4 self canonicals;
  - 5 indexable ranking archives;
  - 17 REDIRECT rows.
- **410 Gone** for `/canvas/list/` and `/wp/wp-admin/edit.php` (`GONE_PATHS`, proxy).
- **One description tag per page.** Next metadata renders the quote-only public description. SalmonSeo no longer duplicates it.
- **Social tags follow edits.** Edited SEO title and description fields also update og:/twitter: tags (compose).
- **Listings.** Consolidated and non-public routes leave every listing: the Technical Articles directory and R2 discovery. The three published articles join the directory.
- **Bylines.** The generic article byline links Tim Bozic to `/author/timbozic/`.
- **Restored files.** 22 files under `public/wp-content/uploads/`, byte-identical to the verified WordPress backup (`data/file-restore-ledger.json`).

## What the scripted batch writes (Payload REST, admin, staging)

`apply-seo-pass.mjs` reads `data/` and plans against the live Payload state:

| Phase | Expected on first run |
|---|---|
| routes: PUBLISH / WITHDRAW_TO_REDIRECT / INDEX / CANONICAL | 3 / 17 / 5 / 4 |
| redirects: CREATE / UPDATE / UNCHANGED | 450 / 0 / 23 |
| seo fields: UPDATE | 297 (27 metas pending OGCS are not written) |
| blocked (pending editor drafts, missing records) | 0 |

The expected counts are also in `data/expectations.json`.

```
node ops/seo-pass/apply-seo-pass.mjs --dry-run   # exit 0 only when every count matches exactly; 3 = mismatch → STOP
node ops/seo-pass/apply-seo-pass.mjs --apply     # re-plans, refuses on any mismatch, writes, then reads every write back
```

Environment: `H2O_SEO_BASE_URL`, `H2O_SEO_ADMIN_EMAIL`, `H2O_SEO_ADMIN_PASSWORD`. These come from the protected location and are never printed. The script refuses `h2ocooling.com`.

## Checks after deploy and batch

```
node ops/seo-pass/check-conformance.mjs <staging-origin> --out conformance.json
node ops/seo-pass/check-redirect-chains.mjs <staging-origin>
```

- **Rows:** 1,003 (OGCS 1,005 minus the two author rows).
- **HELD_FOR_CT_RULING:** none. CT ruled on 2026-10-04: `/thermal-upgrade/` and `/cooling-tower-japan/` are kept (200), and their live duplicates 301 into them.
- **frameworkSlashHopAccepted:** 1, the malformed tcf.com URL (308 → 301 → 200, CT ruling 3). A framework hop on any other source fails.
- **Metas pending OGCS:** 0 after the R1.2 supplement.

## Design R4: parts hub and Dry Soda claim wording (CT 2026-10-07, OGCS R4 copy review, SUMS seal 7ccb765b)

One delta on the state CLAIMS-R2 (and R2.5.1) leave on staging.

- **Batch:** 7 recorded claim edits (`data/claim-edits.json` R4C-01…07), written by apply phase 6.
  - R4C-01…06 cover the `/cooling-tower-parts-online/` lower SEO block: 5 paragraphs and the supplier H2. OGCS row 7, the "Why Engineers…" heading, is KEEP.
  - R4C-07 is the Dry Soda line "ensures" → "designed for".
- **R4 phase 2 (OGCS phase 2 copy review, seal 50ff0169; ships in the RESTORE-1 patch, same round):**
  - R4C-08…10 reword the `/air-coolers/` page text (claim edits).
  - R4C-11 rewords its restored-section heading. That is `data/restored-sections.json`, rebuilt by `build-restored.mjs` from the reviewed input with the heading changed and a new claim note; `data/content-assertions.tsv` follows.
- **Code:** the parts template matches its supplier block by heading text, and now also matches "Shipped Internationally" (`Wave3Presentation.tsx`).
- **Conformance:** `data/claims-conformance.json` lists each old string as absent and each new wording as present (`check-claims.mjs`: 260 absent, 33 present). That includes the All Projects lead line, which renders the accepted CS093 heading.

| Phase | Staging (delta, once after R4 + RESTORE-1) | Fresh DB (`expectations.fresh-db.json`) |
|---|---|---|
| redirects | unchanged 408 | unchanged (create 390 …) |
| restored | update 1 (`/air-coolers/`) | unchanged |
| slot fixes | routes 1 (`/air-coolers/`, with its restored write) | routes 181 (was 180) |
| hygiene | routes 2 (`/cooling-tower-parts-online/`, `/dry-soda-blasting/`) | routes 96 (was 95; `/dry-soda-blasting/` is new) |
| everything else | 0 | unchanged |

## CLAIMS-R2: Home claim wording (CT 2026-10-06, OGCS CLAIMS-R2 L10, TSV b74f3286)

One delta on the state Design R3 (Round 11) leaves on staging (`--baseline=<Design R3 data>`, with the union `redirect-status.tsv`).

- **Batch:** the 10 Home rewordings as recorded claim edits (`data/claim-edits.json` R2L10-01…10; 08 and 09 apply after CS088 and
  CS089 on the same run). Row 11 is KEEP. Written by apply phase 6.
- **Code:** the About rows are in `content/design/about-page.json` (Design R3 composition); only the turnkey parts line changes.
- **Conformance:** `data/claims-conformance.json` has each old Home string absent and each new wording present (`check-claims.mjs`).

| Phase (staging, delta) | Expected |
|---|---|
| redirects | unchanged 408 |
| hygiene | routes 1 (/) |
| everything else | 0 |

The fresh-database replay is unchanged (`expectations.fresh-db.json`; the Home is already one of its 95 hygiene routes).

## R2.5: pre-launch fix pack (CT ruling on the SEO Checker's Round 9 pre-flight, 2026-10-05)

One delta on the state R2.4 R2 leaves on staging (`--baseline=<R2.4 R2 data>`), and **one complete replay onto a fresh database**.

**Code (ships in the image):**
- The public author's JSON-LD description is the approved CS153 text on every Person node (EN and locale).
- Sitemap: a noindex row is never listed, whatever its sitemap flag says.
- A decided per-page meta wins on paginated archives; "Page N:" inheritance only fills pages without one.
- Link resolution prefers an active redirect over a route row.
- Provenance attributes no longer name the old Salmon host (no served page carries it); 123 product-gallery derivatives are
  mapped to held originals (`content/salmon/r25-gallery-derivatives.json`).
- X-Robots-Tag is decided at RUNTIME by the proxy from H2O_INDEXING_POLICY: anything but "production" is `noindex, nofollow`
  on every response; in production the page's own decision applies; /admin, /api, /crm are always noindex. Payload builds
  compile no robots header (next.config), so one image serves staging and production.

**Batch** (`--ct-decisions=…,data/r25-ct-decisions.tsv --seo-set=data/r24-seo-set.tsv,data/r25-seo-set.tsv`):
- The five redirect sources still PUBLIC (/contact/, /cart/, /checkout/, /my-account/, /my-account/lost-password/) and the two
  author aliases are withdrawn to their 301s. The author aliases are now batch redirects (they were pre-existing Payload records).
- The eleven live-chain middle addresses (`/look-cooling-tower-fan-efficiency-pt-2/` and ten more) 301 one hop to their final page.
- OGCS R2.5: the /cooling-tower-construction/ title, the Robertshaw meta; cost figures as labelled ranges and CS161 as recorded
  edits (`data/claim-edits.json` R25-OGCS-*, CS161); three decided metas cleaned of import residue.
- `apply-seo-pass.mjs` plans SEO fields from the stored state (as every other phase already did), not from the delta's action
  column, so one apply onto a freshly imported database writes them all.

| Phase (staging, delta) | Expected |
|---|---|
| redirects | create 11, unchanged 396, normalise 0 |
| routes | withdraw 7 |
| seoFields | update 5 |
| hygiene | routes 14 |
| everything else, blocked | 0 |

**Fresh production database:** authority import of this release, then ONE apply with
`--expectations=expectations.fresh-db.json` (redirects create 389 / unchanged 18, seo 498, h1 9, restored 23, slot fixes 180,
hygiene 95). The rehearsal's end state equals the staging chain's (every route field and every active redirect); the only
differences are not served (retired redirect history; stale SEO fields on two withdrawn duplicates).
`state-diff.mjs export|compare` lists anything that exists only in one database (run it on staging and on a fresh replay).

## R2.4: pre-launch SEO fix pack (CT 2026-10-05; SEO Checker baseline triage §3 a–l)

One delta on the state Round 5 leaves on staging (`--baseline=<Round 5 data>`).

**Code (ships in the image):**
- **Standard head** on every template, English services and `/search/` included (`src/site/standard-head.tsx`): og/twitter title
  and description mirror the served title and meta; og:url, og:site_name ICS, twitter:card; the site default og:image (a verified
  ICS project photo cropped to 1200×630, `content/design/og-default.json`) where a page has no held image of its own, except a
  project page (Design Fixes A1); Organization and WebSite JSON-LD @ids.
- **Paginated archives:** "… - Page N" titles; meta "Page N: " + the archive's meta.
- **Article scoping:** Article/BlogPosting only on posts, author Tim Bozic; WebPage elsewhere.
- **301 for every published redirect**, whatever the stored status (`src/proxy.ts`); the ledger's redirects are all 301.
- **Images:** 61 images recovered byte-for-byte from the local public_html backup into the media store
  (`content/salmon/r24-recovered-media-identities.json`); 19 images held nowhere are removed from their pages
  (`content/design/media-overrides.json` `withheldSources`: 8 legacy uploads, and in R2 the 10 Google-Docs-hosted images and one
  legacy upload that showed an "unavailable" box on live articles).
- **Empty archives (R2):** page 2+ of an archive that lists nothing public (`EMPTY_ARCHIVE_PAGES`, 37) answers 404 and no page
  link points at it; the archive root keeps its noindex,follow empty state (CT ruling 2026-10-02). Every rendered image reserves its box (width/height from the held
  file's header). Non-descriptive links ("Learn more") take an accessible name from their card heading.
- `/search/`: noindex,follow; meta from the OGCS R2.4 TSV.

**Batch** (`--ct-decisions=<parity decisions>,data/r24-ct-decisions.tsv --seo-set=data/r24-seo-set.tsv`):
- `/new-cooling-tower-page/` is withdrawn with a 301 to `/new-cooling-towers/` (CT ruling); it leaves the sitemap.
- The OGCS R2.4 titles/metas (14 rows on 13 pages; the withdrawn page's title is dropped, `/search/` is in code) and, in R2, the
  OGCS R2.4A archive metas (15 archives whose page N inherits the meta). A meta-only row keeps the page's title unchanged.
- **NORMALISE:** the 50 records the authority import stored with status 308 are set to 301 (`data/redirect-status.tsv`).
- Internal links to a page that answers 301 point at its final URL (`build-slot-fixes.ts`; 321 links on 107 pages).

| Phase | Expected |
|---|---|
| redirects | create 1, unchanged 393, normalise 50 |
| routes | withdraw 1 |
| seoFields | update 28 |
| slotFixes / hygiene | routes 2 / 105 |
| update, retire, publish, index, canonical, h1, restored, blocked | 0 |

**Conformance** (`check-conformance.mjs`, `head-assertions.mjs`) also checks, on every HTML row plus every paginated archive, the
six English services, the two portfolios, `/search/` and `/thank-you/`: the standard head (a, d), no legacy title suffix (f,
English pages), "Page N" titles with a meta (c; a meta is reported, not failed, while the archive itself has none), noindex on
`/search/` and `/thank-you/` and every empty archive root ("follow" too with `--policy=production`); a 404 for every empty
archive page N; a 301 (not 308) for every decided and ledger redirect (k); every decided H1 (h1-fields.tsv, the
R2.2a ruling); and, last, readiness publication "current" (the served release covers the latest committed event).

## Locale Part B: preserved live locale pages (owner decision 2026-10-05; OGCS Part A; CT rulings)

One delta on the state Part 3 leaves on staging (`--baseline=<Part 3 data>`).

**Code and data (ship in the image):**
- 166 preserved live locale pages as LIVE-family sources (`content/salmon/r3-locale-routes.json`, documents
  `SALMON-LIVE-LOCALE-<lang>-<wpid>.json`), captured read-only from h2ocooling.com (REST record + served HTML, SHA-256 recorded)
  and parsed into the accepted LIVE schema. The release authority lists them PUBLIC, self-canonical, in the locale sitemaps,
  never in the English search index. The **authority import** creates their records (new rows only; existing records unchanged).
- `<html lang>`: the proxy passes the page language (`src/content/locale-language.ts`; the swapped /th/ ↔ /ja/ pair follows its
  content language) to the layout. hreflang: the page metadata carries the same reciprocal set the sitemap lists.
- The held Thai Salmon page at the root slug publishes (content check PASS); its empty live /th/ duplicate 301s to it (CT
  override of Part A, `data/locale-overrides.tsv`).

**Batch** (`--locale-part-a=<PART_A.tsv> --locale-repoint=data/locale-b-repoint.tsv --locale-overrides=data/locale-overrides.tsv`):
- Part A replaces the R1 decision of every locale URL: 98 R1 locale→English redirects retire (`active:false`, kept), 120 repoint one
  hop to the preserved locale page, 4 are new, the 4 locale drafts answer 410.
- 12 claim edits (`data/claim-edits.json`, CT ruling): the outcome-guarantee and "top supplier" sentences removed from two English
  pages and all their translations; ja 保証 → 確保 on two pages. Recorded before/after in `data/slot-fixes.json`; written by apply
  phase 6 (hygiene).

| Phase | Expected |
|---|---|
| redirects | create 4, update 120, unchanged 269, retire 98 |
| routes | publish 1 |
| seoFields | update 1 |
| hygiene | routes 12 |
| h1, restored, slotFixes, withdraw, index, canonical, blocked | 0 |

**Conformance** also checks every page's `<html lang>`, each locale page's self canonical, and hreflang reciprocity.

## Part 3: production sitemap, sitemap-parity rulings and slot hygiene (CT 2026-10-05)

One delta on the state Part 2 R3 (+ R3.1) leaves on staging (`--baseline=<R3 data>`); nothing R3 wrote is written again.

**Batch** (`--ct-decisions=<H2O_CT_SITEMAP_PARITY_DECISIONS.tsv>`: CT rulings on the 18 Yoast URLs outside OGCS's decisions):
- **410:** `/evercompare/`, `/gh/`, `/draft-page/`, `/locations.kml` (code: `GONE_PATHS` and `data/gone.tsv`).
- **Publish:** `/cooling-tower-daily-log/` at its live path, live title minus the legacy WordPress suffix, live meta, live H1
  (content check PASS in `data/content-check.json`; its imported elements pass the strict validator).
- **13 redirects:** translated posts outside the Part A universe, one hop to the Part A target of the same post (its preserved
  locale page, else the English counterpart). Two of them point at the current final page of a preserved locale page that is
  still LOCALE_PENDING; `data/locale-b-repoint.tsv` records them so that Locale Part B repoints them, still one hop.
- **Hygiene (apply phase 6):** the 41 records in `data/slot-fixes.json` that no write has carried yet get their fixed
  elements on their own: slots only, publication status unchanged, read back.

**Expectations:** `data/expectations.json` (Case A: R3 ran with R3.1) and `data/expectations.case-b.json` (Case B: R3 ran
without it; the one canonical its SEO write put back is re-applied). `apply-seo-pass.mjs --expectations=<file>` selects it;
Control Tower names the case.

| Phase | Case A | Case B |
|---|---|---|
| redirects | create 13, unchanged 474 | same |
| routes | publish 1 | publish 1, canonical 1 |
| seoFields | update 1 | same |
| hygiene | routes 41 | same |
| h1, restored, slotFixes, withdraw, retire, blocked | 0 | 0 |

**Sitemap** (code: `src/content/sitemap.ts`, `sitemap-response.ts`, the `public-sitemap` and `sitemap-preview` routes):
- Index at `/sitemap_index.xml` and `/sitemap.xml`; Yoast-named children; `sitemap-ja|th|id|vi.xml` with hreflang alternates from
  OGCS Part A (`content/locale/sitemap-locale.json`, built by `ops/sitemap/build-locale-data.mjs`), emitted only between listed
  members; `lastmod` from the document's `updatedAt`; no `/page/N/` paths. Private policy: empty index, children 404.
- `/api/sitemap-preview/?file=<name>`: what the production policy publishes, for content admins only (anyone else: 404).
- **Parity:** `pnpm exec tsx ops/sitemap/parity.ts --yoast=<snapshot.tsv> --part-a=<PART_A.tsv> --out=<dir> [--origin=<url>]`
  reconciles every Yoast URL (IN_SITEMAP, REDIRECT_TO_SITEMAP, GONE_410, NOINDEX, LOCALE_PENDING) and checks every listed URL
  serves 200, self-canonical and indexable; exit 0 only with 0 UNACCOUNTED.

**Conformance** now also checks that every 200 HTML page serves exactly one canonical, equal to the release authority's.

## Part 2 R3: one delta on the preserved partial R1 state (CT 2026-10-05)

Commander's R1 round applied part of the batch and stopped (H2O_SLIM_SEO_M1_R1_HOLD_SEO_PAYLOAD_CONTENT_VALIDATION):
- redirects: 452 created;
- routes: 22 OK, 7 refused;
- SEO fields: 255 OK, 42 refused.

The refused writes and the read-back failures had four causes. Each is fixed here without loosening any guard:
1. **Imported page elements the strict save-hook validator rejects:** legacy http links, a legacy upload path, alt text over 300 characters. Every write to such a record failed, whether publish, withdraw or SEO.
   - `data/slot-fixes.json` holds the fixed elements. `build-slot-fixes.ts` builds it by running the REAL validator over every imported record: 88 routes, 112 elements, 115 recorded changes.
   - The batch sends the fixed elements in the same write as the decided change.
   - An element edited since import (neither the imported value nor the fixed one) blocks the run.
2. **Held files as link destinations.** A link may name a file only when it exists in the served public tree, under `/wp-content/uploads/` or `/media/` (`src/content/public-files.ts`).
3. **Over-long alt text** is shortened to its own leading sentences of at most 300 characters, held text only.
4. **The withdrawal read-back.** An admin `draft=false` read returns the main row whatever its `_status`, so R1 misread its 13 successful withdrawals as "still published".
   - The proof is now an unpublished main row, the decided disposition, and an empty published-only query (`lifecycle.mjs`).
   - The first failed write stops the run (fail fast), then everything written is read back.

Also: 4 legacy file redirects now point to the exact served file names. The runtime filesystem is case-sensitive, so the old lower-case targets were 404s.

| Phase | Expected on the preserved partial state |
|---|---|
| routes: PUBLISH / WITHDRAW_TO_REDIRECT / INDEX / CANONICAL | 3 / 6 / 0 / 1 |
| redirects: CREATE / UPDATE / UNCHANGED / RETIRE | 0 / 4 / 470 / 1 |
| seo fields / h1 / restored | 113 / 8 / 19 |
| routes carrying element fixes | 47 |
| blocked | 0 |

**Rehearsal gate (Envelope R1.2).** Every batch is first rehearsed against a throwaway local restore of the staging database, with the full app (real Payload validators and hooks). It is applied to staging only if the rehearsal is completely clean.

## Part 2 R2 (CT SEO parity follow-up; OGCS Part 1 R1.2; content model change approved 2026-10-05)

The Part 2 batch is a **delta** on the R1 batch already applied on staging (the dea3b5a and db01dc2 data). The first dry run expects:

| Phase | Expected |
|---|---|
| routes: PUBLISH / WITHDRAW_TO_REDIRECT / INDEX / CANONICAL | 1 / 2 / 0 / 0 |
| redirects: CREATE / UPDATE / UNCHANGED / RETIRE | 0 / 0 / 474 / 1 |
| seo fields: UPDATE | 85 |
| h1: UPDATE | 8 (3 heading slots and 5 record titles) |
| restored: UPDATE | 19 pages |
| blocked | 0 |

**Routes, redirects and fields:**
- **Withdrawals:** the live duplicates of the designed Thermal and Japan pages.
- **Re-publish and retire:** `/cooling-tower-vs-chiller/` (OGCS R1.2: false duplicate). Its R1 redirect is retired (`active:false`, kept).
- **Chiller:** `/chiller-and-cooling-tower/` stays at 200 with the restored live Legionella article. Its fallback 301 is not needed, and its 8 inbound redirects stay unchanged.
- **SEO fields:** OGCS R1.2 titles, the R1.2 supplement metas, the 5000H meta model fix, and 22 completed metas (CT ruling: the "…" finals rewritten as complete sentences; old and new text are in the evidence).
- **H1:** the decided headings. `/cooling-tower/` and the gearbox and drive-shaft categories use the h1 heading slot. The 5 restored-body articles use the record title, which brings their live H1.

**Restored sections** (`data/restored-sections.json`, `restoredSections` on the route record) are typed blocks at explicit anchors:
- Anchors are `after-section`, `before-heading`, `replace-body`, or `template-slot` (intro, description, body-end).
- The save hook refuses an anchor that does not resolve, and the batch never appends.
- Text comes from the live pages (the CT parity audit's read-only fetches), reviewed with h2o-technical-b2b-content. Per-page claim notes are in the evidence.
- No images.

**Hosted checks:**
- `check-conformance.mjs` also asserts every restored H2 and every restored live H1 on its page (`data/content-assertions.tsv`).
- `frameworkSlashHopAccepted` contains only the tcf.com URL.

**Migration:** one additive, forward-only migration adds the `restoredSections` array and its blocks. Its content-model label is `restored_sections`. Commander generates it with `pnpm --filter @factory/h2o migrate:create` and regenerates the types (`generate:types`).

## Rebuilding the data

1. **Pass 1:**
   - Restore the base `content/release/route-ledger.json` (source 49ec97e).
   - Run `build-batch.mjs <decisions.tsv> <missing-metas.tsv> data/content-check.json <staging-probe.json> [supplement.tsv] --baseline=<applied batch data> --title-delta=<R1.2 title delta> --dup-resolution=<R1.2 dup resolution> --content-decisions=<R1.2 content decisions> --restored=data/restored-sections.json --meta-rewrites=<rewrites.tsv>`.
   - Then run `sync-ledger.mjs`.
   - R2.4: build-batch reads the imported redirect statuses (308) from the base ledger for `redirect-status.tsv`; `sync-ledger.mjs`
     then sets the ledger's redirects to the authority's 301.
2. **Restored data:** `build-restored.mjs <reviewed dir> [--evidence=<dir>]`. It checks public link targets against the final ledger.
3. **Pass 2:** repeat step 1. The ledger depends on the restored data only through content fallbacks, so it is stable.
4. **Check:** `sync-ledger.mjs --check` exits 1 if any ledger row is stale.

`build-live-alt.mjs <audit raw dir>` regenerates `content/salmon/live-image-alt.json`: the alt text h2ocooling.com serves for each upload, which the site uses as held alt text.
