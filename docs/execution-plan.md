# Agency Site Factory — evidence-led execution plan

**Prepared:** 3 September 2026  
**Status:** Plan complete; Release 0 source preservation and static inventory complete; product implementation not yet started  
**Planning basis:** Direct inspection of the supplied Syed AI site, Search Evidence Suite, and Claude master prompt

## 1. Executive decision

Do not implement the Claude prompt as one large “Milestone 1.” It combines a public-site migration, a CMS, CRM, transactional and inbound email, a design compiler, a WordPress importer, a crawler, a search-analysis product, several AI providers, deployment automation, and an agency replication system. That is too much coupled change before a single production path has been proven.

Build the program as a sequence of deployable vertical slices:

1. **Protect and characterize the legacy products.** Freeze source, record routes and data behavior, build characterization fixtures, and resolve immediate secret/licensing risks.
2. **Ship the Syed AI pilot on a narrow production foundation.** Next.js + Payload + PostgreSQL, exact public URL/SEO parity, a typed block system, one complete lead workflow, newsletter consent, mock email, and AI disabled.
3. **Extract the reusable factory from the proven pilot.** Only generalize components and schemas that the pilot exercised.
4. **Add WordPress migration as an independently testable pipeline.** Dry-run and parity reports first; import second.
5. **Characterize and modularize the Search Evidence Suite without breaking its local-first trust model.** Extract deterministic engines behind golden tests before building a hosted integration.
6. **Add optional integrations and operational hardening.** Real email, inbound sync, AI adapters, client generation, backup/restore, and replication rehearsal come after the core product is stable.

This changes the critical path from “invent the whole factory” to “prove one safe, editable, measurable production site, then extract what is reusable.”

## 2. What was actually supplied

| Input                                         | SHA-256                                                            | What it contains                                                                                                                                                                 | Planning implication                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `syed-ai-site.zip`                            | `426b6da589708c43bb79ae507bda621010c008e22a67f0b668eb6a7a2219cf62` | 85 entries; static HTML/CSS/JS, five indexed pages, PHP form/newsletter/roadmap endpoints, PHPMailer, assets, design notes, and a preliminary Payload subscriber schema/importer | This is a working reference product, not a Payload application ready to extend. Migration must preserve behavior rather than wrap the PHP implementation.              |
| `searchevidencesuite-ai-readiness.zip`        | `d60051ffb5ea0f7ca0e67744da174795be963488e1a13e89a34d1631448e230b` | 19 files; 742 KB JavaScript application, 45 KB CSS, split and single-file builds, optional PHP crawl proxy, documentation and assets                                             | This is a substantial local-first product. It needs characterization and incremental extraction, not a rewrite or iframe.                                              |
| `Claude_Agency_Site_Factory_Master_Prompt.md` | `061e48d8d598c39e1e494fb2a9d8145c351ee80f0580df3b8088c46c93ce0f9d` | 728-line aspirational architecture and requirements prompt                                                                                                                       | It is treated as product input, not executable authority. Every proposed feature remains subject to evidence, scope, compatibility, and acceptance gates in this plan. |

Unmodified extracted copies are preserved under:

- `legacy-reference/syed-ai-site/`
- `legacy-reference/search-evidence-suite/`

The preserved copies were compared recursively with the extracted archive contents and matched.

## 3. Current product map

### 3.1 Syed AI public routes

The sitemap contains exactly five indexable URLs, all with trailing slashes and page-specific metadata:

| Route                     | Current purpose                                           | Must preserve                                                                                            |
| ------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `/`                       | Main narrative site and application-like homepage         | Canonical, metadata, schema graph, navigation, interactive tools, forms, assets, trailing-slash behavior |
| `/geo-pricing/`           | Published GEO pricing                                     | Copy, prices pending business verification, canonical, social card, JSON-LD, internal links              |
| `/geo-vs-seo/`            | GEO versus SEO comparison                                 | Comparison content, canonical, social card, JSON-LD, internal links                                      |
| `/cited-not-recommended/` | Evidence-led article about citation versus recommendation | Claims/citations, canonical, social card, JSON-LD, internal links                                        |
| `/glossary/`              | Twelve-term AI-search/GEO glossary                        | Definitions, term schema, canonical, social card, internal links                                         |

