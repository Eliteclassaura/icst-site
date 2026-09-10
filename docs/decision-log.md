# Decision log

Architecture decision records, newest last. Status values: Proposed · Accepted · Superseded.

---

## ADR-001 — Preserve both archives unmodified under `/legacy-reference/`

**Status:** Accepted · 2026-09-03

**Context.** The master prompt requires an unmodified copy of each supplied archive so the migration can be diffed against the original. Both archives contain sensitive strings (a committed admin key; a private client allowlist).

**Decision.** Extract verbatim to `/legacy-reference/syed-ai-site/` and `/legacy-reference/search-evidence-suite/`. Do not edit, redact or reformat. Add a `LEGACY-REFERENCE-NOTICE.md` beside them stating that the directory is read-only reference material, contains known-compromised credentials that must be rotated on production, and must never be imported by application code. Add a quality gate (`packages/quality-gates`) that fails the build if any new package imports from or copies the allowlist / key strings out of `/legacy-reference/`.

**Consequences.** The repository must be treated as private. The owner is asked to rotate the key on production now (see `docs/risks.md` R1).

---

## ADR-002 — Discovery before design; no redesign from memory

**Status:** Accepted · 2026-09-03

**Decision.** Milestone 0 produced line-referenced inventories (`docs/discovery/`), a no-JavaScript SEO baseline for every route, screenshots at five viewports, and deterministic characterization fixtures for the Search Evidence engines before any new code was written. The design contract will be derived from the live CSS, not re-imagined.

---

## ADR-003 — pnpm workspace monorepo; start with few packages, split on evidence

**Status:** Accepted · 2026-09-03 (revised same day after reviewing `docs/execution-plan.md` §4.2, §5.3)

**Context.** The master prompt lists 13 packages. The execution plan argues, correctly, that a package per noun before change boundaries are known creates build and versioning overhead without proving reuse.

**Decision.** pnpm workspaces + Turborepo, TypeScript project references. The master prompt's layout remains the **target**; the **starting** set is:

```
apps/syed-ai                 integrated Next.js + Payload pilot
apps/search-evidence-local   preserved standalone console + test harness (thin wrapper over /legacy-reference)
packages/agency-core         blocks, content/SEO fields, CRM domain services, forms, roles, audit
packages/design-contract     schema, validator, adapters, token emitters (= design-compiler + design-system tokens)
packages/providers           email + AI interfaces and mock adapters; split when a second real adapter lands
packages/quality-gates       route, SEO, a11y, migration, residue checks
tools/, templates/, docs/, legacy-reference/
```

A package is introduced only when it has at least one real consumer and an enforceable API boundary. Expected splits, in order: `search-evidence-core` (Release 5, once fixtures exist — they do), `search-crawler` (when `safeFetch` gains a second consumer beyond the roadmap job), `email-providers`/`ai-providers` (second real adapter), `component-registry`/`design-system` (when `templates/client-starter` consumes them), `wordpress-importer` (Release 4), `payload-search-plugin` (Release 6).

**Alternatives.** Nx (heavier), plain pnpm scripts (no caching).

---

## ADR-004 — Next.js App Router + Payload 3 in one application process, Postgres adapter

**Status:** Accepted · 2026-09-03

**Context.** Payload 3 installs into a Next.js app and shares its process, which matches "Payload is the control plane; Next.js is the rendering layer" with the fewest moving parts.

**Decision.** One Next.js application per client (`apps/<client>`), with Payload mounted at `/admin` and `/api`, `@payloadcms/db-postgres`, and the public site rendered by server components. A separate **worker** entrypoint runs Payload's job queue for crawls, imports, email and AI jobs so web and worker can be scaled or isolated independently in Coolify.

**Consequences.** No Redis. Payload's Postgres-backed jobs queue is used; if load testing later shows contention, revisit (recorded as a deferred decision, not a plan).

---

## ADR-005 — Isolated deployment and database per client

**Status:** Accepted · 2026-09-03

**Decision.** Per the master prompt, no shared multi-tenant database with a `clientId`. Each client gets its own app container(s), Postgres database, R2 bucket/prefix, secrets and encryption key. `pnpm create-site` scaffolds that isolation. Shared infrastructure (the VPS, Coolify, Cloudflare account) is allowed.

---

## ADR-006 — Design contract is the only design input to rendering

**Status:** Accepted · 2026-09-03

**Decision.** `design-contract.json` (versioned, JSON-Schema validated) is compiled by `packages/design-compiler` into CSS custom properties, a typed token module, and font-face declarations. Adapters: `from-css` (existing site — used for Syed AI now, values labelled `"source": "inferred:site.css"`), `from-figma-tokens` (`figma-tokens.json`), `from-claude-design-package`. Components consume tokens only via CSS variables; no hex literals in components (lint rule).

**Why now.** The legacy `site.js` duplicates hex values for SVG charts (`C` object) — exactly the drift the contract prevents.

---

## ADR-007 — Styling: CSS Modules + custom properties, no utility framework

**Status:** Accepted · 2026-09-03

**Context.** The legacy CSS is a coherent, hand-written system (1,111 lines, square geometry, editorial rhythm). The master prompt warns against a generic template aesthetic and asks for CSS variables.

**Decision.** Port the design system as CSS Modules per component with all values from tokens. No Tailwind. Global layer for typography, rhythm, focus, reduced-motion. `text-wrap: balance`/`pretty` progressively.

**Alternatives.** Tailwind with a token theme — rejected: it would rewrite a working system into utility strings and invites drift from the contract. Vanilla-extract — viable but adds build complexity.

---

## ADR-008 — Approved block registry instead of free-form page HTML

**Status:** Accepted · 2026-09-03

**Decision.** `packages/component-registry` exports each block as `{ slug, payloadBlock, Component, fixture, tests }`. Pages are arrays of registry blocks. The Syed AI homepage is decomposed into blocks (hero, takeaway, evidence grid, comparison table, answer simulator, method steps, team, newsletter, glossary excerpt, FAQ, author, CTA, pricing table, tiers, 90-day steps, boundaries, related links, page CTA). Rich text uses Lexical with a restricted node set; raw HTML is a single admin-only, sanitized "embed" block.

---

## ADR-009 — Legacy PHP replaced by validated route handlers + Payload jobs; forms never block on SMTP

**Status:** Accepted · 2026-09-03

**Decision.** `POST /api/forms/brief|newsletter|roadmap` route handlers (zod-validated) implement the seven-step submission flow from the master prompt. Rate limiting and dedupe move from files to Postgres tables (`rate_buckets`, `submission_fingerprints`) with a small in-process LRU in front. Notifications, confirmation emails, roadmap scans and welcome emails are **jobs**. The legacy spool concept becomes a job-retry queue with dead-letter visibility in admin. `confirm.php` becomes `GET /newsletter/confirm` and `POST /newsletter/unsubscribe` (RFC 8058) with tokens signed by a dedicated `NEWSLETTER_TOKEN_SECRET` and a 30-day expiry for confirm links (unsubscribe links do not expire).

**Preserved behaviour.** Field names, honeypot + dwell check, spam scoring rules, typo-rescue with "Did you mean", disposable/known-domain lists (now CMS-editable), List-Unsubscribe headers, early response to the browser, `duplicate: true` response, no-JS form POST path with an HTML result page.

**Changed behaviour.** Roadmap opt-in default flips to unchecked (A15). `debug` detail never reaches the browser; errors are logged server-side with a correlation id.

---

## ADR-010 — Search Evidence Suite: characterize, then extract; local-first stays a product mode

**Status:** Accepted · 2026-09-03 (revised same day after `docs/execution-plan.md` §4.3, §6 Release 5–6)

**Context.** The master prompt says PostgreSQL replaces IndexedDB as the system of record in the integrated edition. The suite's documented value proposition is "nothing is uploaded; every figure is computed in this browser." Silently moving data server-side would reverse that promise.

**Decision on modes.** Two supported editions of one engine core: the **local edition** (browser, IndexedDB, no account, no server) remains fully functional after every extraction step; the **collaborative edition** (Payload + PostgreSQL) stores a project only after an explicit per-project choice, with documented retention, encryption, access, export and delete controls, and a visible statement of exactly what leaves the browser (GSC API calls, provider calls, server crawl). Characterization fixtures are the contract both editions must satisfy.

**Decision on extraction.** Release 5 extracts engines in the priority order of the discovery report §13.4, each behind a fixture test that must reproduce `docs/baselines/ses-fixtures/*.json` bit-for-bit (numbers compared at 1e-9). A `RULES_VERSION` is introduced alongside `SCORE_MODEL`; every stored score carries both plus a computed-at timestamp. Wall-clock reads become an injected `now`. The standalone browser edition stays runnable from `/legacy-reference/` and, once the core is extracted, from a thin browser bundle of `search-evidence-core` (best effort, not a launch gate). Evidence classes, `null` semantics and the "generated never scores" rule are encoded as TypeScript types (`Evidence<'observed'|'reported'|'recorded'|'generated', T | null>`), so violating them is a compile error.

**Normalisation on extraction.** Action `basis:'estimated'` → `reported`; `KIND_LABEL.aio_observation` gains a real producer (the observations recorder); drafts compute `statHits`/`attributedQuotes` so editor and audit scores agree; `ctrGap` threshold `10.4` is kept (fixture-pinned) and documented.

---

## ADR-011 — Crawler and all outbound fetch go through one SSRF-guarded fetcher

**Status:** Accepted · 2026-09-03

