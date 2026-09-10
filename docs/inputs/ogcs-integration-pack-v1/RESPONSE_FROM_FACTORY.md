# Response from the Factory — OGCS Integration Pack v1

**Date:** 2026-09-05 · **Recorded as:** ADR-028 in `docs/decision-log.md` (the pack's "ADR-026" number was already taken by the Claude Design decision; ADR-027 is the design change pipeline) · **Factory-side reference:** `docs/ogcs-integration.md`

## Accepted as proposed

Separate deployment; five versioned contracts in a dependency-free package; Lane A structural changes through the blueprint and a PR with the parity gate; a `service-accounts` collection with a single fixed `automation` role; blueprint v2 with a schema; `pages.migration` provenance; `verification.status` enforced at publish; redirects seeded and served; `qa-report` and `deploy-event` as files first, webhooks later; the plugin optional and off; H2O as the first pilot with `apps/h2o-cooling` as the manual precursor to `create-site`. The gap findings (proxy/seed/redirects, verification hook, API-key auth, blueprint schema) were re-verified against the checkout and are correct.

## Amendments (binding on both sides)

1. **Lane B writes drafts only; humans publish.** Unattended live execution of `green` tactics is rejected — it is publishing, and the master prompt says humans approve publishing. Every Lane-B write lands as a draft version tagged `automation.pendingReview` + `runId`. An **Automation review** view in Payload gives bulk Approve / Reject / Hold by run, page or field, Revert run, and conflict flagging. OGCS reads outcomes from `deploy-event`/`qa-report` (v1) or document status (v2). `automationAutoPublish` per client, default off, may later allow ALT text and internal links to skip the queue — not before 90 days of clean runs.
2. **Lane B scope is `pages`, `posts`, `media` only** (the collections with drafts). `faqs`, `glossary-terms`, `schema-entities`, `citations`, `redirects` are out of Lane B; FAQ items and glossary terms are edited as blocks inside pages; schema-entity changes are Lane A or an admin.
3. **A service account cannot change `verification.*` or `_status`.** Without this the verification gate is vacuous (automation could verify its own article and publish it). Hooks refuse both regardless of role.
4. **Redirects are `proposed | active`.** Automation creates `proposed`; only `active` is served; a human activates or the next Lane-A apply adopts. "Advisory redirects served live" is rejected — it silently changes a ranking URL.
5. **The redirect map is not loaded through Payload's local API in `proxy.ts`.** Active redirects are materialised to a tag-revalidated internal endpoint cached by the proxy, with a build-time `redirects.json` fallback.
6. **Media by automation requires `rights` and `source`** (image rights are a publish gate, R34).
7. **Contracts are not published to public npm.** GitHub Packages under the owner's scope or a tag-pinned git dependency.
8. **Rate limiting.** `securityDefaults().rateLimit` is a Payload 2 option that Payload 3.88 neither types nor reads (verified) — the pack's assumption that a 300/min limit exists is wrong. The Factory adds a proxy-level limiter (per service account for `/api/*`; Postgres-backed for forms) and a Cloudflare rate rule. OGCS keeps its own budget and treats 401/429 as `blocked`.
9. **Autosave and machine drafts.** Automation drafts bypass autosave; a human edit after the draft flags a conflict and excludes the page from bulk approval.
10. **`PAYLOAD_SECRET` rotation invalidates API keys.** OGCS must expect re-issued keys after any rotation and never retry 401 blindly.
11. **`payload-search-plugin` is not a dependency of any client app** until licensing is decided — a flag that is off still ships code (ADR-023).
12. **Corrections to claims.** Parity covers the five legacy syed.ai routes (0 blocking), not "20/20"; the pack reviewed HEAD `88f5469`, before the repository was sanitised (legacy key and client allowlist redacted, history rewritten) — nothing in the pack is invalidated, and the pack itself correctly never enumerated those literals.

## New requirement: no email address on any public surface, and none in any artefact

Owner rule, now a platform invariant (ADR-028 §10). For OGCS this means:

- No email address in any contract artefact, header or payload — schema-level rule in `@factory/seo-contracts`; `produced_by` and `approved_by` are handles (the examples already comply).
- Lane B content never contains an email address (page text, ALT, links, schema data); the `no-public-email` gate fails the site and the `schema-entities` hook refuses `ContactPoint.email`.
- OGCS's outreach contacts, GSC account identities and any other mailbox never cross into `handoff/` or any Factory system.
- The WordPress importer strips `mailto:` links and email text from imported content (replaced by the contact-form link, listed in the review queue) and never reads `wp_users.user_email`, `wp_comments` author emails or WooCommerce customer tables — extend `wordpress-import-spec.md` accordingly.
- Clients are told at intake that their site carries no email; contact runs through forms; the privacy page may carry one alias mailbox created for the purpose, never a person's.

## Where the work lands on the Factory side

C6.5 (after C6): contracts package, service account + hooks + review view + threat rows, redirects, migration group, verification gate, limiter, email controls. C9: `qa-report`/`deploy-event` files, gates in launch mode. Release 4: WordPress importer with H2O as fixture. Later: webhooks (P8) when OGCS has an endpoint; `decisions-apply`; plugin.

## What the OGCS side should change in its pack

`publishing-lanes.md` (drafts-only Lane B, scope, `proposed` redirects, no rate-limit assumption), `ogcs-runtime.md` §4 (green tactics queue for approval; `automationAutoPublish` later), `automation-hooks.ts` (add `refuseStatusPublishedForAutomation`, `refuseVerificationChangeForAutomation`, `requireMediaRightsForAutomation`), `service-accounts.ts` (no change), `wordpress-import-spec.md` (email stripping and exclusions), schemas (email-pattern rejection), ADR number → 028.
