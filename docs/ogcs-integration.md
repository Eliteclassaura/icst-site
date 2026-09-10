# OGCS integration — Factory-side reference (ADR-028)

> OGCS (Organic Growth Control System) is the owner's private, agency-wide control system for organic growth. It is **separate** from this repository and is never distributed to clients. This document is what the Factory promises OGCS and what it refuses. The OGCS side's proposal is vendored under `docs/inputs/ogcs-integration-pack-v1/`; the Factory's amendments are in `RESPONSE_FROM_FACTORY.md` there and in ADR-028.

## The boundary in one table

| OGCS may…                                                                       | OGCS may never…                                                                                                |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Read the public site and `handoff/` artefacts (`qa-report`, `deploy-event`)     | Hold `DATABASE_URI`, `PAYLOAD_SECRET`, S3 keys, DNS, SSH or any admin password                                 |
| Submit `page-decisions` (structural change requests) that become a blueprint PR | Write redirects that are served, remove pages, change slugs or parents, or touch IA directly                   |
| Write **drafts** to `pages`, `posts`, `media` as a `service-accounts` identity  | Publish, verify, delete, change `verification.*`, `_status`, or `seo.noindex`/`seo.canonical` on a locked page |
| Create `proposed` redirects                                                     | Create `active` redirects                                                                                      |
| Carry `X-OGCS-Run-Id` so writes are idempotent and auditable                    | Include any email address in any artefact, header or payload                                                   |

## Two lanes

**Lane A — structural.** `page-decisions` (contract) → `tools/wordpress-import` (migration) or `tools/decisions-apply` (steady state) → blueprint v2 diff → pull request → gates (schema, seed dry-run, threat tests, e2e, **parity** with `parity.accept` taken from the decisions) → merge → seed → `deploy-event` + `qa-report` back to OGCS. Git is the review surface; `git revert` is the rollback. Used for: URL creation/removal, redirects, slug/parent changes, canonical/noindex on locked pages, IA and collection changes, every migration.

**Lane B — content, drafts only.** `POST/PATCH /api/{pages|posts|media}` with `Authorization: service-accounts API-Key <key>` and `X-OGCS-Run-Id: <ulid>`. The write lands as a **draft version** tagged `automation.pendingReview` + `runId`; the published page is untouched. Hooks make it impossible for a service account to publish, verify, delete, change slug/parent, edit locked SEO, or upload media without `rights` and `source`. Autosave is bypassed for automation drafts. Used for: `seo.title`, `seo.description`, OG/Twitter text, body copy in existing blocks, internal links, image ALT, new posts under existing routes, FAQ items and glossary terms _inside page blocks_, `seo.schemaExtra`.

## Humans publish — the Automation review view

Payload admin → **Automation review**. Pending drafts grouped by run → page → field, each with a plain-English diff, the tactic and its risk class. **Approve** (publishes), **Reject** (discards the draft), **Hold** — at run, page or field level. **Revert run** restores every document to its pre-run version. A page a human edited after the automation draft is flagged as a conflict and excluded from bulk approval until reviewed. Every approval writes an audit row (approver id, `runId`, fields) and a ledger row per run. Publishing authority is Payload's; OGCS learns the outcome from `deploy-event` / `qa-report` (v1) or by reading document status (v2). `automationAutoPublish` (per client, default off, not before 90 days of clean runs) may later let ALT text and internal links skip the queue.

## Contracts (`packages/seo-contracts`)

`blueprint` v2 · `evidence-bundle` · `page-decisions` · `qa-report` · `deploy-event`. Shared envelope `{ contract, contract_version, produced_by, produced_at, project_id, run_id, inputs[], payload }`; semver; `run_id` (ULID) is the idempotency key; `inputs[]` is the SHA-256 provenance chain. **No string anywhere may match an email pattern**; `produced_by`/`approved_by` are handles. Depends on `zod` only; lint forbids `agency-core` imports in both directions. Consumed as a tag-pinned dependency (GitHub Packages under the owner's scope, or git) — not public npm. Transport v1: files under `apps/<client>/handoff/{decisions,qa,deploy}/<run_id>.json`. v2: HMAC-signed webhooks through an outbox job (`OGCS_WEBHOOK_SECRET`, fail-closed readiness) once OGCS has an endpoint.

## Redirects

`redirects.status: proposed | active`. Automation creates `proposed`; the proxy serves `active` only; a human activates (one click) or the next Lane-A apply adopts or removes it. Active redirects are materialised to a tag-revalidated internal endpoint that `proxy.ts` fetches once and caches, with a build-time `redirects.json` fallback — Payload's local API is never loaded in the middleware. `seed.ts` upserts `blueprint.redirects[]` as `active` with `source: 'migration'`.

## Rate limits and revocation

`securityDefaults().rateLimit` was dead configuration (Payload 3 does not read it — R56). The proxy limits `/api/*` per service account (per-minute cap + `dailyWriteBudget`) and form routes per the C6 rules; a Cloudflare rate rule adds the edge layer. Disabling a service account (`enabled: false`) or rotating its key stops Lane B for that client immediately. Rotating `PAYLOAD_SECRET` invalidates every API key — re-issue and update OGCS afterwards (R58).

## No email on public surfaces — what OGCS must respect

The platform invariant (ADR-028 §10) applies to Lane B content: OGCS never writes an email address into a page, post, ALT text, schema data or link. The `no-public-email` gate would fail the site; the hooks refuse `ContactPoint.email`. Contact is through forms; the only alias lives on the privacy page and is not OGCS's to touch. OGCS's own outreach contacts never cross into any artefact.

## What the Factory does not do

Build or host OGCS; run the Search Evidence Suite; hold GSC/SEMrush/Surfer credentials; give OGCS database access; ship `search-*` code or the optional `payload-search-plugin` in any client image until licensing is decided (ADR-023).

## Where it lands

C6.5 (contracts, service account, hooks, review view, redirects, migration group, verification gate, limiter, email controls) · C9 (`qa-report`/`deploy-event` files, gates in launch mode) · Release 4 (WordPress importer with H2O as fixture; strips `mailto:`; never reads `wp_users.user_email`, `wp_comments` author emails or WooCommerce customer tables) · later (webhooks, `decisions-apply`, plugin).