There is also a genuine `404.html`. Each indexed page has one H1 in the supplied markup. The homepage contains a large linked JSON-LD graph; it must be migrated from facts, not copied as an opaque string.

### 3.2 Homepage states and tools

These are client-side hash states on `/`, not additional indexable routes:

- `#overview` — narrative overview and answer simulator.
- `#work` and `#case/<slug>` — six modelled scenarios and scenario detail.
- `#building` — product/venture cards.
- `#services` — three engagement tiers and the 90-day process.
- `#scorecard` — weighted self-reported AI visibility quiz with ranked gaps.
- `#roi` — editable twelve-month revenue model.
- `#contact` — nine-field lead brief.
- `#newsletter` — newsletter signup anchor.
- Command palette, mobile action bar, animated counters/progress, and a nine-question chat intake route users into these states.

The migration may implement these as accessible in-page regions or real routes, but existing hashes must continue to work. A redirect from a hash is impossible at the server, so the client router needs a compatibility adapter if the information architecture changes.

### 3.3 Syed AI server behavior

| Flow             | Current behavior                                                                                                                                  | Migration target                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Brief form       | Validates input; origin/referrer checks; honeypot, dwell-time, rate and global caps; optional Turnstile; sends SMTP notification; spools failures | Validated server action/route; transactional database write first; idempotency key; lead/contact/activity transaction; queued notification; generic response |
| Chat intake      | Collects the same lead fields progressively and posts to the same endpoint with context                                                           | Same domain service as the brief form; one validation schema; source metadata retained                                                                       |
| Roadmap request  | Fetches the submitted site, derives deterministic findings and a 90-day plan, then emails it                                                      | Background job; hardened outbound-fetch service; stored run/evidence; bounded resource policy; email rendering separated from analysis                       |
| Newsletter       | Creates pending subscriber, sends confirmation, records consent, confirms/unsubscribes via signed links                                           | Subscriber/consent/suppression records; hashed single-purpose tokens with expiry; queued mail; idempotent state transitions                                  |
| Subscriber admin | Query-string-key-gated dashboard and CSV/Payload export over an append-only JSONL file                                                            | Authenticated Payload collection and export action; access control; audit log; no URL secrets                                                                |
| Diagnostics      | Publicly deployed key-gated diagnostic page can inspect and send test mail                                                                        | Remove from public surface; authenticated health/readiness endpoints with non-sensitive output                                                               |

### 3.4 Search Evidence Suite capability map

The supplied console is a browser application with 23 visible panels and two presentation tiers. “Simple” hides advanced panels but uses the same engines and scores.

**Set up and ingest**

- Project configuration and market/filter context.
- Data acquisition instructions.
- CSV, TSV, XLSX, ZIP, JSON, NDJSON and gzip ingestion.
- Google Search Console OAuth and API ingestion.
- Sitemap/robots discovery and live crawl through an optional proxy.
- Data gate that reports missing evidence instead of treating absence as zero.

**Analyze**

- Five-pillar scorecard and versioned score logic.
- Search findings, topic clustering, page ownership and cannibalization signals.
- Internal-link opportunities.
- Technical, sitemap, media, schema and hreflang analysis.
- SERP-feature analysis.
- Google generative-search data and manually recorded AI observations.
- Backlink and page-link-profile comparisons.
- Ranked action queue with evidence attached.

**Deliver**

- Evidence-based content briefs.
- Live draft editor using the same readiness engine as crawled pages.
- Image optimization/export bundle with WebP derivatives and manifest.
- Optional AI writing assistance using a user-supplied key.
- Prompt packs.
- Reports, snapshots, comparisons, CSV, XLSX, project backup and browser/PDF output.
- Capability/coverage map and methodology reference.