**Decision.** `packages/search-crawler/src/safe-fetch.ts` merges the stricter of the two legacy rule sets (`roadmap.php` 26–177 and `proxy.php` 130–260): http/https only, ports 80/443 (configurable per project), DNS resolution of every hop with the 23-CIDR blocklist plus IPv4-mapped normalisation, connection pinned to the vetted IP, manual redirect following (max 5) with re-vetting, response size/time caps, content-type allowlist, controlled UA, per-project host scope, robots compliance, structured request logging without bodies or secrets. The roadmap scanner, crawler, sitemap loader and editor URL import all use it. No general-purpose proxy endpoint exists in the integrated edition.

---

## ADR-012 — Provider-neutral email and AI interfaces with mock-first testing

**Status:** Accepted · 2026-09-03

**Decision.** `packages/email-providers` exposes `EmailProvider { send, getDeliveryEvents?, syncInbound?, health }`; adapters `mock`, `smtp` (nodemailer), `gmail-api`, `stalwart` (SMTP submission + JMAP). `packages/ai-providers` exposes `AIProvider { complete, structured, health }` with `mock`, `anthropic`, `openai`, `openai-compatible` (Qwen, Ollama, vLLM). Every call passes through a gateway that enforces tenant, permission, budget, timeout, retry, redaction, prompt-version logging and structured-output validation. Runtime AI is disabled unless `AI_ENABLED=true` and a provider is configured; the mock is what tests run against.

---

## ADR-013 — Testing stack

**Status:** Accepted · 2026-09-03

**Decision.** Vitest for unit/integration (including fixture parity tests), Playwright (Chromium, Firefox, WebKit) with `@axe-core/playwright` for public and admin flows at 360/390/768/1024/1440, Lighthouse CI on representative pages, `packages/quality-gates` for the SEO/metadata/schema/redirect/secret-scan gates that distinguish launch-blocking from advisory. Testcontainers-style disposable Postgres via Docker Compose for integration tests.

---

## ADR-014 — Deferred decisions

- **Analytics:** PostHog self-hosted vs Umami (the legacy copy names Umami). Decide at Release 7; both are privacy-safe and optional.
- **Redis:** not adopted; revisit only with load-test evidence.
- **Storybook vs lightweight fixture previews:** start with a `/dev/blocks` route rendering each registry fixture (zero extra tooling); add Storybook only if designers need it.
- **Case-study URLs:** proposed `/work/<id>/` (A4); confirm with owner before launch since it adds indexable URLs.

---

## ADR-015 — Adopt the evidence-led execution plan's release structure over the master prompt's milestones

**Status:** Accepted · 2026-09-03

**Context.** `docs/execution-plan.md` (supplied by the owner; its SHA-256 references to the three inputs were verified against the actual uploads and match) argues that the master prompt's Milestone 1 is several releases, that packages should be few until seams are proven, that the Search Suite's local-first model must survive, that characterization must precede extraction, and that operational proof (real providers, restore, DNS) needs separately authorized gates.

**Decision.** Plan and report work in the execution plan's **Releases 0–7**, with the master prompt's **Milestones 0–5** retained as a mapping in `docs/backlog.md` so every master-prompt requirement stays traceable. Release 0 is complete with this milestone's deliverables (the plan's Release 0 gates are checked in `docs/backlog.md`). Adopted additions: compatibility spike as the first coding checkpoint; a content verification ledger (`docs/content-verification-ledger.md`) as a launch gate; reversible-launch criteria; separation of code gates from operational-proof gates; "no empty packages".

**Corrections to the plan recorded here.** The scorecard has **six** pillars, not five (`SCORE_MODEL = 2`, app.js:1888–1909). Effort ranges are carried as planning estimates only. Where the plan and the line-referenced discovery reports differ, the discovery reports (verified against source) win.

---

## ADR-016 — Content verification ledger is a launch gate

**Status:** Accepted · 2026-09-03

**Decision.** Every business fact migrated from the legacy site — prices, office addresses/hours/geo, team size, follower and reach figures, subscriber counts, "prompts tracked daily", product statuses and progress percentages, modelled case-study figures, evidence statistics with their citations, schema `sameAs`/identity claims — is recorded in `docs/content-verification-ledger.md` with source location, current value, owner, verification status and date. Payload fields carrying these facts get a `verification` group (`status: unverified | verified | needs-change`, `verifiedBy`, `verifiedAt`, `note`). The quality gate blocks production launch (not staging) while any fact rendered on an indexable page or in JSON-LD is `unverified`.

---

## ADR-017 — C0 compatibility spike outcome: matrix accepted; trailing-slash handled in proxy.ts

**Status:** Accepted · 2026-09-03

**Context.** Release 1 required a tested version matrix before any product code (execution plan §7 Checkpoint 1). `spike/c0-spike` proved Node 22 · Next 16.3.4 · Payload 3.88.0 · `@payloadcms/db-postgres` · `@payloadcms/storage-s3` · PostgreSQL 16.13 together: clean install, migration created and run twice (idempotent), seeded page rendered server-side with title/description/canonical/body in the no-JS HTML, admin login via REST, one queued job executed by a **separate worker process** writing an idempotent outbox row, image upload round-tripped through an S3-compatible bucket including a sharp thumbnail, production build, and all three container entrypoints (web, worker, migrate) running as a non-root user from the exact file set the Dockerfile copies.

**Decisions.**

- The matrix in `docs/versions.md` is adopted for Release 1. TypeScript stays on 5.9.x; TS 7 is evaluated later.
- Canonical trailing slashes are enforced in `src/proxy.ts` for public routes only, with `skipTrailingSlashRedirect: true`; Payload's `/api` and `/admin` are never redirected. This replaces the naive `trailingSlash: true` from A14.
- Schema changes are migrations only (`push: false`) in every environment, including local dev.
- Jobs run only in the worker (`autoRun: []` in web). Release 1 keeps completed jobs (`deleteJobOnComplete: false`) with a retention job.
- `.dockerignore` excludes `.env*`; the quality gate scans images and standalone bundles for `.env` because Next copies it into `.next/standalone/`.
- MinIO is the local S3 in Compose; `s3rver` is the CI fallback where images cannot be pulled.

**Not proven in C0 (by design).** A Docker daemon was unavailable in the sandbox, so the Dockerfile was validated by reproducing its runner stage on the host rather than by `docker build`; the first CI run of C1 must build the image. Playwright/Vitest pins land at C1.

---

## ADR-018 — Security disciplines adopted from the owner's task-app build roadmap

**Status:** Accepted · 2026-09-04

**Context.** The owner shared a build roadmap for a separate product (`docs/reference-buildroadmap-other-project.html`: private task/time tracking, RLS, pg-boss, invite-only Google OIDC, Ollama + Qwen, age-encrypted backups, n8n-style licence) and asked what transfers.

**Adopted.**

1. **UUID primary keys** (`idType: 'uuid'` on the Postgres adapter) from C1 — the spike used serial ids, which make every leak vector guessable.
2. **`docs/threat-model.md`** with one automated test per leak vector: URL guessing, list/search endpoints, exports, emails/notifications, AI context, media URLs (CRM attachments access-controlled; site media public), logs, backups. Replaces prose-only risk statements as the security gate.
3. **Backup recipe:** nightly `pg_dump` → `age` encryption → `rclone` to R2, weekly automated restore test, alert when newest backup > 26 h (Release 7; restore test is part of the gate, not optional).
4. **AI gateway contract:** preview → human approve → write; permission-filtered context; private/PII fields never leave the deployment; provider + cost logged per call; local-first fallback chain (Ollama/vLLM → free hosted tier → paid) via the existing `openai-compatible` adapter. Free hosted tiers never receive client PII or unpublished content.
5. **Invite-only admin** (no self-signup) and DB-backed session revocation from C3. Google OIDC/MFA deferred until a second admin exists.

**Investigate, not commit.** Postgres RLS on `contacts`/`submissions` as defence in depth — Payload uses one DB role, so RLS needs per-request `SET LOCAL` in a hook; assess feasibility in Release 3.

**Deferred.** Open-sourcing the core: decide at Release 3 when the core is extracted. n8n's actual model is the Sustainable Use License (fair-code), not AGPL; pick one licence with legal review; the Search Evidence Suite's own licence and copyright ownership must be settled first (A11).

**Rejected.** Replacing Payload with a hand-rolled Prisma/Auth.js stack (loses admin, roles, versions, uploads, jobs, migrations for no security gain); Wagtail/Directus/Strapi/Astro+git-CMS for the reasons in the 2026-09-04 review.

---

## ADR-019 — C1 workspace outcome and gate behaviour

**Status:** Accepted · 2026-09-04

**Built.** pnpm 10 workspace + Turborepo 2; `apps/syed-ai` seeded from the spike with `idType: 'uuid'` and `deleteJobOnComplete: false`; `packages/quality-gates` (residue/secret scan + tests); `tools/eslint-config` (typescript-eslint, react, react-hooks, jsx-a11y, and the custom `factory/no-hex-in-components` rule enforcing ADR-006 on `components/**` and `blocks/**`); Prettier; Vitest 5; Playwright 1.62 with 15 public projects (3 engines × 5 viewports) plus a Chromium-only admin project and axe assertions; `tools/scripts/check-versions.mjs`; GitHub Actions CI (scan → versions → typecheck → lint → format → test → migrate twice → build → bundle scan → seed/worker/e2e; separate job builds the Docker image and asserts non-root + no `.env`).

**Gate findings during C1 — all real.** The residue scan immediately flagged (a) the literal legacy key that I had written into three of my own docs — now redacted to a file reference; (b) local `.env` files in the spike and app; (c) `.env` copied into `.next/standalone` by Next; (d) my own test file containing a `PRIVATE KEY` marker. Two false positives were fixed: `proxy.php` parsed as a hostname (file-extension TLDs excluded) and the owner's own domains (`syed.ai`, `websitecontentstrategy.com`) appearing in the confidential allowlist (exempted via `OWNER_DOMAINS`).

