# OGCS × Agency Site Factory — write-up for the Factory team

**From:** Syed (owner) via Claude · **Date:** 2026-09-05 · **Decision:** proposed ADR-026 (in `01_ADR/`)

## What OGCS is, in one paragraph

OGCS (Organic Growth Control System) is Syed's own control system for organic growth across every client site the Factory produces. It is not a client-facing product and will not be shipped to clients. It runs once, for the agency, and does four things in a loop: pulls SEO evidence (from the Search Evidence Suite, GSC, SEMrush, Surfer, live SERPs), decides what should change on which site, pushes approved changes live, and verifies and reports the result. It is currently a specification with no code; its first real job is the H2O Cooling WordPress → Payload migration.

## The decision you need to plan around

OGCS stays **outside** the monorepo. The Factory does not absorb it, does not run it, and does not ship any of it. What the Factory *does* take on is small and mostly things H2O needs anyway:

1. **A contracts package, `packages/seo-contracts`.** Zod schemas + fixtures for five JSON artefacts that cross the boundary. It depends on `zod` only and must never import `agency-core`. OGCS installs it from npm. This is the whole "SDK".
2. **A `service-accounts` auth collection and an `automation` role.** OGCS pushes content edits live through Payload's REST API with a per-client API key. Scope is narrow (write pages/posts/media/redirects, no delete, no users, no CRM, no integrations). The existing audit hook records every write. This is how "push my changes for my clients live" works without OGCS ever touching a database or a `PAYLOAD_SECRET`.
3. **Blueprint v2 with a schema, `migration` provenance on pages, redirects actually served and seeded, `verification.status` enforced at publish, and a WordPress importer.** Four of these five are pre-existing gaps that a WordPress migration hits on day one; OGCS just makes the deadline real.
4. **Two small outputs from CI:** `tools/parity/compare.mjs` wraps its report as a `qa-report` artefact, and the app emits a `deploy-event`. Files first (committed to `apps/<client>/handoff/`), webhooks later behind a flag.
5. **Optionally, later:** a flag-gated `payload-search-plugin` that shows editors the current OGCS decision and evidence for the page they're editing. Off by default; ADR-023 stands.

## How OGCS will touch a client site — the two lanes

**Lane A, structural, through the blueprint.** Anything that creates, removes, moves or redirects a URL, or changes the information architecture, arrives as a `page-decisions` file. `tools/wordpress-import` (for migrations) or a future `tools/decisions-apply` turns it into a blueprint diff; the seed applies it; the parity gate has to pass before deploy. Git is where a human sees the change. OGCS never writes redirects or removes pages directly.

**Lane B, content, through the service account.** Titles, meta descriptions, body copy, internal links, ALT text, new articles, schema data on an existing page — the "green" tactics in the OGCS playbook — go straight into Payload via REST as the `automation` service account. Hard limits enforced in hooks: no slug changes (that's a redirect, Lane A), no publishing a page whose `verification.status` isn't `verified`, no `noindex` on a page with `seo.lock`. Rollback is Payload's document versions or OGCS replaying its own recorded change-set.

Both lanes land in the same `audit-log` with a distinguishable actor.

## What flows in each direction

| Artefact | Direction | Transport v1 | Transport v2 |
|---|---|---|---|
| `evidence-bundle` | Search Evidence export → OGCS | file (adapter) | same |
| `page-decisions` | OGCS → Factory | file in `apps/<client>/handoff/decisions/` | `GET /v1/projects/{id}/page-decisions/latest` |
| `blueprint` v2 | importer → seed (Factory-internal) | committed JSON | same |
| Lane-B content writes | OGCS → Payload | REST with service-account key | same |
| `qa-report` | Factory CI → OGCS | file in `handoff/qa/` | HMAC webhook via outbox job |
| `deploy-event` | Factory → OGCS | file | HMAC webhook via outbox job |

Every artefact carries `contract_version` (semver), `run_id` (ULID), `project_id`, and SHA-256 of its inputs. Same `run_id` twice is a no-op everywhere.

## Why not inside the monorepo

Three reasons from the code. ADR-005 makes each client image an isolated unit with no agency-wide state; OGCS is agency-wide state. `check-versions.mjs` pins every dependency exactly and fails CI on drift; OGCS needs a scheduler, a browser worker and its own Postgres, and would drag that into every client's version matrix. And `push: false` means every OGCS table would be a migration in every client app forever. Keeping it separate costs one small package and one auth collection.

## Why not fully separate with ad-hoc glue

Because the seams already exist and are unused: `SEARCH_USERS`/`searchRead` in `access/roles.ts`, `integrations.searchIntelligence.enabled` in `globals/index.ts`, the outbox idempotency pattern in `sendMockEmail.ts`, `blueprint.parity.accept` in `compare.mjs`, and the design-contract adapter shape. The contracts package just writes those seams down so both sides can test against them.

## What the Factory team should schedule

In order, each independently mergeable and guarded by the existing parity gate on syed.ai:

1. `packages/seo-contracts` with fixtures (new package, nothing consumes it yet).
2. `service-accounts` collection + `automation` role + threat-model rows + `verification` publish hook.
3. `proxy.ts` reads `redirects`; `seed.ts` seeds `redirects[]`; e2e for single-hop.
4. `pages.migration` group; blueprint v2 schema wired into `seed.ts`.
5. `tools/wordpress-import` against a small SQL fixture.
6. `compare.mjs` emits `qa-report`; app emits `deploy-event` (file).
7. Later: `emitWebhook` job; `payload-search-plugin`.

Detailed acceptance criteria per item are in `02_DOCS/factory-prerequisites.md`; code sketches in `04_FACTORY_CHANGE_SKETCHES/`; the H2O sequencing in `02_DOCS/h2o-pilot-plan.md`.

## What the Factory team does *not* need to do

Build OGCS. Host OGCS. Run the Search Evidence Suite. Hold GSC/SEMrush/Surfer credentials. Give OGCS database access. Ship anything search-related in a client image.