**Current persistence and trust boundary**

- IndexedDB database `seo-suite`, version 2.
- Stores: `projects`, `datasets`, `crawls`, `runs`, `drafts`, `meta`.
- Google access tokens are held in memory.
- AI keys are intended to be held in memory and not in a project or local storage.
- The licence marker is stored in local storage.
- Search data is processed locally except for explicit Google API, AI-provider, and crawl-proxy operations.

**Current data flow**

```text
exports / GSC API / crawl / manual observations
                    │
                    ▼
          classify + normalize rows
                    │
                    ▼
      data gates + deterministic evidence model
                    │
        ┌───────────┼────────────┐
        ▼           ▼            ▼
     scoring     analyses      clusters
        └───────────┼────────────┘
                    ▼
        actions / briefs / draft checks
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
 IndexedDB project       exports/reports
```

The hosted product must not silently reverse this privacy promise. The standalone/local edition remains local-first. A later collaborative edition can store explicitly selected projects in PostgreSQL, with clear consent, retention, encryption, access, and export/delete controls.

## 4. Where the Claude plan needs correction

1. **Its first implementation milestone is not a milestone.** It includes the platform, design system, CMS, forms, CRM, mock email, AI-off mode, Docker, the entire public-site migration, and all interactive tools. That is several releases and leaves no early deployable checkpoint.
2. **It proposes too many packages before change boundaries are known.** A package for every noun creates build and versioning overhead without proving independent reuse. Start with fewer cohesive packages and split only when ownership, dependency, or release cadence differs.
3. **It treats PostgreSQL as an unconditional replacement for IndexedDB.** That breaks the Search Suite’s core local-processing and privacy proposition. Collaborative persistence should be a product mode, not a hidden migration side effect.
4. **It mixes characterization and extraction.** The 742 KB monolith has many deterministic engines but no supplied automated suite. Golden fixtures must lock behavior before functions are moved.
5. **Its definition of done mixes product code with external operational proof.** Real Gmail/Stalwart, backup restoration, DNS, Cloudflare, and staging deployment require environments and credentials. They need separately authorized readiness gates, not pretend local completion.
6. **It understates content and legal verification.** The current site contains prices, office details, quantified claims, modelled scenarios, product statuses, and many structured-data facts. Correct rendering does not prove those claims are current or publishable.
7. **It does not isolate a reversible launch.** The pilot needs migration parity, staged crawling, backup, rollback, and DNS cutover criteria before the legacy host changes.
8. **It leaves “current stable” dependency selection too loose.** Version selection should follow a short compatibility spike across Payload, Next.js, PostgreSQL adapter, storage, and the intended Node/Coolify runtime, then be pinned and recorded.

## 5. Target architecture

### 5.1 Deployment boundary

Each client gets an isolated application deployment, PostgreSQL database, object-storage namespace, encryption material and secrets. The first version is not a shared multi-tenant database.

Cloudflare remains the edge for DNS, TLS, CDN/WAF, Turnstile and optionally R2. The application itself runs on a Node-compatible Coolify deployment because Payload admin, database connectivity and background jobs are not a good fit for a static/edge-only deployment.

### 5.2 Logical system

```text
Public browser                 Staff browser
      │                              │
      ▼                              ▼
Next.js public routes        Payload admin / internal tools
      │                              │
      ├──────────────┬───────────────┤
      ▼              ▼               ▼
Content service   Lead service   Search project service
      │              │               │
      └──────────────┴───────┬───────┘
                             ▼
                        PostgreSQL
                             │
                  ┌──────────┴──────────┐
                  ▼                     ▼
             job worker             object storage
          email / crawl / import       media / reports
                  │
       ┌──────────┼──────────┐
       ▼          ▼          ▼
   email API   AI adapter  safe HTTP fetcher
   (optional)  (optional)  (scoped + SSRF controls)
```

