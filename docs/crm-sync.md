# CRM sync — design brief (proposed, 2026-09-04)

Owner statement: clients often already run a CRM (HubSpot, Pipedrive, others). The site's own web-lead CRM must therefore be able to **push every qualified lead into the client's system of record**, and later mirror the outcome back for attribution. This brief records the design so it can be scheduled; the decision lands as an ADR when the first adapter is built.

## 1. What the site CRM is, and is not

The built-in CRM (`contacts`, `companies`, `leads`, `activities`, `tasks`, `lead-score-rules`, `submissions`, `subscribers`, `outbox`) is the **system of record for web-lead facts**: what was submitted, from which page and campaign, with what consent, at what spam score, and how it was scored. It is not the sales team's working tool when the client already has one. The external CRM is the **system of record for the sale**: owner, stage, amount, notes, outcome.

Two records, two jobs. The integration copies the web-lead facts outwards once, reliably, and (optionally) copies the outcome back read-only.

## 2. Shape of the change

Everything slots into patterns that already exist; nothing is a new architecture.

| Layer                   | Today                                                                        | Change                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/providers`    | `EmailProvider` (mock, smtp) · `AIProvider` (mock, sandbox) — ADR-012        | **`CrmProvider`** interface beside them: `health()`, `upsertContact()`, `upsertCompany()`, `createLead()` (deal/opportunity), `addActivity()` (note/timeline), `mapFields()`. Adapters: `mock` (CI), `webhook` (generic, HMAC-signed), `hubspot`, `pipedrive`; others on demand.                                                  |
| Jobs (C6 pipeline)      | form → Contact → Lead → Activity → `notify-owner` / `send-confirmation` jobs | one more job: **`crm.sync`**, enqueued after the Lead exists, idempotency key `crm:<system>:<leadId>`. The visitor's response never waits on a third-party API.                                                                                                                                                                   |
| Content model           | CRM collections without external identity                                    | **`externalRefs[]`** on `contacts`, `companies`, `leads`: `{ system, externalId, url, syncedAt, status: pending/synced/failed, lastError }`. Sync failures are Activities of type `sync.failed` (so they show on the timeline and can be filtered).                                                                               |
| `integrations` global   | `turnstile`, analytics, AI flags, email provider                             | **`crm` group**: `provider` (none/webhook/hubspot/pipedrive), `pipeline`/`stage` defaults, `owner` default, `fieldMap[]` (standard field → provider property), `sendOnlyScoredAbove` (number), `sendSpamFlagged: false` (fixed), `mirrorStages: false`. Credentials stay in env / encrypted secret store, never in the global.    |
| Admin UX                | Leads list, contact record                                                   | Leads list gains a **Sync** column (pill: pending/synced/failed + link to the external record); contact record shows external links; **Sync now** and **Retry failed** actions; Integrations tab gets **Test connection**.                                                                                                        |
| Quality gates           | email `health()` preflight (R33)                                             | `CrmProvider.health()` in the launch checklist when a provider is configured; a nightly monitor: "every Lead older than 15 min has a `synced` ref or a `sync.failed` Activity" (no silent gaps).                                                                                                                                  |
| Threat model            | 17 vectors                                                                   | **V18 CRM sync**: token exposure (env/encrypted only, minimal scopes), webhook-URL SSRF (URL validated by the existing `safeFetch` egress policy — no private ranges, https only), PII over-sharing (field map is an allow-list; honeypot, IP, UA, spam internals never leave), replay (HMAC + timestamp on the generic webhook). |
| Privacy docs (R32)      | data map planned                                                             | External CRM listed as a **processor** per client; consent basis recorded on the Lead is what authorises the push; suppression list honoured before any push.                                                                                                                                                                     |
| Client intake kit       | brand facts, page list, hosting, legal owner, image rights                   | adds: **which CRM, who owns it, which pipeline and stage new web leads enter, default owner, consent basis, whether stage mirroring is wanted**.                                                                                                                                                                                  |
| Residue scan / starters | Syed identifiers forbidden                                                   | provider tokens and portal ids are client residue: scanned like any other id when a starter is generated.                                                                                                                                                                                                                         |

## 3. Adapters, in the order that earns the most for the least

1. **Generic signed webhook** (Release 2, ~0.5 d). `POST` the normalised lead JSON to a client-supplied HTTPS URL with `X-Signature: HMAC-SHA256(ts.body)` and a timestamp. Covers **n8n, Make, Zapier, Pipedream, a client's own backend** — and therefore every CRM those tools can reach — with no vendor code. This is also the self-hosted, free path the owner asked about: an n8n flow on the agency's own box maps the payload to any CRM. Ships with a receiving example (n8n workflow JSON).
2. **HubSpot** (Release 7, ~1 d, needs a client private-app token). Contacts + Companies + Deals via the CRM v3 API with `email` as the dedupe key (batch upsert); custom properties for `lead_score`, `utm_*`, `landing_page`, `consent_at` created on first sync when scopes allow, otherwise the field map points at existing ones. Timeline note with the brief text.
3. **Pipedrive** (Release 7, ~0.5–1 d, API token). Persons + Organizations + Leads (or Deals) with search-then-update dedupe by email; custom fields by key.
4. **On demand**: Salesforce (OAuth, more scaffolding), Zoho, Close, Attio, and open-source **Twenty / EspoCRM / Mautic** for clients who want self-hosted. Each is a separately authorised readiness gate requiring the client's credentials and a test account.

## 4. Rules that do not bend

- **One direction by default.** Push outward. Never overwrite what a salesperson typed in their CRM. Stage mirroring (below) is read-only and opt-in.
- **Never block the visitor.** The form answers from the local transaction; the push is a job with retries (1 m, 5 m, 30 m, 2 h, 12 h) and a dead-letter Activity.
- **Idempotent.** The job key and the external upsert-by-email make a retry safe; a duplicate submission (900 s dedupe) creates nothing locally and pushes nothing.
- **Allow-list, not deny-list, for fields.** Only mapped fields leave. Honeypot, IP, user agent, dwell time, spam score components and Turnstile tokens are never mapped.
- **Consent gates the push.** No `consent` record → no push; suppressed/unsubscribed contact → no push; `spam` verdict → no push.
- **Secrets in env or the encrypted per-client store**, minimal scopes, egress limited to the provider's hosts, every sync audited without PII values.
- **Mock in CI.** The whole suite passes with `CRM_PROVIDER=mock` and with no provider configured; adapter contract tests run against recorded HTTP fixtures, never live tenants.

## 5. Stage mirroring and attribution (later, opt-in)

The thing clients actually want is "which pages and campaigns produce closed-won". That needs the outcome to come back. Design: provider webhooks (HubSpot deal-stage change, Pipedrive deal updated) → a signed receiver route → update `leads.externalStage`/`externalAmount`/`closedAt` **only** (never local facts) → the Release 7 attribution report joins landing page/campaign to outcome at aggregate level (safe CRM attribution joins, as already planned). Estimate 1–2 d per provider; needs a webhook-capable plan on the client's side.

## 6. What this changes in the plan

- **ADR-012 extended**: providers = email, AI, **CRM**. Recorded when the interface lands (C6).
- **C6**: `CrmProvider` interface + `mock` + the `crm.sync` job + `externalRefs` fields + `integrations.crm` (interface only, no vendor calls) — +0.5 d.
- **Release 2**: generic signed webhook adapter + n8n example + Leads "Sync" column — +0.5 d.
- **Release 7**: HubSpot, Pipedrive adapters; optional stage mirroring; attribution report consumes mirrored outcomes — +2–4 d, each gated on client credentials.
- **Release 3 intake kit**: CRM questions added. **Threat model**: V18. **Privacy data map**: processors. **Risks**: R45 (duplicate/over-shared PII in a third-party CRM), R46 (silent sync gaps) with the mitigations above.

## 7. Open questions for the owner

1. Which CRMs do your current clients actually run? (Sets adapter order beyond the two proposed.)
2. Is n8n on your own server an acceptable default bridge for "everything else", or must each client have a vendor adapter?
3. Do you want stage mirroring in the first HubSpot/Pipedrive release, or attribution from the site's own data first?
4. Who owns the external CRM credentials per engagement — the client (preferred) or the agency?
