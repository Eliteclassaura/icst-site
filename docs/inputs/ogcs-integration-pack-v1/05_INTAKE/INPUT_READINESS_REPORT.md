# INPUT_READINESS_REPORT

**Project:** H2O Cooling WordPress → Payload migration · OGCS · Search Evidence Suite · Agency Site Factory
**Package inspected:** `CLAUDE_H2O_OGCS_MASTER_HANDOFF_v1.zip` (created 2026-09-05)
**Also inspected:** `~/Projects/agency-site-factory-workspace/` on the linked Mac (Agency Site Factory repo + `review-materials/`)
**Report date:** 2026-09-05
**Phase:** 1 — Intake only. Nothing on any live site was touched. No destructive or irreversible work was performed.

---

## 1. Verdict

**Status: NOT READY for migration analysis. Reference material is complete; evidence material is entirely absent.**

The handoff package is internally consistent: all three reference packs are present, their SHA-256 checksums match `SHA256SUMS.txt`, and the intake instructions, schemas and scripts are readable and usable. The Agency Site Factory repository is available on the Mac with full git history (8 commits, latest `88f5469`) and has been inspected at code level, so the architecture question can be — and has been — answered from actual code rather than assumptions (see `AGENCY_SITE_FACTORY_INTEGRATION_DECISION.md`).

However, **none of the user-supplied inputs listed in `UPLOAD_MANIFEST.csv` have been provided**: no OLD H2O site archive or database, no NEW H2O site archive or database, no Google Search Console data, no SEMrush data, no Surfer data, and no Search Evidence Suite project export. The `02_UPLOAD_YOUR_SITE_EXPORTS/` and `03_UPLOAD_SEO_DATA/` folders contain only their `README_UPLOAD_HERE.md` placeholders. Running the package's own validator (`05_SCRIPTS/verify_handoff.py`) yields 3 OK / 8 MISS.

Phase 2 (forensic freeze and OLD-vs-NEW comparison) cannot begin until at minimum the two site archives and databases are in place. Phase 3 (strategic triage with SEO equity) additionally requires GSC and backlink data; without them every URL's `seo_equity_score` stays `UNKNOWN` and `prune_blocked` stays `true`, which is the correct safe default but means no PRUNE, REDIRECT or CONSOLIDATE decision can be finalised.

---

## 2. Present

| Item | Location | Checked | Notes |
|---|---|---|---|
| OGCS Build Package v1 | `01_REFERENCE_PACKS/OGCS_BUILD_PACKAGE_v1.zip` | SHA-256 OK | Spec-only. 50 KB system spec (.md + .docx), build-steps, controller prompt, JSON Schema (13 entities), tactic playbook seed (10 tactics). **No code.** |
| H2O Payload Migration Discovery Pack v1 | `01_REFERENCE_PACKS/H2O_PAYLOAD_MIGRATION_DISCOVERY_PACK_v1.zip` | SHA-256 OK | Constitution, strategic scope, triage rules, crawler config (`base_url: https://h2ocooling.com`), 4 JSON schemas, freeze crawler + evidence merger (Python), output templates, QA gates. A second identical copy exists on the Mac under `review-materials/h2o-discovery-pack/` (with `__pycache__`, so it has been compiled/run at least once). |
| Search Evidence Suite source | `01_REFERENCE_PACKS/searchevidencesuite-fixes_1.zip` | SHA-256 OK | `search-evidence-console/`: static single-page browser app (vanilla JS, 12.3k lines, IndexedDB storage), `proxy.php` fetch relay, docs. **No server API.** Also vendored read-only in the Factory repo at `legacy-reference/search-evidence-suite/`. |
| Master prompt, work order, project context, security rules, architecture question | `00_START_HERE/` | Read | Consistent with README and deliverables list. |
| Hostinger export guide, SEO data export guide, sources/freshness | package root | Read | Cross-checked 2026-09-05 per `SOURCES_AND_FRESHNESS.md`. |
| Upload manifest (22 rows) and readiness validator | `00_START_HERE/UPLOAD_MANIFEST.csv`, `05_SCRIPTS/verify_handoff.py` | Run | Validator works; see §3 for its output. |
| Agency Site Factory repository | Mac: `~/Projects/agency-site-factory-workspace/agency-site-factory/` | Inspected (code-level) | pnpm/turbo monorepo; Next 16 + Payload 3.88 + Postgres; `apps/syed-ai`, `packages/{agency-core,design-contract,quality-gates}`, `tools/{baseline,legacy-extract,parity,scripts}`; 25 ADRs in `docs/decision-log.md`. Git history intact. |
| Factory review materials | Mac: `review-materials/` | Listed | `dossier/` and `crm-brief/` HTML, `inputs/agency-site-factory-inputs-and-docs.zip` (17 MB, 207 files — syed.ai legacy site + SES source, **not H2O**), 9 UI screenshots, and the discovery-pack copy noted above. |