### 5.3 Repository shape

Use a deliberately smaller starting structure than the Claude prompt:

```text
apps/
  syed-ai/                  # integrated Next.js + Payload pilot
  search-evidence-local/    # preserved standalone build and test harness
packages/
  agency-core/              # blocks, content/SEO fields, CRM domain services
  design-contract/          # schema, validator, tokens and adapters
  search-evidence-core/     # added only after characterization tests exist
  providers/                # email/AI interfaces; split only if warranted
  quality-gates/            # route, SEO, accessibility and migration checks
templates/
  client-starter/           # created after the pilot proves reusable seams
tools/
  create-site/
legacy-reference/
docs/
```

The first commit should not create empty packages for future concepts. A package is introduced only when at least one real consumer and an enforceable API boundary exist.

## 6. Execution releases and gates

Effort ranges are planning estimates in engineer-days, not delivery promises. They should be recalibrated after Release 1’s compatibility spike and characterization work.

### Release 0 — Forensics, safety and executable baselines (2–4 days)

**Build**

- Preserve and hash both archives.
- Produce route, feature, form, data-store, dependency, asset, metadata and schema inventories.
- Create sanitized fixtures for every import type we can prove from the code.
- Record the current score model/version, sample project output and deterministic calculations.
- Capture a safe local baseline for the five public routes and critical homepage states.
- Create the risk register, assumptions and decision log.
- Remove or quarantine sensitive values from any future working copy while keeping the frozen reference untouched.

**Gate**

- Every indexed route and important interactive flow has a named owner and acceptance fixture.
- No secret or client hostname from the reference can enter generated client output.
- Search calculations have golden outputs before refactoring starts.
- Licensing/ownership permits the planned internal reuse and client deployment model.

### Release 1 — Production foundation and one complete vertical slice (5–8 days)

**Build**

- Pin a tested Payload/Next/PostgreSQL/runtime matrix.
- Establish workspace, migrations, local PostgreSQL, object-storage abstraction, mock email and job worker.
- Implement users/roles, site settings, pages, media, navigation, redirects and a minimal approved-block registry.
- Implement the design contract and Syed token output from the supplied CSS/design notes.
- Migrate `/` plus one representative secondary page.
- Implement one lead capture path end to end: validation → contact → opportunity → activity → queued mock notification.
- Keep runtime AI completely disabled.

**Gate**

- A new database can migrate and seed from zero.
- Public content and metadata appear in initial HTML.
- The lead workflow is transactional and duplicate-safe.
- An editor can change representative copy/SEO without source edits.
- The app runs in containers with no real provider credentials.

### Release 2 — Syed pilot parity and reversible staging launch (6–10 days)

**Build**

- Migrate all five indexed routes and preserve compatible hashes.
- Port answer simulator, work/case views, ventures, scorecard, revenue model, command palette and chat intake.
- Port newsletter pending/confirm/unsubscribe/suppression flow.
- Port the roadmap analysis into a bounded background job using the safe-fetch service.
- Generate sitemaps, robots, canonical metadata, redirects and fact-derived JSON-LD.
- Import current subscriber data from a sanitized export using idempotent external IDs.
- Add representative browser, accessibility, metadata, form and security tests.

**Gate**

- Staged crawl matches every legacy indexable URL or has an approved redirect.
- No accidental noindex, canonical mismatch, missing H1, broken critical link or lost material content.
- Contact, chat, roadmap and newsletter flows pass success, duplicate, abuse, provider-failure and retry tests.
- Legacy deployment remains available for rollback until post-launch verification passes.

### Release 3 — Extract the reusable agency factory (4–7 days)

**Build**

- Move only proven generic blocks, SEO fields, lead services, consent workflows and provider contracts into `agency-core`.
- Add deterministic `design-contract.json` validation and token generation.
- Add `site-blueprint.json` validation and seed generation.
- Create the client starter from the working pilot, then add residue scans for Syed names, domains, addresses, analytics IDs, email identities and legal copy.
- Generate a second isolated sample client.

