# Response to the CLAUDE_H2O_OGCS_MASTER_HANDOFF_v1 package

**From:** Claude (Cowork), on behalf of Syed · **Date:** 2026-09-05
**Re:** `CLAUDE_MASTER_PROMPT.md` Phase 1, `UPLOAD_MANIFEST.csv`, `AGENCY_SITE_FACTORY_ARCHITECTURE_QUESTION.md`, `CLAUDE_DELIVERABLES.md` (Intake + Agency Site Factory decision)

---

## 1. What was done

I followed the master prompt's first objective exactly: inspected the whole package, read the three reference packs, obtained and inspected the actual Agency Site Factory repository, validated the input package, and produced the intake deliverables. No live site was touched, crawled, or modified. No destructive or irreversible work was performed.

Package integrity: all three reference-pack SHA-256 checksums match `SHA256SUMS.txt`. `05_SCRIPTS/verify_handoff.py` runs cleanly.

## 2. Readiness verdict

**Not ready for Phase 2.** Reference material is complete; user-supplied evidence is entirely absent.

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

Full detail is in `INPUT_READINESS_REPORT.md` (present / missing / stale / ambiguous / unsafe), with a step-by-step collection guide in `MISSING_INPUTS_CHECKLIST.md` and findings in `SECURITY_FLAGS.md`. Nine ambiguities need owner answers before Phase 2, the important four being: which Hostinger site is OLD vs NEW (no hostnames were given), which is live at `h2ocooling.com` today, whether the NEW build is WordPress, and whether WooCommerce is active (your discovery pack says "WordPress/WooCommerce"; the master prompt says WordPress; the live spot-check mentions a large paginated product catalogue — this materially changes the URL inventory and the Payload content model).

## 3. Corrections and observations on the reference packs

These are things the package asserts or assumes that the code does not support. They matter for planning.

**3.1 Search Evidence Suite has no API and no `ogcs-evidence.json` export.** `OGCS_SYSTEM_SPEC_v1 §8` treats `ogcs-evidence.json` as a "new required export" from Search Evidence. The string `ogcs` does not appear in `app.js` (12,338 lines). The suite is a vanilla-JS static app with all state in IndexedDB (`seo-suite` v2), a browser-side GSC OAuth token that cannot be reused server-side, `X-Frame-Options: DENY`, and exactly two JSON export formats: `search-evidence-console/project` v1 (full project backup — the only one with raw rows and crawl pages) and `search-evidence-suite/snapshot` v1 (derived). Any OGCS integration in the near term must be an adapter over the `*.seoproject.json` export, or a new export added to `05l-export.js`. I designed the former (`evidence-bundle` contract) and drafted its schema.

**3.2 OGCS is entirely unbuilt.** The pack is a specification, JSON Schema, controller prompt and playbook seed. There is no HTTP API, event, or queue contract; both external contracts (inbound evidence, outbound AI Build Pack) are prose without schemas. Sprints 1–10 of `OGCS_NEXT_BUILD_STEPS_v1` are all future work. This is fine, but the architecture question should not be read as "integrate two existing systems"; it is "define the seams before either side is built".

**3.3 `proxy.php` in `searchevidencesuite-fixes_1.zip` ships the operator's private `$ALLOWED_HOSTS`.** Roughly eighteen client and `*.<client-host>` staging hostnames, with a code comment saying this variant is not meant for the customer zip. Not a credential, but confidential. The Factory's own residue scanner hashes and blocks these hosts, which confirms they are treated as sensitive. Recommendation: rebuild the pack with an empty allowlist before any wider distribution and regenerate `SHA256SUMS.txt`. Hostnames are not reproduced in any output.

**3.4 The discovery-pack crawler needs outbound DNS** (`08-NOTES/VALIDATION.md` already notes it could not resolve `h2ocooling.com`). It should be run from Syed's Mac or a server. Otherwise the pack is sound: constitution, triage rules, schemas, crawler and merger all read correctly, and the two copies (in the ZIP and on the Mac) are identical in listing.