**Decisions.**

- The scan respects the root `.gitignore`, so a developer's local `.env` is not a finding; a committed `.env`, or one inside a build directory scanned explicitly (`scan apps/syed-ai/.next`), still fails. CI runs both.
- Confidential values never appear in the gate's source or output: the legacy key is matched by SHA-256; allowlist hosts are hashed at scan time from the preserved archive.
- ESLint stays at 9.39.x until `eslint-plugin-jsx-a11y` declares ESLint 10 support.
- `pnpm check` (not `ci` — reserved by pnpm) runs the whole chain locally.

**Not proven in this sandbox.** `docker build` (no daemon) and Firefox/WebKit e2e (browsers not preinstalled); both run in CI. Chromium e2e ran against the standalone server via `PW_CHROMIUM_EXECUTABLE`.

---

## ADR-020 — C2 outcome: design contract derived from the legacy CSS; one declared accessibility deviation

**Status:** Accepted · 2026-09-04

**Built.** `packages/design-contract` (zod schema v1 with provenance on every value; `from-css` adapter; deterministic emitters for `tokens.css`, `fonts.css`, `tokens.ts`, `contrast-report.json`; WCAG contrast arithmetic; Fontsource-based self-hosted font installer; CLI). `packages/agency-core/design-system` (global layer + `.ds-*` primitives + React primitives). `apps/syed-ai/design/design-contract.json` generated from the legacy stylesheet — 54 legacy custom properties preserved verbatim, 15 palette colours, 17 colour roles. `/dev/tokens/` preview. 13 unit tests + 3 e2e tests; CI regenerates the contract from the legacy CSS and fails on any diff (reproducibility gate).

**Decisions.**

1. **The legacy CSS is the source of truth for inferred values** (A1 confirmed): heading weight 600, `opsz 14`, display line-heights 1.1/1.14/1.2, breakpoints 1500/1180/900/600.
2. **One declared deviation:** legacy form-control borders (`--c-line` on `--c-surface-2`, 1.67:1) fail WCAG 1.4.11. New role `controlBorder` = palette quiet gold `#8A6A30` (3.62:1 on the input surface, 4.06:1 on canvas). Hairline dividers remain decorative and exempt. Recorded in the contract with `source.kind: declared` and a note.
3. **Fonts via pinned Fontsource packages** (OFL-1.1), not Google Fonts at runtime and not manually downloaded files: reproducible, licensed, versioned. Bodoni Moda uses the `latin-standard` build to keep the `opsz` axis the design depends on; Jost uses the variable `wght` build (one 26 KB file replaces three statics). Latin-ext behind `unicode-range`. Two preloads.
4. **Primitives ship as a prefixed `.ds-*` stylesheet from the package; page blocks use CSS Modules in the app** — a refinement of ADR-007 that avoids CSS-Module bundling coupling across workspace packages.
5. `tokens.css` emits legacy names **and** semantic role aliases so the migration can move selectors to roles incrementally while the parity gate holds.
6. `warning` colour has no legacy equivalent; the accent is reused and labelled `default` so a designer can decide later.

**Deferred.** `from-figma-tokens` and `from-claude-design-package` adapters (Release 3, when a Figma input exists); `docs/figma-contract.md` already defines the handoff so a file produced now will compile then.

---

## ADR-021 — Build-time design skills, effects blocks and a curated preset library

**Status:** Accepted · 2026-09-04

**Context.** The owner asked whether third-party UI/UX skills and component libraries (UI/UX Pro Max, Taste Skill, Design Motion Principles, Motion, Magic UI, SmoothUI, RetroUI) can be used, and whether "beautiful AI presets" can be applied to client sites easily. Research recorded in `docs/build-skills.md`.

**Decisions.**

1. **Skills are build-time only** and sit at the bottom of a fixed precedence: design contract → block registry → quality gates → skill advice. They are pinned under `.claude/skills/`, read in full before adoption, and never installed on client servers.
2. **Adopted at C3:** Anthropic `frontend-design`, plugin87 `ux-ui-agent-skills`, `ui-ux-pro-max`, and the three small fixers (accessibility, motion+performance, baseline UI).
3. **Adopted for Release 2:** `taste-skill`, `design-motion-principles`, jezweb `motion`. `motion` (Framer Motion) is the single accepted animation dependency, loaded via `LazyMotion`, always behind `prefers-reduced-motion` and the Lighthouse JS budget.
4. **Component libraries are not adopted wholesale.** Individual components from MIT free tiers are cherry-picked, re-tokenized (Tailwind classes → contract tokens) and registered as blocks in `agency-core/blocks/effects/` in Release 2 — first candidates: animated counter, logo marquee, text reveal, replacing the legacy counters/typewriter. Tailwind and shadcn are not added to the stack (ADR-007 stands).
5. **Presets** are design contracts (+ optional block variants + taste-knob settings). Release 3 ships a **curated library of five to eight** presets with distinct type pairings and geometry, selectable in `pnpm create-site`; generated page code is never accepted as a preset (only its tokens can be extracted). RetroUI is the first non-Syed preset candidate.
6. **Borrowed technique:** OKLCH single-hue palette generation added to the design-contract compiler roadmap (Release 3) so a client palette can be derived from one brand hue with contrast guaranteed.
7. **Noted tension:** the official frontend-design skill lists "near-black + hairlines + zero radius" as an AI default. syed.ai's system is a deliberate, source-documented decision; the contract wins for the pilot, and the skill's list is used as the anti-generic checklist for _new_ presets.

---

## ADR-022 — C3 outcome: content model, six roles, threat-model tests; no PostGIS; skills as pinned packages

**Status:** Accepted · 2026-09-04

**Built.** `@factory/agency-core/cms`: 40 collections and 12 globals (`docs/content-model.md`), six roles with least-privilege access rules, shared `seo`/`verification`/slug fields, audit-log hooks (PII values never logged), framework-agnostic revalidation hook (injected by the app), slug-change → 308 redirect hook, `securityDefaults()` (explicit CORS/CSRF, GraphQL off, playground off, telemetry off). `apps/syed-ai` mounts it with a restricted Lexical editor, live preview, UUID ids, retained job history. `docs/threat-model.md` with 84 passing tests against a real PostgreSQL (55-cell role × sensitive-collection matrix, URL-guessing → 404, list filtering in SQL, system-only collections, immutable activities, audit rows on publish/redirect/role-change, self-escalation stripped, lockout config, API surface). 183 tables, idempotent migration.

**Decisions.**

1. **Hidden documents return 404, not 403.** Payload's default; kept deliberately — it does not confirm existence (the roadmap's principle).
2. **No PostGIS.** The `point` field type requires the extension; offices store plain latitude/longitude numbers so any client Postgres works (`postgres:16-alpine`).
3. **GraphQL removed**, not merely disabled: route files deleted; REST only.
4. **Media `rights` and `alt` are required**, `rights: unknown` blocks production (R34). CRM attachments live in a separate private collection under an S3 `private` prefix.
5. **Build-time skills are pinned npm packages** (`ui-ux-pro-max-cli@2.15.0`, `ux-ui-agent-skills@2.5.1`) installed into `.claude/skills/` by `pnpm skills:install`; Anthropic `frontend-design` is vendored by content hash (GitHub API blocked here, so no commit pin). Installed copies are gitignored and regenerated; Renovate groups them for human review because they are prompts. **Excluded from UI/UX Pro Max:** its `cip`/`icon`/`logo` generators — they call the Gemini API, and build-time skills make no provider calls. The three "fixer" skills are pending source confirmation.
6. **Audit gate found a real vulnerability on first run:** `sharp` 0.34.5 carried libvips CVEs; upgraded to 0.35.4. `pnpm audit --prod --audit-level high` is now a CI step; Renovate configured (`renovate.json`) with grouped weekly PRs and manual approval for majors.
7. Residue scanner refined: `os.environ`/`process.env` reads are not secret values.
8. Seed refuses to run in production unless `SEED_ALLOW_PRODUCTION=1`; production admins are created by invitation.

**Not proven here.** Cloudflare Access in front of `/admin` (edge config; launch checklist R25). Firefox/WebKit and Docker in CI only.

## ADR-023 — Review round 1 outcome: eight findings resolved, six gaps added

**Status:** Accepted · 2026-09-04 · Trigger: owner review of the C3 dossier (eight notes, all verified against the repository).

**Findings and resolutions.**