**Gate**

- The sample client uses distinct branding and database/storage/secrets configuration.
- Automated scans detect deliberately planted Syed residue.
- Upgrading `agency-core` is explicit, testable and reversible.

### Release 4 — WordPress migration and SEO parity pipeline (5–9 days)

**Build**

- Define normalized import records and an immutable import manifest.
- Implement dry-run WXR parsing first, then REST/CSV adapters as actual inputs require.
- Add Yoast/Rank Math mappings only against supplied fixtures.
- Add media download/validation, approved block mapping and a manual-review queue for unsupported Elementor/ACF content.
- Produce redirect and parity reports before writing to Payload.

**Gate**

- Import → rerun is idempotent.
- Failure of one record does not corrupt the batch.
- Baseline versus staged report flags lost URLs, canonicals, metadata, H1s, material content, internal links, images and schema types.
- No production migration runs without backup and rollback proof.

### Release 5 — Search Suite characterization and modular core (6–10 days)

**Build**

- Create golden fixtures for parsers, classification, normalization, data gates, scoring, clustering, technical checks, AI readiness, actions, snapshots and reports.
- Extract pure deterministic functions into `search-evidence-core` in small slices.
- Keep the local application functional after every extraction.
- Introduce versioned input/output schemas and explicit provenance types: `observed`, `reported`, `recorded`, `generated`.

**Gate**

- Golden outputs match within documented tolerances.
- Missing evidence remains `null`/unmeasured, never zero.
- Generated data cannot enter measured scores.
- The local edition still works without a server or account.

### Release 6 — Collaborative Search Intelligence (10–16 days)

**Build**

- Add authenticated search projects, datasets, crawl runs, audits, recommendations, briefs, drafts, snapshots and reports.
- Store collaborative projects in PostgreSQL only after explicit user choice; preserve a local-only mode.
- Add secure crawl jobs with verified project domains, network egress policy, redirect/DNS revalidation, budgets, time/size/content limits and audit logs.
- Link findings to CMS content by normalized canonical URL.
- Add accept/reject/assign/draft/verify workflows; publishing stays a separate human action.

**Gate**

- Permissions prevent cross-role and cross-client access.
- A recommendation contains evidence, affected URL, confidence, effort, owner, state and verification criteria.
- Re-crawl compares an observed result to a versioned baseline.
- No model suggestion can publish, redirect, send email or alter a measured score.

### Release 7 — Real providers and operations (8–14 days)

**Build**

- Add one production outbound email adapter before attempting inbound sync.
- Add bounce/suppression/unsubscribe processing and delivery events where the provider supports them.
- Add one sandbox AI adapter with structured output, budgets, redaction and full AI-off fallback; add further providers only from demonstrated demand.
- Add backup/restore automation, security tests, retention/deletion workflows, monitoring, staging, launch and incident runbooks.
- Rehearse a second-client provision, upgrade and rollback.

**Gate**

- Provider retries are idempotent and cannot duplicate sends.
- AI-disabled integration suite passes.
- Non-production backup restore is demonstrated.
- A non-developer operator can provision, stage, inspect and launch a sample client from the runbook.

## 7. Exact Release 1 implementation backlog

This is the first coding backlog, in dependency order.

### Checkpoint 1 — Compatibility spike

- Verify mutually supported versions of Node, Next.js, Payload, the PostgreSQL adapter, image/storage adapter and container base.
- Prove a minimal integrated app: public SSR route, Payload admin login, one migration, one seeded page, one queued mock job.
- Record exact versions and known constraints.

**Acceptance:** clean install, clean migration, clean production build, app and worker boot, no real credentials.

### Checkpoint 2 — Domain contracts

