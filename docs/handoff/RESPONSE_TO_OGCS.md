# RESPONSE_TO_OGCS — Factory state for the OGCS side

**Factory HEAD:** `698db5b` (tag `c6.5-prep`, 2026-09-06) · **Binding architecture:** ADR-028 (accepted; not reopened) · **Reference:** `docs/ogcs-integration.md`, `docs/inputs/ogcs-integration-pack-v1/RESPONSE_FROM_FACTORY.md`

This document contains only what OGCS needs to build against the Factory. No credentials, account or client emails, hostnames of live client systems, or environment values appear here.

## 1. Contract versions

| Contract                      | Version | Status                                   | Zod source                                      |
| ----------------------------- | ------- | ---------------------------------------- | ----------------------------------------------- |
| `factory.seo/page-decisions`  | 1.0.0   | implemented, validated by fixtures       | `packages/seo-contracts/src/page-decisions.ts`  |
| `factory.seo/qa-report`       | 1.0.0   | implemented, **emitted by CI**           | `packages/seo-contracts/src/qa-report.ts`       |
| `factory.seo/deploy-event`    | 1.0.0   | implemented, emitter ready (deploy step) | `packages/seo-contracts/src/deploy-event.ts`    |
| `factory.seo/evidence-bundle` | 1.0.0   | schema only — Factory never stores these | `packages/seo-contracts/src/evidence-bundle.ts` |
| `factory.seo/blueprint`       | v2      | implemented, validated in seed and CI    | `packages/seo-contracts/src/blueprint.ts`       |