**3.5 Two owner facts not in the package** that changed the architecture answer: OGCS is Syed's *own* control system, not a client-distributed product; and one of its jobs is to push his changes for client sites live. See §5.

## 4. Agency Site Factory — what the code actually says

Repo inspected at HEAD `88f5469` (8 commits, 25 ADRs) from `~/Projects/agency-site-factory-workspace/agency-site-factory` via a sanitised snapshot (no `.git`, `node_modules`, `.env`, build output). pnpm 10 + Turborepo; `apps/syed-ai` (Next 16.3.4 + Payload 3.88, one process), `packages/{agency-core, design-contract, quality-gates}`, `tools/{baseline, legacy-extract, parity, scripts}`, `legacy-reference/` (syed.ai static site + Search Evidence Suite, read-only, ADR-001).

Facts that decided the recommendation:

- **Per-client isolation is an invariant.** One process, one Postgres, one bucket, one secret set per client; no `clientId` (ADR-004, ADR-005). Exact dependency pinning enforced by `tools/scripts/check-versions.mjs` in CI. Migrations only (`push: false`), so every new collection is a migration in every client app.
- **The blueprint is the only content ingress** (`apps/syed-ai/content/syed-ai.blueprint.json`, `version: 1`, 20 pages, 131 blocks, 12 redirects). ADR-025 names it "the seam" and says WordPress and copy-deck importers will emit it. **It has no schema validator** (unlike `design-contract.json`, which is zod-validated with per-value provenance).
- **Jobs run only in a separate worker** on Payload's Postgres queue; one task exists (`sendMockEmail.ts`) and demonstrates the intended idempotency pattern (unique `outbox.idempotencyKey` + find-before-create). No Redis (ADR-004/014).
- **QA is a parity gate** (`tools/parity/compare.mjs`): JS-off fetch per route vs `docs/baselines/seo-baseline.json`; blocks on status, title, description, canonical, robots, OG/Twitter, single H1, JSON-LD type multiset and `@id` set, anchors, internal-link removals; accepts declared exceptions via `blueprint.parity.accept`. Plus Playwright e2e and an 84-test threat-model suite on real Postgres.
- **Pre-cut, unused seams for search intelligence already exist:** `SEARCH_USERS` role group and `searchRead` accessor (`access/roles.ts`, `access/index.ts` — defined, used by no collection), `integrations.searchIntelligence.enabled = false` (`globals/index.ts:289`), a "Search Intelligence run" job path and target `search-*` packages in `docs/architecture.md`.
- **ADR-023 forbids any `search-*` package in starter or client images until licensing terms are set.** ADR-010 says Search Evidence is characterised then extracted (`tools/baseline/ses-characterize.mjs` produces 27 deterministic fixtures in `docs/baselines/ses-fixtures/`; "local-first stays a product mode").
- **Gaps that bite a WordPress migration regardless of OGCS:** the `redirects` collection is written by the slug-change hook but never read — `apps/syed-ai/src/proxy.ts` hard-codes rules and has no reference to the collection, and `seed.ts` does not seed the blueprint's `redirects[]`; `verification.status` is stored but no hook enforces it at publish; `quality-gates` contains only the residue scanner; `tools/legacy-extract` handles a static HTML site only (WordPress is mentioned as future); `pages` has no migration-provenance fields; `users` is session-only with no API-key auth anywhere.

## 5. Answer to the single architecture question

**Recommendation: a specific hybrid, weighted toward "separate".**

OGCS runs as a **separate service** with its own repository, Postgres, scheduler, browser worker, artefact store and secrets, deployed once for the agency and never per client. Search Evidence Suite stays an **independent browser-first product**; an adapter converts its `*.seoproject.json` export into a schema'd `evidence-bundle`. The Factory gains **one dependency-free package** (`packages/seo-contracts`: zod schemas, types, golden fixtures, `validate` CLI for five contracts — depends on `zod` only, forbidden from importing `agency-core`), **one auth collection** (`service-accounts`, API-key only, single role `automation`), and — optionally, later — **one flag-gated Payload plugin** for editor-side evidence hints (`integrations.searchIntelligence.enabled`, off by default so ADR-023 stands).