- Define schemas for site settings, brand facts, page, navigation, media, redirect, form, contact, opportunity, activity, consent and job/outbox records.
- Define stable service interfaces for lead intake, email delivery, safe fetch and audit logging.
- Define transaction and idempotency boundaries before UI work.

**Acceptance:** schema tests prove required fields, unique keys, role access and state transitions.

### Checkpoint 3 — Design and content slice

- Convert the documented Syed colors, type, spacing, grid, radii, motion and focus rules into `design-contract.json`.
- Generate CSS tokens deterministically.
- Implement header, footer, hero, rich text, evidence metric, CTA, form and article-prose blocks—the minimum set required by the first two routes.
- Seed homepage and one secondary page from the frozen source.

**Acceptance:** server HTML contains core copy, links, title, description, canonical and applicable JSON-LD; no generic starter visuals remain.

### Checkpoint 4 — Lead vertical slice

- Use one shared validation schema for brief and chat payloads.
- Normalize source page, UTM/campaign, referrer and consent fields.
- In one transaction, upsert contact, create or match an opportunity, append activity, and create outbox/job.
- Deliver to a mock provider and retain the rendered email for inspection.
- Add honeypot, server-side rate controls and optional Turnstile interface.

**Acceptance:** success, invalid input, duplicate retry, bot, rate limit and provider failure all have tests; no lead is lost when the email provider is unavailable.

### Checkpoint 5 — Editorial and release gate

- Give editors only the fields needed for the implemented routes.
- Add preview, draft/publish, revalidation and audit records for important changes.
- Add checks for empty title/H1, invalid canonical, accidental noindex, redirect loops and invalid required schema facts.
- Run production build and migration from an empty database.

**Acceptance:** a non-developer can change copy/metadata in admin, preview it, publish it, and see a revalidated public page without code changes.

## 8. Risk register

| Severity | Confirmed risk                                                                                                                                                    | Required response                                                                                                                                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical | `diagnose.php` and `subscribers.php` contain non-placeholder access constants in the supplied archive; query-string secrets can also leak through history/logging | Treat values as compromised, rotate if ever deployed, remove both public endpoints from the migrated system, and add secret/residue scanning                                                    |
| Critical | The Search crawl proxy archive contains a populated allowlist with identifiable domains, including a client and preview hosts                                     | Treat as confidential operational data; never copy it into distributable builds; generate allowlists from per-deployment secrets/config; scrub sample output                                    |
| Critical | User-controlled URL fetching exists in both the roadmap and crawl proxy                                                                                           | Retain the useful logic only behind a separately tested safe-fetch service with DNS pinning, redirect revalidation, private/reserved network blocks, scheme/port limits, budgets and audit logs |
| High     | The Search Suite is a large untyped monolith with no supplied automated test suite                                                                                | Golden fixtures and characterization tests before extraction; move pure functions incrementally                                                                                                 |
| High     | Moving Search Suite data to the server would change its stated privacy model                                                                                      | Preserve local-only mode; make collaborative sync explicit and consented; document what leaves the browser                                                                                      |
| High     | The public site’s JSON-LD includes many business facts, offers, locations and eligibility-sensitive schema types                                                  | Rebuild schema from validated CMS facts; content-owner sign-off; do not assume current markup is still accurate or eligible                                                                     |
| High     | Newsletter and lead data contain PII and consent evidence                                                                                                         | Controlled import, encryption/protection, least privilege, retention/export/delete workflow, audit logs and no production dumps in development                                                  |
| High     | SMTP send, state updates and file spooling are coupled in the legacy flow                                                                                         | Database transaction plus durable outbox/job; idempotency and retry tests                                                                                                                       |
| High     | Real email, AI, Search Console and storage integrations require credentials and external configuration                                                            | Complete mock/sandbox paths first; request credentials only at the relevant deployment gate; never block core functionality on an optional provider                                             |
| Medium   | Google Fonts are the public site’s only routine third-party asset request                                                                                         | Confirm font licence; self-host optimized WOFF2 files if permitted; retain strong fallbacks                                                                                                     |
| Medium   | The Search Suite licence permits purchaser/client use but prohibits resale/redistribution of the tool                                                             | Confirm ownership and commercial distribution model before factory packaging or white-labelling                                                                                                 |
| Medium   | Prices, office details, statistics, product statuses and scenarios may be stale or modelled                                                                       | Create a content verification ledger; require explicit approval before production publication                                                                                                   |
| Medium   | No Figma or WordPress input was supplied                                                                                                                          | Do not build speculative adapters in Release 1; define contracts, then test adapters against real fixtures when supplied                                                                        |