Package `@factory/seo-contracts` 1.0.0 (workspace; consumed as a tag-pinned git dependency or GitHub Packages under the owner's scope — never public npm). Package version tracks the highest contract MAJOR. A MAJOR bump requires a fixture and a changelog entry.

## 2. Schemas changed relative to the pack

- **Envelope rule:** no string anywhere in an artefact may match an email pattern; validation fails with `email address not allowed in artefacts ($.path)`. `produced_by` is `{system, version}`; `approved_by` is a handle (`^[^@\s]+$`).
- **`page-decisions.payload.site`** is `{source_origin, target_origin}` (as in the pack's example, not the pack's JSON Schema which said string).
- **`qa-report.blocking[].check`** gained `word_count` and `glossary_anchors` (the Factory's parity gate reports them); `environment` enum is `local|ci|staging|production`; `blocking[]/advisory[]` items may carry `note`.
- **`deploy-event.environment`** adds `preview` (PR preview deployments); `git_sha` is 7–40 hex.
- **`evidence-bundle`** is deliberately loose (measured blocks are `{provenance, …}` with any fields; `coverage` is a record of booleans/numbers; `findings` may be an array or a keyed object) — it validates the pack's example as-is. The Factory validates but never persists it.
- **`blueprint` v2:** required `parity {baseline, accept[], wordCountBlocking[]}`; optional `source.decisions_run_id`; per-page `decision_ref {run_id, source_url, action} | null` and `migration {...} | null`; `redirects[]` limited to `301|308|410` with `source` and `reason`; **new `gone[]`** list (`{path, status: 404|410}`) for legacy endpoints that must answer with no body — these are not redirects. Duplicate paths, duplicate `from`, non-410 redirects without a target and redirects that shadow a page are refused.

Generated JSON Schema (draft 2020-12) for every contract: `packages/seo-contracts/schemas/*.schema.json` (`pnpm --filter @factory/seo-contracts emit:json-schema`).

## 3. Relevant Factory interfaces

- **Validate anything:** `pnpm --filter @factory/seo-contracts validate <file…>` (detects the contract from `contract` or blueprint `version: 2`; exit 1 with JSON-pointer issues).
- **`effectiveAction(doc, page)`** — while `decisions_status = draft`, PRUNE / REDIRECT / NOINDEX / CONSOLIDATE degrade to REVIEW and the page imports as a draft. Only an `approved` run (with `approved_by`, `approved_at`) produces structural change.
- **Handoff files (transport v1):** `apps/<client>/handoff/qa/<run_id>.json` (Factory → OGCS, every CI run), `apps/<client>/handoff/deploy/<run_id>.json` (Factory → OGCS, from the deploy step), `apps/<client>/handoff/decisions/<run_id>.json` (**OGCS → Factory**, the file the importer / `decisions-apply` reads). Git history is the queue.
- **Redirect map (read-only, public):** `GET /api/redirects-map` → `{version, redirects: {from: {to, status}}, gone: {path: status}}` — active rows only; proposed rows never appear.

## 4. Migration assumptions (H2O and any WordPress site)

- Nothing H2O-specific has been built or invented; H2O becomes the first real fixture only when OLD/NEW archives, databases and SEO evidence are supplied and have passed the owner's security pass.
- The importer (`tools/wordpress-import`, architecture in `docs/wordpress-importer.md`) reads only content tables; never `users.user_email`/`user_pass`, comments, or WooCommerce customer/order tables; secret-looking `wp_options` are listed by name only.
- **Every `mailto:` and bare email address in imported content is removed** and replaced with a contact-form link; each removal goes to the review queue.
- Records without a decision, or under a `draft` run, import as drafts with `verification.status = unverified`.
- Every removed URL needs a redirect or explicit 410; the QA report's `protect_missing` check fails when a PROTECT URL is absent or not 200.
- Verification at publish: `VERIFICATION_ENFORCEMENT=enforce` is the production default (unverified content cannot be published); staging/CI run `warn`. The launch gate will require `enforce`.
- **Multilingual (ADR-029):** the Factory renders **no hreflang and no locales** today, and there is **no `hreflang` check in `qa-report` yet** — do not expect one, and do not treat its absence as a pass. Source sites are **not assumed monolingual**: the importer detects translation plugins, language settings and per-language permalinks from its parse stage and **fails loudly** rather than flattening variants. H2O proves the multilingual Payload implementation in its own isolated staging project; the Factory reconciles it at Release 4, at which point `qa-report` gains an `hreflang` check as a MINOR contract bump. Changing hreflang mapping stays **Lane A** (structural) exactly as the pack's decision table says; OGCS's `MULTI-001` tactic has no Factory write path until the reconciliation.

## 5. API / service-account behaviour (Lane B) — **not yet available**

The `service-accounts` collection, `automation` role and hooks are the next Factory milestone (C6.5 proper). When they land, the behaviour is exactly ADR-028 §4–5:

- Auth: `Authorization: service-accounts API-Key <key>`; header `X-OGCS-Run-Id: <ULID>` required on every write.
- Scope: `POST/PATCH /api/pages`, `/api/posts`, `/api/media` only. Writes land as **drafts** (`automation.pendingReview = true`, `automation.runId`).
- Refused with 4xx regardless of payload: `_status: published`, any `verification.*`, `slug` or `parent` change, `seo.noindex`/`seo.canonical` on a locked page, `media` without `rights` + `source`, any delete, any other collection.
- Redirects: OGCS may create `proposed` rows only (`status` forced); they are not served until a person activates them.
- Rate limit: per service account per minute plus `dailyWriteBudget`; 429 on excess. Treat 401/429 as `blocked`, never retry blindly. Rotating the client's `PAYLOAD_SECRET` invalidates all API keys (re-issue).
- Humans publish via the Automation review view; OGCS learns outcomes from `deploy-event` / `qa-report` (v1) or document status (v2).

Already in place today and relevant to Lane B: `pages.migration`, `pages.automation`, `seo.lock`, `redirects.status/runId/activatedBy`, and `requireVerifiedToPublish`.

## 6. QA / deploy artefact behaviour

- `qa-report` is produced on every CI run from the parity gate (`pnpm qa:report --report … --site … --env ci --base …`), validated against the contract in the same step, and committed under `handoff/qa/`. `result = fail` when any blocking finding exists (parity blocking checks or `protect_missing`). `inputs[]` carries the blueprint and baseline SHA-256.
- `deploy-event` is produced by the deploy step (`pnpm deploy:event --site … --env staging|production|preview --base … [--status rolled_back --previous <sha>]`), lists `migrations_applied` from the app's migration files, and is committed from staging/production deploys only.
- Both carry a fresh ULID `run_id`; the same run id twice is a no-op for consumers.

## 7. New restrictions since the pack

All ADR-028 amendments (drafts-only Lane B, scope limited to `pages`/`posts`/`media`, no `verification.*`/`_status` writes, `proposed|active` redirects, media rights, no public npm, real limiter, autosave bypass, `PAYLOAD_SECRET` coupling, plugin not a client dependency), plus:

- **No email strings in any artefact** (schema-level, both directions).
- **Raw Search Evidence / OGCS evidence is never stored in the Factory repository** — `evidence-bundle` is validated only.
- **`gone` paths are not redirects** and are served by the proxy from the blueprint, not from the CMS.
- **No hreflang/locale support and no hreflang QA check** until the ADR-029 reconciliation (Release 4). A migrated site with language variants stops at import rather than losing them.
- Redirect rows that existed before the `proposed|active` migration were backfilled to `active`; every new row defaults to `proposed` unless a human (or the seed, for blueprint rows) sets `active`.

## 8. Blockers

- Lane B (service account) is not yet implemented — OGCS cannot write to any Factory site yet.
- No `page-decisions` run has been consumed yet; the importer's parse/apply stages land in Release 4 against a synthetic fixture first.
- The repository's first push to GitHub is pending the owner's first push (`docs/runbooks/first-push.md`; ADR-031 — fresh history, no rewrite); until then contracts are consumed from a bundle, not a remote.
- H2O inputs (OLD/NEW files, databases, SEO evidence) are not supplied; the H2O freeze crawl has not been run.

## 9. Exact files OGCS should consume

- `packages/seo-contracts/src/*.ts` — the contracts (TypeScript/zod); `packages/seo-contracts/schemas/*.schema.json` — JSON Schema for non-TS consumers.
- `packages/seo-contracts/fixtures/valid/*.json` — golden examples (neutral domains); `fixtures/invalid/*.json` + `.expect.json` — the negatives every consumer should also reject.
- `apps/<client>/handoff/qa/*.json`, `apps/<client>/handoff/deploy/*.json` — Factory outputs to read.
- `apps/<client>/handoff/decisions/` — where OGCS writes `page-decisions` files (one per `run_id`).
- `docs/ogcs-integration.md`, `docs/wordpress-importer.md`, `docs/decision-log.md` (ADR-028), `docs/inputs/ogcs-integration-pack-v1/RESPONSE_FROM_FACTORY.md`.
