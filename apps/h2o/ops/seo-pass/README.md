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
2. **Restored data:** `build-restored.mjs <reviewed dir> [--evidence=<dir>]`. It checks public link targets against the final ledger.
3. **Pass 2:** repeat step 1. The ledger depends on the restored data only through content fallbacks, so it is stable.
4. **Check:** `sync-ledger.mjs --check` exits 1 if any ledger row is stale.

`build-live-alt.mjs <audit raw dir>` regenerates `content/salmon/live-image-alt.json`: the alt text h2ocooling.com serves for each upload, which the site uses as held alt text.