## 9. Quality and release policy

### Blocking failures

- Broken critical route or server error.
- Lost indexable URL without an approved permanent redirect.
- Accidental noindex, invalid/missing canonical, redirect loop or material metadata regression.
- Failed lead/newsletter persistence or duplicate outbound send.
- Unauthorized data access, exposed secret, unsafe outbound fetch or critical injection issue.
- Cross-client residue or data leakage.
- Critical keyboard/accessibility failure in a primary flow.
- Failed migration with unreported record loss.
- No tested rollback for a production data or DNS change.

### Advisory findings

- Title/description length.
- Content depth, wording, internal-link and evidence opportunities.
- Performance budgets that regress without crossing an agreed hard threshold.
- Optional AI/search-readiness suggestions.

Advisories appear in reports but do not masquerade as launch blockers.

## 10. Assumptions to use until contradicted

1. `syed-ai-site.zip` is the visual/content/behavior reference, but every business fact still requires owner verification before production publication.
2. `searchevidencesuite-ai-readiness.zip` may be modified for this project, while commercial redistribution remains limited by its supplied licence unless ownership grants broader rights.
3. The first deployable target is a self-hosted/Coolify Node application with PostgreSQL; Cloudflare is the edge, not the primary application runtime.
4. No production credentials or PII will be needed for Releases 0–1; mocks and sanitized fixtures are sufficient.
5. No Figma or WordPress inputs currently exist, so those adapters stay outside the first production critical path.
6. Existing public hashes should remain backward compatible even if later UI states become routes.
7. The local-first Search Suite remains a supported product; collaboration is additive.

## 11. Decisions needed before production, not before coding

These are intentionally deferred until the point at which the answer changes implementation or publication:

1. **Content authority:** who signs off current prices, addresses, statistics, case-study framing and structured-data facts?
2. **Commercial boundary:** is the Search Evidence Suite owned by this project, or used under the included purchaser/client licence? May generated client starters include its code?
3. **First real providers:** which outbound email provider and which object-storage provider should be the first production adapters? AI can remain disabled through pilot launch.
4. **Deployment control:** which Coolify/VPS and Cloudflare accounts are in scope for staging and production?
5. **Migration inputs:** when a real WordPress export is available, which site is the first importer fixture?

None of these blocks the compatibility spike, schema work, mock lead flow, design-contract extraction or public-route migration.

## 12. Definition of success for the program

The program is complete when:

- Syed AI runs on the new stack with public route, content, metadata, schema and interaction parity.
- Editors can manage validated content and SEO facts without source edits.
- Lead, newsletter and roadmap workflows persist safely and send through durable jobs.
- AI can be disabled without reducing core functionality.
- A second client can be generated and deployed without Syed residue or shared data/secrets.
- A sample WordPress import is idempotent and produces an actionable parity report.
- Search Suite deterministic behavior is fixture-locked, modularized and usable in both local-first and explicitly collaborative modes.
- Security, accessibility, migration, backup/restore and rollback gates are demonstrated with non-production data.
- Operational limits, recurring costs, provider dependencies and human approval responsibilities are documented honestly.

## 13. Immediate next action

Begin Release 0 by creating executable fixtures and baselines, then run Checkpoint 1’s compatibility spike. Do not start with a broad redesign, empty package scaffolding, production credentials or provider integrations.