1. **Turnstile contradiction (critical).** A18 said "disabled by default, parity"; the backlog recorded "enabled at launch" (R38); the content model said "on". A18 is rewritten. Rule: the public site key lives in the `integrations` global, the secret only in `TURNSTILE_SECRET`; a half-configured pair is a hard failure everywhere (`turnstileReadiness()` in `agency-core/cms/security.ts`, 5 tests); in production an unconfigured pair is a launch-gate block and the form route answers **503**, never "skip verification". The Release 0 parity baseline was captured without Turnstile and stays valid for HTML parity; production requires Turnstile.
2. **Search Suite commercial boundary blocks Release 3 (critical).** Provisional decision, in force until the owner decides distribution terms: **no `search-*` package, fixture or prompt ships in `templates/client-starter`, in `pnpm create-site` output, or in any client image**; the residue scan for starters gains a `search-evidence` forbidden-path rule. The monorepo keeps the code private (A11). This matters most for the client-hosted path, where code leaves our control.
3. **`hint` breakpoint mislabelled (medium).** Renamed `keyboardHint` in the adapter, the Syed contract and the Figma contract; it is the single 1500px media query that reveals the command-palette hint, not a layout tier. Breakpoint CSS variables are now kebab-cased (`--bp-keyboard-hint`). New tests assert that the Figma handoff document's `breakpoint`, `type/size` and `type/leading` names equal the compiled contract's keys, so a Figma export cannot produce an `inferred` duplicate scale (17 design-contract tests).
4. **Copy-deck importer absent from the backlog (medium).** Promoted from a dossier proposal to a Release 3 deliverable beside `site-blueprint.json`: structured Google Doc export (`.docx`/Markdown) → headings map to pages and sections, paragraphs and lists to approved blocks → manual-review queue → seed. v1 does not infer layout; unmatched content lands in `richText` blocks flagged for review.
5. **Backup-key custody lived only in backlog notes (medium).** Moved into `architecture.md` §4 and §5: offline key generation, password-manager plus offline copy, per-client keys, restore-with-new-key drill, sops/age for client-hosted servers, rotation runbook.
6. **Image rights will block staging (low).** Three legacy image families are `unknown` in the ledger; `media.rights: unknown` blocks production by design. Owner action before Release 2 staging: confirm the licence/photographer or replace with owner-made or AI-generated imagery marked as such. Added to the "Waiting on you" list; C5 acceptance gains the check.
7. **Copy inconsistencies (low).** Already in the ledger. Stronger fix adopted: counts in copy ("17 questions", "seven builds", "12 terms") are **derived from collections at render time**, never typed; `form-config` is the single source for select labels; C5 acceptance gains a test that no hard-coded count string appears in seeded copy.
8. **Skills pinning (low).** `MANIFEST.json` already recorded content hashes and Renovate already grouped skills for human review; the gap was that the installer recorded rather than verified. `pnpm skills:install` now **fails (exit 2) when a skill's hash or package version differs from the committed manifest**, unless `--accept-new-hash` is passed after reading the diff. First run caught real drift: Prettier had reformatted the vendored `frontend-design/SKILL.md` after the manifest was written; `.claude/skills/` is now prettier-ignored and the hash re-recorded. The "fixer" skills stay `pending`.

**Gaps found in the second review, added (G1–G6).**

