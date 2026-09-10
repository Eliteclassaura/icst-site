# `@factory/seo-contracts` — the five contracts

Draft JSON Schemas (2020-12) are in `03_CONTRACTS/schemas/`, worked examples in `03_CONTRACTS/examples/`. All four transport contracts validated against their examples on 2026-09-05; the three negative fixtures for `page-decisions` (PRUNE while `prune_blocked`, REDIRECT without target, `approved` without approver) are rejected as intended. In the Factory these become zod schemas exported from `packages/seo-contracts/src/`, with the JSON Schemas generated from zod for OGCS and any non-TS consumer.

## Envelope (shared)

Every artefact is `{ contract, contract_version, produced_by, produced_at, project_id, run_id, inputs[], payload }`. `contract_version` is semver: MINOR adds optional fields, MAJOR changes or removes anything. `run_id` is a ULID and the idempotency key; consumers keep a processed-runs record and treat a repeat as a no-op. `inputs[]` is the provenance chain (artefact name + SHA-256), so a live change can be traced back to the export that motivated it.

## 1. `factory.seo/evidence-bundle` — Search Evidence → OGCS

Produced by the `ses-to-evidence` adapter from `*.seoproject.json` (`search-evidence-console/project` v1). Immutable. Per page: `gsc`, `backlinks`, `crawl`, `surfer`, `ai_visibility`, each either `null` (not measured) or an object with numeric fields and a mandatory `provenance ∈ {measured, imported, recorded, estimated, generated, unknown}`. `coverage` states which sources were present and whether the GSC row cap was hit, so a consumer can refuse to make equity decisions on partial data. `findings` mirror the suite's `findings-*.json` fixture shapes; `action_queue` mirrors its `actions.json`. This is the `ogcs-evidence.json` the OGCS spec §8 asks for, given a schema.

## 2. `factory.seo/page-decisions` — OGCS → Factory

One row per source URL: `action` (PROTECT/IMPROVE/REWRITE/REPOSITION/CONSOLIDATE/REDIRECT/NOINDEX/PRUNE/REVIEW), `target_url` + `status_code` (required for REDIRECT/CONSOLIDATE), `page_type`, `project_scale_fit`, `strategic_fit_score` (0–40), `seo_equity_score` (0–40 or null), `seo_lock`, `prune_blocked`, `reason`, `why_should_this_exist`, `collection_hint`, `parity.accept`. A `redirects[]` list ready for the blueprint. `decisions_status: draft|approved`; `approved` requires `approved_by`/`approved_at`. Schema-level invariants: PRUNE requires `prune_blocked=false`; REDIRECT/CONSOLIDATE require a target. Importer-level invariant: when `decisions_status=draft`, PRUNE/REDIRECT/NOINDEX degrade to REVIEW and the page is imported as a draft. This encodes the discovery pack's `CONTENT_PRUNING_REVIEW_GATE.md`.

## 3. `factory.seo/blueprint` v2 — Factory-internal

The existing v1 shape (`apps/syed-ai/content/syed-ai.blueprint.json`) plus: `version: 2`; `source.decisions_run_id`; a required `parity` block (`baseline`, `accept[]` with path/check/reason, `wordCountBlocking`); `pages[].decision_ref {run_id, source_url, action}`; `pages[].migration {...}` (the provenance group from the discovery pack's candidate content model). `redirects[]` is now seeded. `seed.ts` validates the file before any write. `tools/legacy-extract` is updated to emit v2 so syed.ai stays on the same schema (its `decision_ref`/`migration` are null).

## 4. `factory.seo/qa-report` — Factory CI → OGCS

Wraps the existing `compare.mjs` report: `environment`, `base_url`, `baseline {kind, sha256}`, `blueprint_sha256`, `page_decisions_run_id`, `result`, `blocking[] {url, check, expected, actual}` with `check` enumerated (`status, title, description, canonical, robots, og, twitter, h1, schema_type, schema_id, anchor, internal_link, redirect, noindex, protect_missing`), `advisory[]`, `coverage {routes_checked, routes_in_decisions, protect_urls_missing}`, optional `e2e` and `lighthouse`. `protect_missing` is new: every PROTECT URL from the decisions must be present and 200.

## 5. `factory.seo/deploy-event` — Factory → OGCS

`environment`, `base_url`, `blueprint_sha256`, `git_sha`, `migrations_applied[]`, `status: deployed|rolled_back`, `previous_git_sha`. Lets OGCS open its post-launch monitoring window and correlate later evidence to a specific build.

## Package layout (Factory)

```
packages/seo-contracts/
  package.json          # deps: zod only; peer: none
  src/envelope.ts
  src/evidence-bundle.ts
  src/page-decisions.ts
  src/blueprint-v2.ts
  src/qa-report.ts
  src/deploy-event.ts
  src/index.ts          # exports schemas + inferred types + validate<T>()
  src/cli.ts            # `seo-contracts validate <file>` → exit 1 with JSON-pointer errors
  fixtures/valid/*.json
  fixtures/invalid/*.json          # each with expected error path in a sidecar .expect.json
  scripts/emit-json-schema.ts      # zod → JSON Schema for OGCS
  test/*.test.ts
```

ESLint: `no-restricted-imports` — `@factory/agency-core`, `payload`, `react` forbidden here; `@factory/seo-contracts` forbidden inside `agency-core`. Versioning: package version tracks the highest contract MAJOR; `versions.md` gains a row; a MAJOR bump requires a fixture and a changelog entry, and the OGCS repo pins `^MAJOR`.

## Transport

v1: files. `apps/<client>/handoff/{evidence,decisions,qa,deploy}/<run_id>.json`, committed. Git history is the queue and the audit trail.

v2: HTTP. OGCS exposes `GET /v1/projects/{id}/page-decisions/latest` and `POST /v1/projects/{id}/{qa-reports|deploy-events}`. Factory sends via a new `emitWebhook` job task: outbox row keyed `ogcs:<kind>:<run_id>`, body = the artefact, header `X-Signature: sha256=<HMAC(OGCS_WEBHOOK_SECRET, body)>`, retries 1m/5m/30m/2h/12h, dead-letter as a `failed` outbox row surfaced in admin. Same payloads; only the carrier changes.