---

## 3. Missing (required by `UPLOAD_MANIFEST.csv`)

Validator output (`python3 05_SCRIPTS/verify_handoff.py`):

```
OK   OGCS reference pack
OK   H2O migration pack
OK   Search Evidence source
MISS OLD H2O files archive
MISS OLD H2O database
MISS NEW H2O files archive
MISS NEW H2O database
MISS GSC data
MISS SEMrush data
MISS Surfer data
MISS Search Evidence project export
Missing required/preferred inputs: 8
```

| # | Manifest item | Required | Blocks | What is needed |
|---|---|---|---|---|
| M1 | Old H2O website files | yes | Phase 2 | Full WordPress files archive (`.tar.gz`/`.zip`) of the OLD site, with `EXPORT_NOTES.txt` (domain/subdomain, backup date, database name). `wp-config.php` sanitised. |
| M2 | Old H2O database | yes | Phase 2 | `.sql`/`.sql.gz` of the database that belongs to the OLD site. |
| M3 | New H2O website files | yes | Phase 2 | Same as M1 for the NEWER version. |
| M4 | New H2O database | if applicable | Phase 2 | Same as M2 for the NEWER version (required if it is WordPress/database-driven). |
| M5 | GSC Search Performance — queries | yes | Phase 3 | CSV/XLSX/JSON, longest useful window plus a comparison window. |
| M6 | GSC Search Performance — pages | yes | Phase 3 | As M5. This is the single most important input for `seo_equity_score` and `prune_blocked`. |
| M7 | GSC countries and devices | preferred | Phase 3/4 | Market/device analysis; informs multilingual planning. |
| M8 | GSC Generative AI performance | if available | Phase 3 | Export only if the property exposes the report. |
| M9 | SEMrush organic positions + ranking URLs | yes | Phase 3 | Record database/country and date. |
| M10 | SEMrush organic competitors | preferred | Phase 3 | |
| M11 | SEMrush backlinks + referring domains | yes | Phase 3 | Follow/nofollow and anchors where possible. Second most important prune-blocker after GSC. |
| M12 | SEMrush top linked pages / backlink gap | preferred | Phase 3 | |
| M13 | Surfer Content Audit | yes | Phase 3 | CSV bulk baseline. |
| M14 | Surfer priority page audits | preferred | Phase 3 | Core services and top GSC pages. |
| M15 | Surfer SERP Analyzer exports | preferred | Phase 3/4 | Priority commercial query clusters. |
| M16 | Search Evidence Suite H2O export | yes | Phase 3 | `*.seoproject.json` (full project backup — preferred, contains raw rows + crawl) and/or `*-snapshot-*.json`, `.xlsx`. |
| M17 | GA4 / Ahrefs / Majestic / redirect maps / keyword maps | no | — | Optional but valuable for conversions and equity. |

Step-by-step collection instructions for M1–M17 are in `MISSING_INPUTS_CHECKLIST.md`.

---

## 4. Stale

Nothing in the package is stale as of today; the package was created and its sources cross-checked on 2026-09-05. Two freshness caveats to carry forward:

1. **The discovery pack's live spot-check (`08-NOTES/INITIAL_LIVE_SPOTCHECK.md`) is dated "September 2026" and is explicitly not a crawl.** It must not be used as inventory evidence. The automated freeze crawl of `https://h2ocooling.com` has not yet been run against the live site (per `08-NOTES/VALIDATION.md`, only a 3-page local fixture was tested).
2. **Hostinger backups are point-in-time.** When the user supplies M1–M4, the backup dates must be recorded; if the OLD site has changed since its backup, a live freeze crawl should be taken on the same day the archive is downloaded so the two agree.

---

## 5. Ambiguous