- **G1 — No version control in the repository.** The build has lived in zip snapshots; there is no `git init`, so no history, blame or diff review. Owner to confirm the remote (private GitHub/Gitea) and the first commit; until then every checkpoint ends with a numbered zip. Recorded as R42.
- **G2 — Incident response for the legacy exposure.** R1 said "rotate or delete" without a procedure. `docs/runbooks/legacy-exposure.md` gives the order: remove or 403 the two scripts → pull `subscribers.jsonl` once over SFTP if still needed → inspect access logs for foreign hits on `subscribers.php`/`diagnose.php` → treat the list as exposed if any → rotate the Google app password (`diagnose.php` can confirm a password's validity) → record the outcome in the ledger. Rotation alone is explicitly _not_ the fix: the flaw is a key-in-file admin endpoint, which the new platform removes.
- **G3 — Content freeze and delta import for migrations.** Release 4 had no rule for content that changes on the source site during migration. Added: announce a freeze window; the importer records the source snapshot time in the manifest; a delta run imports only records modified after it; launch blocks if the delta is non-empty and unreviewed.
- **G4 — Checkpoint review cadence.** The dossier is now a standing artefact: every checkpoint closes with the dossier and `release-plan.md` updated, and the owner's review notes are answered in the next ADR (this one is the pattern).
- **G5 — Intent items were proposals, not work.** The nine "additions for your intent" in the dossier (client intake kit, copy-deck importer, WordPress triage report, preset library, client-hosted path, free/self-hosted AI profile, time-to-launch metric, operator handbook, demo client) are now backlog rows with a release each.
- **G6 — Generated and vendored files vs formatting.** Prettier had already touched vendored skills and could touch generated tokens; `.prettierignore` now covers `.claude/skills/`, generated design output and fonts, and CI formats the contract JSON before diffing.

**Consequences.** A18, `backlog.md`, `architecture.md`, `figma-contract.md`, `risks.md` (R38 mitigation, R42 added), `release-plan.md` (C4/C5/C9 acceptance) updated in this change; code: `install-skills.mjs`, `from-css.ts`, `emit/index.ts`, `security.ts`, two new test files, regenerated tokens.

## ADR-024 — C4 outcome: component registry with ten blocks, `/` rendered through it; namespaced stylesheets; git

**Status:** Accepted · 2026-09-04

**Built.** `@factory/agency-core/blocks`: `defineBlock` registry (`docs/component-registry.md`) with header, footer, hero, richText, takeawayList, evidenceGrid, faq, glossaryList, cta, briefForm — each a server component, a namespaced stylesheet on tokens and logical properties, a Payload config, real-copy fixtures and an a11y contract. `RenderBlocks` renders `pages.layout`; `chrome.ts` maps globals to header/footer/form props; `/dev/blocks` gallery; the seed now composes the legacy `/` from registry blocks with the exact legacy `<title>` and meta description, and `/` is the canonical home (`/home/` 308s to `/`). Offices gained `hoursDisplay`/`footerRole`; `form-config.selects` gained `label`. Migration `20260904_214439_blocks_registry` (22 tables). Stylelint 17 with `csstools/use-logical` over every stylesheet; global/primitives converted (R36). Repository placed under git (tag `c3-r1` → `c4`).

**Tests.** 53 Playwright tests green on chromium 360/1440 + admin (every fixture zero axe violations; no-JS text parity for six content blocks; tab order and visible focus through header and form, honeypot never focused; hero animation off under reduced motion; gallery ↔ manifest drift guard); 14 agency-core unit tests (CMS block set = manifest, fixtures carry no typed counts, sources required, anchors unique, chrome mappers, `resolveImage`); 84 threat-model tests still green after the schema change.

**Decisions.**

1. **Namespaced per-block stylesheets, not hashed CSS Modules** (refines ADR-007). Block class names must be stable for the parity diff, screenshot masks, residue scan and client overrides; `blk-<slug>__el` gives CSS-Modules discipline without hashes, and lint enforces tokens-only + logical-only.
2. **Fixtures are CSS-free files** (`fixture.ts`, `fixtures/index.ts`, `manifest.ts`) so Node runners (seed, vitest, Playwright) import them without a bundler; components import their fixtures, never the reverse.
3. **Payload configs live in one CSS-free `payload.ts`** so `payload.config.ts` never pulls React or CSS into the server/admin bundle.
4. **Full-bleed vs banded.** `hero` and `cta` own their geometry; every other block is wrapped in `.ds-band > .ds-container` by the renderer, with a hairline between consecutive bands — the legacy rhythm without per-block spacing code.
5. **Fixture imagery is generated SVG** (`placeholderImage`), never a client photograph — image rights are a publish gate (R34) and the gallery must not depend on unlicensed files.
6. **`form-config` is the single source of select labels** (R19): the brief form has no option fields of its own; the seed writes the legacy options once and chat (C6) reads the same rows.
7. **Table wrappers are focusable named regions** (`role="region"`, `aria-label`, `tabIndex=0`) — axe flagged the scrollable wrapper at 360.
8. **`/` is home.** The C3 redirect `/` → `/home/` was a parity defect; fixed now, tested in smoke.

**Found and fixed on the way.** Payload silently drops an array sub-field named `id` (collides with the row id) — FAQ anchors are `anchor`; a `NOT NULL` column added to a populated table needs a backfill step in the migration (hand-edited: add → `UPDATE … SET label = key` → set not null); a fixture had h1→h3 (axe `heading-order`) — fixtures are content and get the same rules.

**Not proven here.** Firefox/WebKit projects (CI); real media through `resolveImage` (C5 seeds images); Turnstile widget mount (C6 route + Release 2 key).

## ADR-025 — C5 outcome: legacy extracted to a blueprint, all five routes at parity, real URLs for hash views, SEO layer as data

**Status:** Accepted · 2026-09-04

**Built.** `tools/legacy-extract` (Chromium DOM + `site.js` literals via `vm`) → `apps/syed-ai/content/syed-ai.blueprint.json`: 20 pages, 131 blocks, 2 media files, 7 site-wide schema entities, robots/llms/manifest, redirects, hash-route map; parsed, never retyped, re-runnable. Six new blocks (dataTable, steps, relatedLinks, breadcrumb, subNav, offices) plus hero `eyebrow`, glossary `notes`, derived `{{count}}` copy. The seed consumes the blueprint (media by stable source key, parents before children, canonical never stored). SEO layer: `buildMetadata` (exact legacy titles via `title.absolute`, OG/Twitter overrides only where legacy differed, per-page static OG images), `buildJsonLd` (site entities from `schema-entities` with `emitOn`, WebPage/BreadcrumbList/Article/FAQPage/DefinedTermSet+DefinedTerm/HowTo/OfferCatalog generated from blocks, legacy fragments carried in `seo.schemaExtra`, `steps.schemaExtra`, `dataTable.schemaExtra`, glossary `schemaSetId`/`schemaId`; graph origin rewritten to the runtime origin), routes for `robots.txt`, `llms.txt`, `sitemap.xml`, `site.webmanifest`, a real 404, `[...segments]` resolving slug + parent chain (A4: `/work/<id>/`, `/building/<slug>/`, 15 new indexable pages), hash-route script on `/`, `proxy.ts` with host canonicalisation, legacy `.php` 404/410, nonce CSP and security headers, `poweredByHeader: false`, absolute `MEDIA_DIR` for disk uploads. **Parity gate** `tools/parity/compare.mjs`: no-JS diff against `docs/baselines/seo-baseline.json` with plain-English findings, blocking vs advisory, declared accepted differences; in CI after e2e.

**Result.** `PARITY OK — 0 blocking` on **all five** legacy routes (the plan asked for two in Release 1): status, title, description, canonical path, robots, OG/Twitter values, single identical h1, JSON-LD type multiset and id set, the 12 glossary anchors, internal-link set (with the hash→URL map). One advisory: `/` word count +39.7 % — the legacy baseline used `innerText`, which excludes the hidden hash views, while the rebuild renders their static text; sub-pages are within ±5 %. 83 e2e tests green on chromium 360/1440 + admin (7 new: single-hop redirects, PHP 404/410, headers, generated routes, JSON-LD per route, hash routes, real 404s for bad child paths); 84 threat-model + 15 registry + 17 contract + 9 gate unit tests green. Lighthouse: accessibility 100, best-practices 100, SEO 100 on both routes; performance 84–91 in the throttled sandbox (the ≥90 gate is enforced on staging hardware in C9 with the explicit budgets).

**Decisions.**

1. **Blueprint is the seam.** The extractor emits the same `site-blueprint.json` shape the WordPress and copy-deck importers will emit (Releases 3–4); the seed only knows the blueprint.
2. **Legacy section ids become block anchors** (Payload's `blockName`), so `/#faq`, `/#glossary`, `/#method` still land; hash views that became pages redirect client-side (fragments never reach the server).
3. **Carry, then generate.** Legacy JSON-LD fragments we cannot yet derive from data ride in `schemaExtra` fields with a visible admin description; every Release that adds a data source shrinks them. Site-wide entities are `schema-entities` documents, not code.
4. **Origin-independent graph.** `site-settings.siteUrl` is the canonical production origin; staging rewrites carried absolute ids to its own origin so the graph always agrees with the page URL.
5. **Counts derived, headings included.** `{{count}}` in titles/captions renders the item count as a word ("Five moves, in order.") — the legacy drift ("Six builds" vs seven) cannot recur; the unit test refuses typed counts in fixtures.
6. **Accepted differences are declared, not silent** (`blueprint.parity.accept`, with a reason); none were needed.
7. **Deferred, recorded:** answer simulator (160 words), newsletter (595), scorecard (326) — Release 2 interactive blocks; `/` word-count parity moves with them.

**Found and fixed on the way.** Payload de-duplicates upload filenames and converts to webp, so the seed keys media by the legacy source path, not the filename (an earlier key re-uploaded on every run); the standalone server's cwd is not the app dir, so disk uploads need an absolute `MEDIA_DIR`; `NEXT_PUBLIC_SERVER_URL` must match the e2e base URL or ids/canonicals "fail" (test-environment, not product); axe flagged the legacy `&nbsp;` corner header (`empty-table-header`) — fixed with visually-hidden text; an evidence grid with one shared citation needed a fallback so the "sources required" gate could pass honestly.

**Owner decisions applied.** A4 real URLs; image rights `owned` (seeded with credit); sending domain and DNS runbook (separate from this site).

## ADR-026 — Claude Design is the primary design surface; the repository produces and verifies, Claude publishes, the ledger records

**Status:** Accepted · 2026-09-05 (owner decision: moving away from Figma; detailed review of the 2026-09-05 backlog note found four defects, corrected here)

**Context.** The owner wants design previews and client approvals to run through Claude Design rather than Figma. Claude Design offers a _design-system project_ type into which a component library can be synced file by file (each component carrying its own preview card), and Design artifacts made there inherit that system. The first draft of this decision treated Claude Design as a canvas we render pictures into and put client approvals on it. A code-level review found: (1) registry fixtures carry Syed identifiers in seven places, so cards rendered from them would leak one client's identity into another's project, and no residue scanner exists yet; (2) the sync tool takes a bare project id, so nothing prevented pushing client A's bundle into client B's project; (3) the only route into Claude Design projects is a tool running under the owner's claude.ai login inside a Claude session — there is no repo-side credential, so `pnpm design:sync` in CI was impossible; (4) whether a client without a Claude seat can comment on a design-system project is unknown, so approvals could not depend on it.

**Decision.**

1. **Produce → publish → record.** The repository _produces and verifies_ every design artefact as a deterministic build output with a hash manifest (`pnpm design:bundle`, `pnpm preview:pack`). _Publishing_ (to a Claude Design project or as an Artifact page) is a Claude-mediated step invoked through a project skill; CI never publishes and the repository never holds a publishing credential. _Approvals_ are recorded in the content-verification ledger's Design decisions table with `tier` (system / page / staging), `version` (contract hash + git tag) and `thread`.
2. **Two audiences, two surfaces.** **Clients** review published Artifact pages (private shareable link, threaded comments; PNG/PDF delivered as files because the artifact sandbox blocks in-page downloads). **Designer and operator** use one Claude Design system project per client to explore and to generate on-brand page concepts. Nothing client-facing depends on the Claude Design project.
3. **Brand-neutral fixtures.** Fixture copy is generic; identity fields (brand name, person, role, social links, copyright holder, hero alt) are injected at bundle time from the client blueprint's business facts; presets use the neutral identity "Studio Example". A first-slice **residue scanner** (`tools/scripts/residue-scan.mjs`: Syed identifiers, domains, addresses, analytics ids, email identities) runs on every bundle; the full Release 3 scanner grows from it.
4. **Manifest handshake.** Every bundle writes `_factory/manifest.json` (`site`, contract hash, registry version, per-file SHA-256). A push refuses unless the remote manifest's `site` matches or the project is empty and being claimed, and unless the project type is a design system (the type is immutable; pushing to a plain project never converts it). The manifest is also the diff basis — no per-file remote reads. It is never named `_ds_manifest.json`, which the pane owns.
5. **Page packs render from a running site**, never from the blueprint file: before launch the site is seeded from the blueprint, after launch the CMS is the content authority (owner decision), so one path serves both and cannot show stale copy. Component cards render from fixtures at 1440 and 390.
6. **Fonts embed only under a redistributable licence** (OFL, Apache, owned-redistributable, read from the contract's `license` field); otherwise the fallback stack is used and the Type board says so. Shared `assets/fonts/` with relative URLs is the first mode; base64 inlining per card is the automatic fallback (a card stays under the 256 KiB per-file cap either way). The C5.5 spike sets the flag; it does not change the design.
7. **Return path is our own file.** The bundle places `tokens/design-contract.json` in the project. `from-claude-design` (Release 3) diffs the remote copy against the local contract; changed values arrive with provenance `declared` and the contrast gate decides. Edits to card HTML are detected as manifest hash mismatches and _reported_, never imported — components are code-owned.
8. **Build outputs are not committed.** The bundle lives in `apps/<client>/design/ds-bundle/` (gitignored, reproducible byte-for-byte); only the manifest is committed. Screenshot PDFs are delivered, not committed.
9. **Every card paints its own ground** (`body { background: var(--color-canvas) }`) so a dark contract never renders dark text on the pane's light ground.
10. **Figma is optional.** `docs/figma-contract.md` stays as the on-ramp for clients who arrive with Figma files; the Figma MCP validation step leaves the critical path; `from-figma-tokens` stays Release 3.
11. **Offboarding** deletes the client's Artifact pages and Claude Design project (both agency-owned, listed in the ledger).

**Consequences.** New checkpoint **C5.5 — Design packs** (Release 2, ~2.5 days, non-blocking to Release 1 acceptance) in `release-plan.md`; C9 gains the bundle render-check gate. `docs/design-packs.md` documents commands, handshake, skills and the approval convention. A22 added; R47–R50 added. `backlog.md`'s 2026-09-05 note is superseded by this ADR. `architecture.md`, `figma-contract.md`, `build-skills.md`, the offboarding section of the runbook and the ledger's Design decisions table updated. Release 3 keeps: `from-claude-design`, presets shipped as design-system projects with packs, `docs/claude-design-contract.md` (page frames named by registry block so a mockup can be read back into a blueprint — built only once mockups are programmatically readable), block `states` variants, full residue scanner.

**Open until the spike.** Whether the pane resolves relative font URLs (else inline mode); whether the `@dsCard` marker takes a viewport or explicit `register_assets` is needed for the 390 cards; whether Payload's Lexical `<RichText>` renders under `renderToStaticMarkup` outside Next. Each has a built-in fallback; none changes the decisions above.

## ADR-027 — Design change pipeline: GitHub as the remote, gates as the reviewer, Claude sessions never deploy to production

**Status:** Accepted · 2026-09-05 (owner decisions: GitHub account `Eliteclassaura`; designers are occasional — often the owner alone makes and pushes design changes; the owner's Claude sessions and, when engaged, a designer's must be able to push design changes live)

**Context.** ADR-026 settled where designs are reviewed. This ADR settles how a design change reaches the live site. Three constraints from the master prompt bound it: humans approve publishing, no credential enters the repository, and the registry is the only renderer. A second review of the designer flow found twelve defects (recorded in this ADR's consequences) and one ordering problem: the repository had no remote, so nothing collaborative could exist yet. Self-hosting a forge (Forgejo on the RackNerd VPS) was evaluated and rejected for now: it is a second product to operate for a one-person agency; GitHub is a private remote with hosted CI, no runtime dependency, and an afternoon's migration if ever needed.

**Decision.**

1. **Remote and forge.** Private repository `github.com/Eliteclassaura/agency-site-factory`. `main` is protected: pull requests only, required status checks (CI, residue scan, parity, a11y, budgets, baseline/ledger coupling, migration guard), linear history, no force-push. **Required reviewer count is zero while the owner works alone** — the gates are the reviewer — and is set to one from `CODEOWNERS` for the design paths whenever a designer is engaged; it is a setting, not a code change. R42 closes.
2. **Sanitised before first push.** The compromised legacy key and the private client allowlist were redacted from the repository copy (`<legacy-admin-key-redacted>`, `redacted-client-host-NN.invalid`, hashes in `allowlist.sha256.json`); the residue scanner works from hashes; the pristine archives stay offline with the owner. History is rewritten so the literals never existed in it, and the first push happens only after that rewrite is verified (see "History" below).
3. **The pipeline.** Any Claude session (owner's or designer's) works on a branch: edit `design-contract.json` tokens or registry block CSS/JSX → run the gates locally → open a PR with the pack (`preview:pack`) attached → CI reruns every gate and Coolify deploys a **preview URL** for the PR → approval (owner, or gates-only when alone) → merge to `main` deploys **staging** → **production deploys only from a tagged release**, with a manual approval step for launched sites. Rollback is a redeploy of the previous tag.
4. **No session deploys to production — including the owner's.** Sessions commit, open PRs, publish packs and design systems; they never hold a deploy credential.
5. **`CLAUDE.md` + `design-change` skill teach the sessions.** Both know the commands, the order and the refusals: no external font `<link>` (CSP `font-src 'self'` — fonts enter through the contract's font pipeline with a `license`), no raw HTML or inline scripts (nonce CSP; registry only), no `migrations/` or `payload.ts` changes in a design PR (path guard; a `content-model` label applied by the owner lifts it), no CMS copy in code, no commits to `main`, no touching `.env`, never deploy.
6. **Three-way change report** from `design-pull`: token diffs (imported through the contrast gate), component diffs (change requests implemented as code), copy diffs (routed to the editor as a Payload task, never to code — the CMS stays the content authority).
7. **Baselines change only with a ledger row.** `pnpm baselines:accept --reason "…"` rewrites visual-regression baselines and appends a Design decision row (tier `system` or `page`); CI refuses a baseline diff without a ledger change in the same PR. The parity gate is unaffected — it checks the SEO surface, not pixels.
8. **Designer environment = C8.** Docker Compose from C8 is the designer's local stack; PR previews on Coolify are the shared one. Designer onboarding is sequenced after C8 (`docs/designer-onboarding.md`). Designers get branch write access (never `main`), preview credentials in their own environment, and edit access to the client's Claude Design project; they never need a Payload role.
9. **Sync hygiene.** `design-sync` pulls before it pushes and refuses if the remote manifest hash differs from the last pull (optimistic lock); pane-owned files (`_ds_manifest.json` and any it documents) are allow-listed rather than reported; HTML is normalised before hashing so re-serialisation is not mistaken for a change.
10. **Order of work changes.** C5.5 _spike_ first (half a day), then C6 → C7 → C8 for the working version, then the C5.5 remainder (which needs C8's environment to be useful), then C9. Demo client (Release 3) is a fictional landscape-architecture studio — no vertical shared with a real client.

**History.** `git filter-repo --replace-text` over the nine pre-sanitisation commits, tags re-pointed, verified by grepping every commit for the eighteen replaced literals; the pre-rewrite mirror is kept offline by the owner and deleted from this workspace. If the rewrite cannot be run inside a Claude session, the owner runs it on the Mac from `docs/runbooks/first-push.md` before the first push. **Nothing is pushed while the literals exist in history.**

**Consequences.** R42 closed; R51–R55 added (baseline churn, copy drifting into code, designer PR carrying a migration, concurrent writes to a design project, CSP-incompatible assets from design tooling). `.github/CODEOWNERS`, `CLAUDE.md`, `docs/designer-onboarding.md`, `docs/runbooks/first-push.md` added. C5.5 gains `design-pull`, the change report, the lock, the allow-list, `CLAUDE.md` and the `design-change` skill (~3.5 days). C8 gains PR previews, tag-only production deploys with manual approval, and the designer environment. C9 gains `baselines:accept` with ledger coupling and the migration path guard as required checks. The Release 7 backlog gains "self-hosted forge mirror (Forgejo) when the platform has more than one operator".

## ADR-028 — OGCS integrates through versioned contracts and a drafts-only service account; no email address ever appears on a public surface

**Status:** Accepted · 2026-09-05 (adopts the OGCS Integration Pack v1's proposed decision — numbered ADR-026 in the pack — with the amendments below; owner decisions: OGCS is the owner's private control system and is never distributed; bulk approval is required; no admin or client email is ever public)

**Context.** OGCS (Organic Growth Control System) is the owner's agency-wide controller for organic growth: it gathers SEO evidence, decides what should change on which client site, executes approved changes, and verifies the result. It is a specification with no code; its first job is the H2O Cooling WordPress → Payload migration. The pack (`docs/inputs/ogcs-integration-pack-v1/`) proposes that OGCS stays outside the monorepo and touches client sites only through five versioned JSON artefacts and a scoped machine identity. A code-level review of the pack against this repository confirmed its gap findings (redirects written but never served or seeded; no hook enforces `verification.status`; no API-key auth; no blueprint schema) and found seven defects plus one policy gap — the owner's rule that no email address may appear publicly, which the pack does not address.

**Decision.**

1. **Separate but integrated.** OGCS has its own repository, database, scheduler, artefact store and secrets; it is deployed once for the agency, never per client, and never ships in a client image or starter. Its only dependency on the Factory is the contracts package. The Search Evidence Suite stays independent; its export is adapted to `evidence-bundle` on the OGCS side. ADR-023 stands: the optional `payload-search-plugin` is **not a dependency of any client app** until licensing is decided — a flag that is off still ships code.
2. **`packages/seo-contracts`** — zod schemas, types, golden and negative fixtures, `validate` CLI for `blueprint` v2, `evidence-bundle`, `page-decisions`, `qa-report`, `deploy-event`; depends on `zod` only; lint forbids importing `agency-core` (and the reverse). Published to GitHub Packages under the owner's scope or consumed as a tag-pinned git dependency — not public npm. **Schema-level rule: no string in any artefact may match an email pattern**; `produced_by`/`approved_by` are handles.
3. **Lane A — structural, through the blueprint and a PR** (URL creation/removal, redirects, slug/parent changes, canonical/noindex on locked pages, IA and collection changes, every migration). `page-decisions` → importer/`decisions-apply` → blueprint diff → PR → gates incl. parity → merge → seed. Consistent with ADR-027.
4. **Lane B — content, drafts only, through a service account.** Collection `service-accounts` (`useAPIKey`, `disableLocalStrategy`, single fixed role `automation`, `enabled`, per-client key stored only in OGCS). Scope **v1: `pages`, `posts`, `media` only** — the collections with drafts (media is rights-gated and inert until referenced). Hooks make the following impossible for a service account regardless of role: setting `_status: 'published'`; changing `verification.*`; changing `slug` or `parent`; changing `seo.noindex`/`seo.canonical` on a locked page; creating `media` without `rights` and `source`; deleting anything. Automation drafts bypass autosave and carry `automation.pendingReview` + `runId`.
5. **Humans publish — in bulk.** An **Automation review** admin view lists pending drafts by run → page → field with plain-English diffs, tactic and risk class; **Approve / Reject / Hold** at run, page or field level; **Revert run** restores pre-run versions. Approval writes audit rows (approver id, run id, fields) and a ledger row per run. Pages edited by a human after the automation draft are flagged as conflicts and excluded from bulk approval. Publishing authority stays in Payload; OGCS learns outcomes from `deploy-event`/`qa-report`. A per-client `automationAutoPublish` flag (default off; not before 90 days of clean runs) may later allow ALT text and internal links to skip the queue.
6. **Redirects are `proposed | active`.** Automation may create `proposed` only; the proxy serves `active` only; a human activates or the next Lane-A apply adopts. Nothing unattended ever changes a ranking URL.
7. **Redirect map served without Payload in the middleware.** Active redirects are materialised to a tag-revalidated internal endpoint that `proxy.ts` fetches once and caches, with a build-time `redirects.json` fallback; seed upserts `blueprint.redirects[]`.
8. **Blueprint v2 with a schema**; `pages[].migration` provenance; `verification.status` enforced at publish for everyone; WordPress importer (Release 4, H2O as fixture) that **strips `mailto:` links and email text**, replaces them with the contact-form link, lists each in the review queue, and never reads `wp_users.user_email`, `wp_comments` author emails or WooCommerce customer tables.
9. **Rate limiting is real, not configured.** `securityDefaults().rateLimit` is a Payload 2 option that Payload 3.88 neither types nor reads (verified); Lane B and the form routes get a limiter in `proxy.ts` (Postgres-backed for forms per C6; keyed per service account for `/api/*`) plus a Cloudflare rate rule at the edge.
10. **No email address on any public surface — platform invariant.** HTML, JSON-LD, `llms.txt`, sitemap, error pages, and every anonymously readable REST global or collection carry no email address; contact is through forms. The only exception is a page of type `privacy`, which may show one **alias mailbox created for the purpose** — never a person's or an admin's — held in `contact-legal.privacyContactAlias` (renamed from `contactEmailPublic`), validated to differ from every `users` email and every `integrations.email.*` address and to be rotatable. Controls: `no-public-email` quality gate (crawls public routes, `llms.txt`, sitemap, public `/api/globals/*` and `/api/<collection>`; fails on any `mailto:` or email pattern except the alias on the privacy page); `schema-entities` hook refusing `email` in `ContactPoint`/`Organization`/`Person`; audit rows store actor **id and role** (drop `actorEmail`) and nothing derived from them crosses a boundary; form and newsletter confirmation pages are `noindex`, uncacheable and mask the visitor's own address (`s***@example.com`); the intake kit tells clients the site carries no email; the residue scanner's email rule covers bundles, packs and handoff files.

**Consequences.** New checkpoint **C6.5 — migration readiness and the automation lane** (after C6, before C7, ~3 days): P2 contracts, P6 service account + hooks + review view + threat rows, P1 redirects, P3 migration group, P4 verification gate, the email-invariant controls, the proxy limiter. P5 importer opens Release 4 with H2O; P7 (`qa-report`, `deploy-event` as files) lands in C9; P8 webhooks wait for an OGCS endpoint. `docs/ogcs-integration.md` is the Factory-side reference; the pack is vendored under `docs/inputs/ogcs-integration-pack-v1/` with `RESPONSE_FROM_FACTORY.md`. R56–R58 added. `SENSITIVE_COLLECTIONS` += `service-accounts`; threat matrix gains the `automation` row. The legacy-exposure runbook notes that rotating `PAYLOAD_SECRET` invalidates every API key (re-issue and update OGCS). Master principles (architecture §4, `CLAUDE.md`) gain the email invariant. Corrections to the pack's claims: parity covers the five legacy routes (0 blocking), not "20/20"; the pack's ADR number becomes 028 here.

**Rejected.** Unattended live publishing of "green" tactics (contradicts "humans approve publishing"); advisory redirects served live; loading Payload's local API inside `proxy.ts`; Lane B on collections without drafts; public npm for the contracts; approval authority in OGCS (v1).

**Tests required before C6.5 closes.** Contract fixtures validate and negatives fail with the expected path; a service account cannot publish, verify, delete, change slug/parent, touch locked `seo`, or read CRM/users/integrations/audit; a disabled account is refused; drafts from a run appear in the review view and bulk-approve publishes them with audit and ledger rows; revert restores; a human edit after an automation draft flags a conflict; `proposed` redirects are not served and `active` ones resolve in one hop; the `no-public-email` gate fails on a planted `mailto:` and passes syed.ai; `privacyContactAlias` refuses a `users` email; proxy limiter returns 429 at the configured rate; syed.ai parity unchanged.

### ADR-026 — spike results (2026-09-05, C5.5 spike)

1. **Static render outside Next works, including Payload's Lexical `<RichText>`.** `renderToStaticMarkup` over the registry fixtures with the block stylesheets bundled as empty modules (esbuild `--loader:.css=empty`) and CSS concatenated (`tokens.css` → `fonts.css` → `global.css` → `primitives.css` → block CSS, 34 KiB) produced eight cards; rich text rendered its headings, lists and links. `tools/design-bundle/spike.tsx` is the seed of `design:bundle`.
2. **Fonts must be inlined for the Artifact path.** A design canvas runs each artboard in a sandboxed iframe with no file access, so relative `assets/fonts/` URLs cannot resolve; `--fonts inline` (base64 `@font-face`) rendered Bodoni Moda and Jost correctly. Cards are ~186 KiB with fonts inlined — under the 256 KiB per-file cap. `inline` becomes the default for packs; `shared` is reserved for design-system projects pending item 4.
3. **The client-facing path is proven.** The eight cards published as a Claude Design canvas Artifact (`syed.ai Registry Cards Spike`, private) with saving and PNG/PDF export enabled; both viewports render on the dark ground with the real tokens. The pack page of `preview:pack` will use this canvas format (one artboard per card and per page screenshot) rather than a hand-built HTML page.
4. **Design-system project publishing cannot run from a Cowork cloud session.** The sync tool requires a one-time `/design-login` in an interactive Claude Code session on the owner's machine (or Claude Design's "Send to Claude Code Web"). Consequence: the `design-sync` skill runs from Claude Code on the Mac; cloud sessions build bundles and publish Artifact packs only. `docs/design-packs.md` and `designer-onboarding.md` updated. The `@dsCard` viewport syntax and relative-font behaviour in the design-system pane remain unverified until that login exists; both have fallbacks (explicit `register_assets`; `--fonts inline`).
5. **Observation to verify in the real site:** the hero fixture at 390 shows the media overlapping the heading in the static render. The 360 e2e project passes axe but has no visual assertion; add a 390 hero screenshot to the C9 baselines and check the block's phone layout during the C5.5 remainder (could be an artefact of the static wrapper).

## ADR-029 — Multilingual and regional SEO: recorded now, proven by H2O in isolation, reconciled into the Factory at Release 4

**Status:** Accepted (scope and sequencing only — **no implementation before C7/C8**) · 2026-09-06 · Owner decision: H2O's isolated staging delivery project proves the multilingual Payload implementation first; the proven implementation and its requirements are then supplied for reconciliation into the Factory alongside the WordPress importer (Release 4).

**Context.** The Factory is monolingual by construction today, and nothing had forced the issue because syed.ai is a single-language site. An audit on 2026-09-06 found: `en_US` hard-coded as the OG locale and `inLanguage: 'en'` hard-coded in `buildJsonLd`; `<html lang="en">` fixed in the root layout; Payload `localization` not enabled; no `locale` field on any collection; the sitemap emits no `xhtml:link` alternates; the parity gate has no hreflang check; and `packages/seo-contracts`'s `qa-report` check enum has no `hreflang` member. Meanwhile three places in the plan already assume multilingual exists: the master prompt's quality gates ("hreflang if used"), the OGCS pack's Lane-A decision table ("change hreflang mapping" → Lane A) and its `MULTI-001` green tactic, and the H2O pilot plan's freeze step, which expects a `SCHEMA_HREFLANG_BASELINE.json` and a `MULTILINGUAL_RESEARCH_PLAN.md`. `docs/wordpress-importer.md` §4 also names `seo.alternates` as a carry-over target that the content model cannot yet hold. This ADR closes the gap between what the plan assumes and what the code supports, and fixes the sequencing.

**Decision.**

1. **Nothing is implemented before C7 and C8 complete.** The current roadmap is unchanged: C7 → C8 → C5.5 remainder → C6.5 proper → C9.
2. **H2O proves it first, in isolation.** The multilingual Payload implementation is proven in H2O's own isolated staging delivery project, not in the Factory. Its build passes its own QA there. That project is not this repository and does not become a Factory app by proving it.
3. **Reconciliation happens at Release 4**, alongside the WordPress importer, from the proven implementation plus its stated requirements supplied by the H2O side. The Factory takes the proven design as input evidence, then reconciles it against the Factory's own invariants (one deployment per client, blueprint as the only content ingress, the parity gate, the no-public-email invariant, the automation lane's field restrictions). Reconciliation is a Factory ADR of its own at that point, not an automatic import.
4. **The importer never assumes a monolingual source.** `tools/wordpress-import` must treat language and region variants as a first-class possibility in every stage: WPML / Polylang / TranslatePress / WooCommerce Multilingual translation tables and post-meta relationships, `wp_options` language settings, per-language permalink structures, and `yoast_indexable` / Rank Math hreflang rows are all _detected and reported_ even before the Factory can render them. An import that finds variants and cannot represent them **fails loudly with a named reason**; it never silently flattens a multilingual site into one language. Detection lands with the importer's parse stage (Release 4), ahead of and independent of the Factory's rendering support.
5. **Discovery data is captured before the migration, not during it.** H2O intake gains explicit questions about historical and current language/region variants (see `docs/intake/h2o-language-region-variants.md`), and the freeze/discovery step captures the hreflang and language baseline of both the OLD and NEW sites so parity can be judged against what actually existed.
6. **Scope of the eventual Factory implementation** (recorded so the reconciliation has a target to compare against, not as a build instruction): per-client locale list in the blueprint and Payload `localization`; `locale` plus an `hreflang` group on localisable collections with an explicit `alternates[]` mapping including `x-default`; a per-client URL strategy with **subdirectory (`/de/`) as the Factory's default recommendation** because subdomains and ccTLDs both complicate one-deployment-per-client; `alternates.languages` in metadata, `xhtml:link` in the sitemap, correct `<html lang>` and `inLanguage`; an `hreflang` check in the parity gate and in the `qa-report` contract's check enum (a MINOR contract bump); a reciprocity gate (A→B without B→A is the classic failure and is mechanically checkable); and locale-aware handling in the automation lane so a machine draft cannot cross locales.

**Consequences.** A23 added (source sites may be multilingual; the importer proves it rather than assuming). R60 added (silent monolingual flattening during migration). R61 added (hreflang reciprocity and `x-default` errors are invisible to the current parity gate). `docs/backlog.md` gains a Release 4 row for multilingual reconciliation. `docs/wordpress-importer.md` gains a detection stage and the fail-loudly rule, and its `seo.alternates` mention is marked as pending the reconciliation. `docs/intake/h2o-language-region-variants.md` added. `docs/handoff/RESPONSE_TO_OGCS.md` is updated so the OGCS side knows hreflang mapping stays Lane A and that no hreflang QA check exists yet. No code changes in this ADR.

**Explicitly not decided here.** The final URL strategy per client (subdirectory is a recommendation, not a ruling); whether translation is human, machine-assisted or provider-based; whether locales share one Payload database (they do under the current one-deployment-per-client rule, but the H2O proof may surface a reason to revisit); and how OGCS's `MULTI-001` tactic behaves across locales.

## ADR-030 — C5.5 remainder: deterministic bundles, declarative skills, a measured distinctiveness gate, and a sync status that cannot lie

**Status:** Accepted · 2026-09-10 (C5.5 remainder, after C8; ADR-026 and ADR-027 unchanged and still binding)

**Context.** ADR-026 decided _where_ design is reviewed and ADR-027 _how_ a design change reaches the site. Building the remainder surfaced five questions those two did not settle, each of which had a wrong answer that would have looked fine for months.

1. The spike's `design:bundle` prototype wrote a `_factory/manifest.json` containing a git description. Committed, that makes the manifest a property of the checkout rather than of the design system, and CI's shallow clone would disagree with a tagged working copy — a "determinism" gate that fails for the wrong reason teaches people to ignore it.
2. Fixtures carried seven client identifiers (ADR-026 §3 counted them). Neutralising them naively would have changed the seeded chrome and moved the C5 parity baseline, because `seed.ts` builds the header, footer and form globals _from the fixtures_.
3. A skill is text that steers a session, with no import graph, no type checker and no review diff anybody reads closely. Three of the four skills C5.5 adds tell a session to publish something.
4. "Does every client's site look the same?" had no mechanical answer, so the honest answer over time would have been "yes, gradually".
5. The spike found that design-system sync needs an interactive `/design-login` and cannot run from a cloud session. The dangerous failure is not the missing capability — it is a session _reporting_ a sync it did not perform.

**Decision.**

1. **The committed manifest contains only what the source tree determines.** No timestamp, no git description, no hostname, no unordered map; keys sorted, JSON canonical, every file hashed. `pnpm design:bundle --check` builds twice and compares every byte, not just the manifest. The revision lives in the reviewer handoff, which is not committed.
2. **Identity is injected, and the injection is proven against the pilot.** Fixtures hold `{{brand.*}}` placeholders and `{ $brandList: … }` markers; `applyBrand()` resolves them from the client's blueprint plus a committed `apps/<client>/design/fixture-brand.json`. The seed and `/dev/blocks` use the same function the bundle does. Two tests hold the line: fields the blueprint owns must match the blueprint (`brandDrift`), and the resolved identity must reproduce the pilot's chrome strings byte for byte — so neutral fixtures cannot move the parity baseline. The default identity is "Studio Example", so anything that forgets to inject produces a neutral artefact rather than leaking one.
3. **First-party skills execute nothing.** They are Markdown plus a `policy.json`, with no scripts, no execute bits, no shebangs, and an `allowedCommands` list drawn from the repository's own `package.json` scripts. `pnpm skills:verify` enforces all of that, pins every first-party file by SHA-256 in `.claude/skills/MANIFEST.json`, re-checks the vendored directory pins, and refuses a skill that names a command the repository does not have, points at an external URL, or mentions `curl`/`wget`/`npx`/`eval`/`chmod +x`. It runs in `pnpm check` and in CI. Vendored third-party skills do ship scripts — that is why they are vendored and pinned rather than trusted, and no first-party skill invokes them.
4. **Distinctiveness is measured.** Each contract reduces to a ten-axis perceptual signature (accent hue and chroma, ground lightness, contrast spread, radius, spacing rhythm, type-scale ratio, the two families, whether they are a pair). Two clients closer than 0.18 are reported. The finding is **blocking for a new client** — a new site must be distinct by construction — and **advisory between two existing clients**, because changing a live client's palette is a decision, not a build fix.
5. **A sync status is evidence, never an assertion.** `syncCapability()` derives the environment (`ci`, `cloud-session`, `owner-workstation`, `unknown`), with CI and cloud detected _first_ so exporting `FACTORY_DESIGN_LOGIN=1` in a cloud session still reports `cloud-session`. `recordSync()` throws unless the session could sync **and** the push returned a remote manifest hash. `ok` is reachable only for the exact bundle a recorded push covered. The `design-sync` skill prints the status verbatim and is instructed, in the skill text, to say "nothing has been pushed" in those words.
6. **A card declares the viewport it is faithful at.** A static card cannot make a CSS media query resolve against anything but the viewport it is displayed in, so a 390 card opened in a 1440 frame runs the desktop rules on a narrow box. Cards therefore carry `<meta name="viewport" content="width=…">` and an `@dsCard viewport="…"`, and the render check opens each at exactly that width. **This is the resolution of ADR-026 spike observation 5**: the hero "overlap" at 390 was the static wrapper, not the block — verified at a real 390 viewport, where the phone hero's text column carries its own gradient and the heading sits inside its section. The e2e now asserts that, by name, and the whole registry is checked for horizontal overflow, text-on-text overlap and clipping at 360, 390, 768, 1024 and 1440.
7. **Hostile input is refused, not repaired.** Archive members (path traversal, absolute paths, symlinks, executables, ZIP64, declared _and_ actual decompression ratio, entry and total caps, header/actual size mismatch), assets (kind by signature not by extension, extension/signature disagreement, execute bits, shebangs, size), markup and CSS (script, event handlers, `javascript:`, embeds, `<base>`, meta refresh, `foreignObject`, external resource URLs, `@import`, `expression()`, bindings, `srcdoc`, DTD subsets and entity declarations, control characters) and SVG (external `<image>`/`<use>`, SMIL href animation) all refuse with a named rule. Sanitising by rewriting invites a parser differential between the checker and the browser; a design artefact has no reason to accept input that needs repairing. An outbound `<a href>` is content and stays allowed — a link does not fetch.
8. **A client pack renders at the two review widths by default.** The five-viewport sweep is automated QA, not something a client reads: ten full-page screenshots per page produce a pack nobody opens. `--viewports` overrides when a specific width is under discussion, and a pack over 60 MB is flagged before publishing.

**Consequences.** New package `@factory/design-bundle` (`tools/design-bundle`) with `bundle`, `gates`, `signature`, `sync-status` and `pull` subcommands, plus `tools/design-pack/pack.mjs` for `preview:pack`; 60 unit tests, 27 of them one-per-threat. New scripts: `design:bundle`, `design:gates`, `design:signature`, `design:sync-status`, `design:pull`, `preview:pack`, `residue:scan`, `skills:verify` (the last added to `pnpm check`). Four first-party skills. `apps/syed-ai/design/fixture-brand.json` added and `seed.ts`, `/dev/blocks` and six fixtures changed. Two new Playwright specs (`design-qa`, `design-cards`) and five new CI steps. R63–R66 added; R47, R49, R50, R52, R54 and R55 gain enforcement they previously only had in prose. `docs/design-packs.md` rewritten to match what exists. **Nothing in C6.5 or C9 is started**: `baselines:accept` (C9) is referenced by the `design-change` skill as _not yet available_, and no service account, automation hook or review view is touched.

**Explicitly not decided here.** Whether the design pane resolves relative font URLs (still unverified — `inline` remains the default and `shared` is emitted but unexercised, because verifying it needs the owner's `/design-login`); the sameness threshold's exact value beyond "0.18 separates the pilot from a copy of itself and from a genuinely different system" — it is a single constant, reviewable when a second client exists; and whether a future preset library ships as design-system projects (Release 3).

## ADR-031 — The first push starts a fresh history; the pre-sanitisation commits are abandoned, not rewritten

**Status:** Accepted · 2026-09-10 (owner decision, forced by circumstance: the Mac holding the only offline copy of the pre-rewrite bundle and mirror is gone)

**Context.** ADR-027 §2 and its "History" paragraph committed the project to a `git filter-repo --replace-text` rewrite of the nine pre-sanitisation commits before the first push, with the pristine archives held offline by the owner. That plan had one hard dependency: a copy of the pre-rewrite history to rewrite. On 2026-09-10 the owner moved to a new machine and the old one — which held `~/Projects/agency-site-factory-transfer/` with the `asf.bundle` and the `agency-site-factory-prefilter.git` mirror — is no longer accessible.

The only surviving copy of that history is the `.git` directory of the ephemeral cloud container this work runs in, and `verify-history-clean.mjs` confirms it still carries the compromised legacy admin key and the private client allowlist across commits `e742246`, `16b27b5` and `314d71e`. Shipping that history anywhere to enable the rewrite would mean moving the literals through a hosted surface — exactly what ADR-027 §2 exists to prevent — in order to perform a rewrite whose only purpose is to remove them.

**Decision.**

1. **The first push creates a fresh history.** The clean working tree at tag `c5.5` is imported as a single commit into a new repository, and that is what reaches `github.com/Eliteclassaura/agency-site-factory`. No pre-sanitisation commit is ever pushed, rewritten, or copied out of the container.
2. **`git filter-repo` leaves the plan.** `tools/scripts/make-replacements.mjs` is deleted: it derived its rules from the pre-rewrite history, which will not exist anywhere after this container is reclaimed, and an unused script that reads secrets out of git history is a trap rather than an asset.
3. **`verify-history-clean.mjs` stays, and becomes the pre-push gate.** It works from hashes and never needs the literals, so it proves the claim on the new history in one command. `docs/runbooks/first-push.md` runs it before the remote is added, not after a rewrite.
4. **Provenance survives as prose, not as commits.** The 31-commit log, with each commit's subject, is recorded in the handoff package's `GIT_STATE.md` and in the checkpoint reports under `docs/handoff/`. Anyone asking "when did the parity gate land" has an answer; `git blame` will not.
5. **The container's `.git` is not exported.** It is not in any handoff package, it is not committed anywhere, and it dies with the container. Nothing downstream depends on it.

**What this does not change.** The legacy admin key is still live on the legacy host until the owner runs `docs/runbooks/legacy-exposure.md` — that is R1, an exposure on a running system, and it was never solved by rewriting git history. The residue scanner, the redacted `legacy-reference/` copy and the no-secrets-in-the-repository invariant are all untouched. Branch protection, tag-only production deploys and every other part of ADR-027 stand.

**Consequences.** R42 is re-pointed: the risk it tracked (no version control) closes at the first push as before, but by import rather than rewrite. `docs/runbooks/first-push.md` is rewritten — it is now four steps and no longer references a bundle that does not exist. `docs/release-plan.md`, `docs/handoff/RESPONSE_TO_OGCS.md` and the C5.5 reports describe "history rewrite pending" as an owner action; those references are corrected to "first push pending". A fresh handoff package is produced at `c5.5`, because the 2026-09-07 export was stored only on the lost machine.

**Cost, stated plainly.** Thirty-one commits of development history — including the security commit `d38f664` that did the redaction, which is the one a future auditor would most want to read — become a written record instead of a verifiable one. That is a real loss, accepted because the alternative is worse: moving live secrets through a hosted surface to preserve a log.