Scores (13 criteria, 1–5): embedded in monorepo **26/65**; separate with ad-hoc connectors **53/65**; this hybrid **60/65**. The margin between the last two is entirely the contracts package and fixture-tested adapters. Full matrix in `AGENCY_SITE_FACTORY_INTEGRATION_DECISION.md §2`.

**Why not embedded:** OGCS is agency-wide state; ADR-005 makes each client image agency-state-free. Embedding puts a cross-client brain and GSC/SEMrush/Surfer credentials into every client deployment, forces OGCS tables into every client's migrations, drags a scheduler and browser worker into every client's pinned version matrix, and breaks ADR-010's local-first promise for Search Evidence.

**Why not plainly separate:** the seams already exist and are unused; leaving them unused means re-inventing blueprint, parity-accept and outbox semantics outside the repo with no contract tests.

**State ownership:** Search Evidence owns raw measurement; OGCS owns normalised evidence, project state, SEO decisions, experiments, tasks, QA *records*; the Factory repo (git) owns the build spec (blueprint v2) and the redirect map; Payload owns live content and the audit log; Factory CI *produces* QA results, OGCS *records* them.

**Connectors (files first, HTTP later, same payloads):**

| Contract | Direction | v1 | v2 |
|---|---|---|---|
| `factory.seo/evidence-bundle` | SES export → OGCS | file via adapter | same |
| `factory.seo/page-decisions` | OGCS → Factory | file in `apps/<client>/handoff/` | `GET /v1/projects/{id}/page-decisions/latest` |
| `factory.seo/blueprint` v2 | importer → seed | committed JSON | same |
| `factory.seo/qa-report` | Factory CI → OGCS | file | HMAC webhook via outbox job |
| `factory.seo/deploy-event` | Factory → OGCS | file | HMAC webhook via outbox job |

Every artefact carries a shared envelope: `contract`, semver `contract_version`, `produced_by`, `project_id`, ULID `run_id` (idempotency key), `inputs[]` with SHA-256 provenance chain. Draft JSON Schemas (2020-12) and worked examples are in the pack; all four transport contracts validate against their examples, and the three negative cases for `page-decisions` (PRUNE while `prune_blocked`, REDIRECT without `target_url`, `approved` without approver) are rejected at schema level — this encodes your `CONTENT_PRUNING_REVIEW_GATE.md`.

**Publishing model (owner clarification applied — "push my changes live"):** two lanes. **Lane A, structural** (URL create/remove/move, redirects, IA, PRUNE/CONSOLIDATE/NOINDEX): OGCS emits `page-decisions` → `tools/wordpress-import` / `tools/decisions-apply` → blueprint diff → PR → parity gate → deploy. **Lane B, content** (title/meta, body copy, internal links, ALT, new articles, schema data): OGCS writes via Payload REST as a per-client `automation` service account; hooks refuse slug/parent changes, refuse publish when `verification.status ≠ verified`, refuse noindex/canonical changes on `seo.lock` pages; no delete rights anywhere; every write lands in `audit-log` with the service account as actor and an `X-OGCS-Run-Id`. OGCS holds that one key per client and nothing else from the Factory (no `DATABASE_URI`, `PAYLOAD_SECRET`, S3). Rollback: `git revert` + re-seed for Lane A; Payload document versions or OGCS replaying its recorded change-set for Lane B; disable/rotate the service account to stop Lane B instantly.