| # | Ambiguity | Why it matters | Resolution needed from owner |
|---|---|---|---|
| A1 | **Which Hostinger site is "OLD" and which is "NEW".** The prompt describes "an OLD/current-or-legacy H2O WordPress site" and "a NEWER H2O version that was being built" but gives no hostnames, subdomains or hPanel site names. | Mixing them up would invert every OLD-vs-NEW comparison. | Provide the exact domain/subdomain (e.g. `h2ocooling.com` vs `new.h2ocooling.com` or a `*.<client-host>` preview host) and hPanel site label for each, in each `EXPORT_NOTES.txt`. |
| A2 | **Which version is live at `https://h2ocooling.com` today.** The discovery-pack config crawls that URL. | Determines which archive the live freeze crawl should be reconciled against. | State it explicitly. |
| A3 | **Whether the NEW version is WordPress.** Manifest says "if applicable" for its database. | Changes what M4 is and how it is parsed. | Confirm platform of the NEW build. |
| A4 | **WooCommerce.** `CLAUDE_START_HERE.md` in the discovery pack says "WordPress/WooCommerce"; the master prompt says only WordPress. The live spot-check mentions a "large and paginated" product/parts architecture. | Product/category URLs, `?add-to-cart=` variants and product schema materially change URL inventory size and the Payload content model (Parts/Product Categories collections). | Confirm whether WooCommerce is active on OLD and/or NEW, and whether product pages are meant to survive. |
| A5 | **GSC property type and access.** Domain property vs URL-prefix property; whether Search Evidence Suite's browser OAuth connector has already been used for H2O. | Domain property covers all subdomains/protocols (needed if OLD and NEW are on different hosts). Search Evidence's connector yields up to 100k rows per table vs the UI's ~1k. | State property type and whether an H2O project already exists in Search Evidence Suite. |
| A6 | **Search Evidence Suite export format.** Manifest accepts json/csv/xlsx/zip. | Only `*.seoproject.json` contains raw GSC rows and crawl data; snapshot/xlsx are derived. | Prefer the full project backup. |
| A7 | **Review-period for "GSC clicks > 0" prune-block rule.** Triage rules say "in the selected review period" but no period is set. | Different windows produce different PRUNE candidates. | Recommend 16 months (GSC maximum) as primary, with 3-month recent window as secondary. Confirm. |
| A8 | **Multilingual scope.** Project context mentions "future multilingual SEO"; `SEO_DATA_EXPORT_GUIDE` asks for countries. | Affects whether hreflang inventory on OLD/NEW is expected to find anything and how the content model is planned. | Confirm current languages on OLD/NEW (if any) and target markets. |
| A9 | **`OGCS_SYSTEM_SPEC` vs Factory ADRs on where OGCS runs.** The Factory's ADR-005 mandates isolated deployment per client with no multi-tenancy; OGCS is a portfolio controller across projects. | This is the crux of the architecture question; resolved in the decision document. | None for intake — noted so the owner sees the tension was identified. |

---

## 6. Unsafe / security flags

Full detail in `SECURITY_FLAGS.md`. Summary — **no credentials were found in the handoff package**, but three items need owner attention:

| # | Severity | Finding | Action |
|---|---|---|---|
| S1 | **Medium** | `01_REFERENCE_PACKS/searchevidencesuite-fixes_1.zip → search-evidence-console/proxy.php` ships with a **populated `$ALLOWED_HOSTS` list of the operator's own client domains and nine `*.<client-host>` preview hosts**. The file's own comment says this is the operator's private variant and not intended for the customer zip. Not a credential, but it is confidential business information (client roster + unpublished staging hosts) and it is now inside a handoff bundle. The Factory's `quality-gates` residue scanner specifically hashes and blocks these hosts, confirming they are treated as sensitive in the repo. | Do not forward this ZIP to third parties. Replace with a copy whose `$ALLOWED_HOSTS` is empty before any wider distribution. |
| S2 | **Low (informational)** | `apps/syed-ai/.env` exists in the Factory checkout on the Mac. It is correctly **gitignored and untracked**; it contains four keys (`DATABASE_URI`, `PAYLOAD_SECRET`, `NEXT_PUBLIC_SERVER_URL`, `S3_BUCKET`). Values were not read and are not reproduced anywhere. It was excluded from the sanitised snapshot used for analysis. | No action; noted so it is never packaged. |
| S3 | **Advisory (pre-emptive)** | The forthcoming Hostinger archives (M1, M3) will contain `wp-config.php` with `DB_PASSWORD` and the eight WordPress salts, and the SQL dumps (M2, M4) will contain `wp_users` password hashes, possibly `wp_options` API keys for plugins (SMTP, forms, SEO plugins, WooCommerce payment gateways), and possibly customer/order PII if WooCommerce is active. | Follow `SECURITY_AND_REDACTION.md`: sanitise `wp-config.php` before handoff; keep SQL only in the intended workspace; I will flag `wp_users`, `wp_options` secret rows and WooCommerce customer tables on receipt and exclude them from any generated CSV/report. |

