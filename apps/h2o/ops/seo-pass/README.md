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
- **HELD_FOR_CT_RULING:** 2, `/thermal-upgrade/` and `/cooling-tower-japan/`.
- **FRAMEWORK_SLASH_HOP:** 1, the malformed tcf.com URL. It has no trailing slash, so Next adds one first.
- **Metas pending OGCS:** reported, not failed.

## Rebuilding the data

To rebuild the data, for example with an OGCS supplement:
1. Restore the base `content/release/route-ledger.json`.
2. Run `build-batch.mjs <decisions.tsv> <missing-metas.tsv> data/content-check.json <staging-probe.json> [supplement.tsv]`.
3. Regenerate the changed ledger rows from `release/authority.mjs`.