**H2O end-to-end:** intake → security pass on archives → freeze OLD/NEW/live (discovery crawler from the Mac; `capture-baseline.mjs` on OLD) → `evidence-bundle R1` → `page-decisions R1` draft (Claude operating the OGCS controller prompt until the service exists) → owner approval → WordPress importer emits `h2o-cooling.blueprint.json` v2 (PRUNE never emitted; REDIRECT → `redirects[]`; `migration.*` provenance) → new `apps/h2o-cooling` seeded → staging → `qa-report` (parity vs OLD baseline, `protect_urls_missing = 0`) → launch gate → `deploy-event` → OGCS 30-day monitoring → weekly loop with Lane B green tactics.

**Risk assessment:** the integration itself is low-risk because only validated files cross the boundary; the risk concentrates in five pre-existing Factory gaps H2O hits regardless — redirects not served/seeded, no blueprint schema, no migration provenance, verification not enforced, no WordPress importer — plus the new service account. Mitigations: semver contracts with golden and negative fixtures in both repos; `null`-means-unmeasured and mandatory `coverage` so partial GSC never yields PRUNE; `run_id` idempotency and processed-run records; outbox retries 1m/5m/30m/2h/12h with dead-letter (already designed in `docs/crm-sync.md`); threat-model matrix gains an `automation` row; ESLint import boundaries; flags (`searchIntelligence.enabled`, `SEO_CONTRACTS_STRICT`, `WP_IMPORT_APPLY_DECISIONS` dry-run default); Payload migrations with `down()`; parity gate on syed.ai as the regression guard for every `agency-core` change.

**Proposed ADR-026** is written in the Factory's own ADR format (Status: Proposed) in the pack, with acceptance tests required before Accepted.

## 6. Deliverables produced (per `CLAUDE_DELIVERABLES.md` → Intake and Agency Site Factory decision)

- `INPUT_READINESS_REPORT.md` ✔
- `MISSING_INPUTS_CHECKLIST.md` ✔
- `SECURITY_FLAGS.md` ✔
- `AGENCY_SITE_FACTORY_INTEGRATION_DECISION.md` ✔ (v1.1, amended for the owner clarification)
- Additional, for the Factory team: `ADR-026`, `ogcs-runtime.md`, `publishing-lanes.md`, `seo-contracts.md` + 5 JSON Schemas + 4 examples, `factory-prerequisites.md`, `h2o-pilot-plan.md`, code sketches.

Not produced yet, correctly: `OLD_SITE_INVENTORY.csv`, `NEW_SITE_INVENTORY.csv`, `OLD_VS_NEW_COMPARISON.csv`, `URL_MASTER.csv`, `CONTENT_TRIAGE.csv`, `SEO_EQUITY_MAP.csv`, `MEDIA_MASTER.csv`, `INTERNAL_LINK_GRAPH.csv`, `REDIRECT_BASELINE.csv`, `SCHEMA_HREFLANG_BASELINE.json`, `DATA_GAPS.md`, `PRELIMINARY_PAYLOAD_CONTENT_MODEL.md` — these require the missing inputs.

## 7. Suggestions for a v2 of the handoff package

1. Add the hostnames/hPanel labels for OLD and NEW, and the WooCommerce answer, to `PROJECT_CONTEXT.md`.
2. Replace `searchevidencesuite-fixes_1.zip` with a copy whose `proxy.php` allowlist is empty; regenerate checksums.
3. Reconcile `OGCS_SYSTEM_SPEC_v1 §8` with reality: `ogcs-evidence.json` is to be *produced by an adapter* from the suite's project export (or added to the suite), and should adopt the `evidence-bundle` schema in this pack.
4. Add the `page-decisions` and `qa-report` schemas to the OGCS data model as the formal boundary with the execution layer; the AI Build Pack becomes an *internal* OGCS artefact that the importer turns into a blueprint, so the Factory keeps one ingress (ADR-025).
5. Note in `WORK_ORDER.md` Phase 5 that the Factory needs P1–P6 (`factory-prerequisites.md`) before Phase 6 can start on H2O, and that these can run in parallel with Phases 1–4.
6. `verify_handoff.py`: also check for `EXPORT_NOTES.txt` in each site folder and warn on `wp-config.php` without a `wp-config.sanitized.php` sibling.