No `.env`, private keys, `id_rsa`, `.pem`, credential dumps or unrelated customer backups were found in the handoff ZIP or in `review-materials/`.

---

## 7. Observations that affect the plan (non-blocking)

These came out of the reference-pack and code inspection and should be known before Phase 2 starts.

1. **OGCS has no implementation.** Everything from the database up is Sprint 1–10 future work. Its two external contracts (`ogcs-evidence.json` inbound; AI Build Pack outbound) are described in prose only, without schemas. Any "integration" in the near term is file-based by necessity.
2. **Search Evidence Suite has no API and no server-side state.** All H2O evidence would live in one browser's IndexedDB until exported. The GSC token is a short-lived browser token. The `ogcs-evidence.json` export the OGCS spec asks for **does not exist in the app** (`ogcs` appears zero times in `app.js`). It must be produced by a transformation of the `*.seoproject.json` export or added to the app.
3. **The Factory's legacy importer only handles a static HTML site.** `tools/legacy-extract/` walks the syed.ai static archive with Chromium. There is no WordPress (SQL/WXR) → blueprint importer yet; ADR-025 anticipates one. H2O needs it.
4. **The Factory's `redirects` collection is written but never served.** `apps/syed-ai/src/proxy.ts` hard-codes a few rules and does not read the collection; `seed.ts` does not seed the blueprint's `redirects[]`. For a migration whose success depends on a 301 map, this must be fixed before any H2O build.
5. **The Factory's blueprint (`version: 1`) has no schema validator**, unlike `design-contract.json`. Before a WordPress importer or OGCS starts emitting blueprints, a zod schema should exist.
6. **The Factory has pre-cut seams for search intelligence**: `SEARCH_USERS`/`searchRead` access role, `integrations.searchIntelligence.enabled = false` flag, `outbox` idempotency pattern, a generic Postgres-backed worker, `tools/baseline/ses-characterize.mjs` producing 27 deterministic Search Evidence fixtures (ADR-010). These strongly shape the architecture recommendation.
7. **The discovery-pack crawler needs outbound DNS.** It could not resolve `h2ocooling.com` from its packaging sandbox. It should be run from the Mac or a server, not from this cloud session, unless network egress to that host is confirmed.
8. **Two independent copies of the discovery pack exist** (in the ZIP and on the Mac). They are byte-identical in listing. Designate one as canonical to avoid divergence — I recommend the on-Mac copy under the new `h2o-handoff/` folder created during this intake.

---

## 8. What was done during this intake

- Extracted the handoff ZIP and verified all three reference-pack checksums.
- Read every document in `00_START_HERE/`, the export guides, deliverables list, manifest and validator.
- Read the complete discovery pack; read the OGCS spec, schema, playbook and build steps; analysed the Search Evidence Suite source (docs, `proxy.php` in full, `app.js` by targeted inspection).
- Requested access to `~/Projects/agency-site-factory-workspace/` on the Mac; inventoried `review-materials/`; confirmed `.env` is gitignored; produced a sanitised source snapshot (no `.git`, `node_modules`, `.env`, build output) and inspected the Factory at code level (collections, hooks, jobs, worker, seed, proxy, parity gate, CI, ADRs).
- Ran `verify_handoff.py`.
- Produced this report plus `MISSING_INPUTS_CHECKLIST.md`, `SECURITY_FLAGS.md` and `AGENCY_SITE_FACTORY_INTEGRATION_DECISION.md`.
- Placed an extracted copy of the handoff package at `~/Projects/agency-site-factory-workspace/h2o-handoff/` on the Mac so the export folders are ready to receive files, and saved this report set beside it.

Not done, by design: no crawl of the live site, no contact with Hostinger, no changes to any repo file, no deletion of `agency-site-factory-transfer/`.

---

## 9. Gate to Phase 2

Phase 2 may start when **all** of the following are true:

- [ ] M1 + M2 (OLD files + DB) present, with `EXPORT_NOTES.txt` naming domain and backup date
- [ ] M3 (+ M4 if WordPress) present, with `EXPORT_NOTES.txt`
- [ ] A1–A4 answered (which is OLD/NEW, which is live, NEW platform, WooCommerce status)
- [ ] `wp-config.php` in each archive sanitised or confirmed to be sanitised on receipt
- [ ] `verify_handoff.py` shows the four site rows as OK

Phase 3 additionally requires M5, M6, M9, M11, M13 and M16, and answers to A5–A7.
