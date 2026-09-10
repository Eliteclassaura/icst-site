# Release 1 and Release 2 — implementation plan with acceptance tests

Supersedes the single "Milestone 1" of the master prompt, per ADR-015. The master prompt's Milestone 1 scope is delivered across **Release 1** (production foundation and one complete vertical slice) and **Release 2** (full Syed AI parity and a reversible staging launch), following `docs/execution-plan.md` §6–7. Nothing from the master prompt is dropped; `docs/backlog.md` carries the mapping.

Work is organised in checkpoints (C0–C9). Each checkpoint ends with the repository runnable, its tests green, and a short report (changed files, commands, results, risks). The acceptance tests below are written as they will appear in the suite; they are the definition of done for the checkpoint.

## Release boundaries

| Release                                                                   | Checkpoints                                                                                                                                                                                                                                                                                                                                                                                                                        | Deployable result                                                                                                                                                                               | Gate (from execution plan §6)                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Release 1** — foundation + one vertical slice (est. 5–8 engineer-days)  | C0 compatibility spike · C1 workspace · C2 design contract · C3 Payload + content model + roles · C4 _minimal_ block set (header, footer, hero, prose, evidence grid, CTA, FAQ, glossary, brief form) · C5 _partial_: `/` and `/geo-pricing/` only · C6 _partial_: brief form → contact → lead → activity → queued mock notification · C6.5 migration readiness + automation lane (ADR-028) · C7 no-AI mode · C8 containers        | A containerised app where `/` and one secondary page render with parity, an editor can change copy and SEO without code, and one lead flows end to end with AI disabled and no real credentials | New DB migrates and seeds from zero · content/metadata in initial HTML · lead workflow transactional and duplicate-safe · editor changes without source edits · containers run with no real provider credentials                                                                     |
| **Release 2** — pilot parity + reversible staging launch (est. 6–10 days) | C4 remaining interactive blocks (simulator, scorecard, revenue model, ventures, cases, palette, chat) · C5 all five routes, hash compatibility, sitemap/robots/llms, redirects, CSP · C5.5 design packs (bundle, packs, skills; ADR-026) · C6 newsletter double opt-in, roadmap job with safe-fetch, spam/typo/rate rules, subscriber import · C9 quality gates, QA matrix, launch checklist, content verification ledger complete | Staged site at full parity with the legacy baseline, all tools ported, all four intake flows tested, legacy host untouched and available for rollback                                           | Staged crawl matches every legacy indexable URL or has an approved redirect · zero blocking gate findings · contact/chat/roadmap/newsletter pass success, duplicate, abuse, provider-failure and retry tests · legacy deployment remains for rollback until post-launch verification |

Operational-proof items (real SMTP/Gmail/Stalwart, DNS cutover, backup restore drill, Cloudflare rules on a live zone) are **not** in either release's code gates; they are separately authorised readiness gates in Release 7 (`docs/backlog.md`).

## C0 — Compatibility spike (Release 1) · ✅ complete 2026-09-03

**Result.** Matrix accepted (`docs/versions.md`, ADR-017). All acceptance items passed except `docker build`, which the sandbox cannot run; the runner stage was reproduced on the host as non-root and the first C1 CI run must build the image. Nine constraints found and resolved, notably trailing-slash handling via `proxy.ts` and Next's standalone output copying `.env`.

**Build.** A throwaway minimal app proving the intended matrix works together: Node LTS, Next.js App Router, Payload 3, `@payloadcms/db-postgres`, `@payloadcms/storage-s3` (MinIO locally), Payload jobs queue running in a separate worker entrypoint, Playwright, container base image. One public SSR route, admin login, one migration, one seeded page, one queued mock job executed by the worker.

**Accept.** Clean install, clean migration, clean production build, web and worker boot in containers, no real credentials. Exact versions and any constraints discovered are recorded in `docs/versions.md` and pinned in the lockfile before C1 begins. If a preferred dependency is incompatible, the conflict and chosen alternative go in the decision log.

## C1 — Workspace and toolchain (Release 1) · ✅ complete 2026-09-04

**Result.** All acceptance items pass locally (`pnpm check`): typecheck, lint, format, tests (9 gate tests), build, residue scan clean, versions verified against lockfile (21 packages), migrations idempotent with UUID ids, Chromium e2e smoke + axe green against the standalone server. Docker build and Firefox/WebKit run in CI (ADR-019).

**Build.** pnpm workspace + Turborepo; TypeScript strict with project references; ESLint (typescript-eslint, jsx-a11y, a `no-hex-in-components` rule), Prettier; Vitest; Playwright with three browsers; `docs/versions.md` with exact pins; root `.env.example`; `LEGACY-REFERENCE-NOTICE.md`; `packages/quality-gates` skeleton with the legacy-string/secret scan; CI workflow file (lint, typecheck, test, build) runnable locally with one command.

**Accept.**

- `pnpm install && pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm -r build` exits 0 on a clean clone.
- `pnpm gates:scan` fails when a file outside `/legacy-reference/` contains the 18-hex admin key (see `legacy-reference/syed-ai-site/subscribers.php:20`) or any host from the proxy allowlist (test injects a temp file and asserts failure).
- `docs/versions.md` lists Node, pnpm, Next.js, Payload, React, PostgreSQL, Playwright, Vitest with the versions found in the lockfile (script-verified) and matches the C0 spike result.

## C2 — Design contract and design system (Release 1) · ✅ complete 2026-09-04

**Result.** All acceptance items pass: deterministic compiler (byte-identical snapshot test), every legacy `:root` variable reproduced with identical value (54/54), `--radius: 0`, all 11 declared contrast pairs pass AA (one legacy failure found and fixed via `controlBorder`, ADR-020), fonts self-hosted from OFL packages with zero Google Fonts requests (e2e-asserted). CI regenerates the contract from the legacy CSS and fails on drift.

**Build.** `design-contract.schema.json`; `packages/design-contract` with the `from-css` adapter run against `legacy-reference/syed-ai-site/assets/css/site.css` + `DESIGN-TOKENS.md` → `apps/syed-ai/design/design-contract.json` (values labelled `inferred:site.css`); emitters for CSS variables, TS tokens, `@font-face` for self-hosted Bodoni Moda / Jost subsets (licences recorded); contrast report; a `design-system/` folder inside `agency-core` (global layer and primitives; split to its own package when the client starter consumes it) (Container, Stack, Prose, Rule, Button, Link, Table, Dl, Label, Num); `docs/design-contract.md`, `docs/figma-contract.md`.

**Accept.**

- Compiler is deterministic: two runs produce identical output (snapshot test).
- Every colour role in the contract passes WCAG AA for its declared use (contrast report test; `text-3` is declared caption-only and tested at 4.5:1 minimum).
- Emitted CSS variables include every `--c-*`, `--fs-*`, `--s-*`, `--lh-*`, `--ls-*`, `--w-*`, `--radius`, `--maxw`, `--nav-h`, `--dur`, `--ease` from the legacy `:root` with identical values (test compares against a parsed legacy `:root`).
- `--radius` is `0`.
- Fonts load from `/fonts/*.woff2` with no request to `fonts.googleapis.com` (Playwright network assertion).

## C3 — Payload application, content model, roles (Release 1) · ✅ complete 2026-09-04

**Result.** 40 collections + 12 globals, six roles, 84 threat-model tests green against PostgreSQL, migration idempotent (183 tables, UUID ids), audit trail verified, GraphQL removed, CORS/CSRF explicit, three skill groups installed and scanned, `pnpm audit` gate added (and it caught a real `sharp` CVE — upgraded). ADR-022.

**Added (gap review, R25–R27, R30, R32, R34):** Cloudflare Access config notes + Payload login lockout + invite-only; GraphQL playground off and GraphQL disabled unless used; explicit `cors`/`csrf` origins; `NEXT_TELEMETRY_DISABLED` everywhere; `pnpm audit --prod` + Renovate in CI; legal page types (privacy, terms, cookies, accessibility statement) in the content model; Media `rights`/`source` required for publish. Accept: playground returns 404 in production build; `cors`/`csrf` reject an unlisted origin (test); audit step present in CI; legal recipe renders.

**Added (ADR-021):** install the four adopted build-time skills under `.claude/skills/` (frontend-design, ux-ui-agent-skills, ui-ux-pro-max, the three fixers), pinned to commits, with `docs/build-skills.md` as the record. Accept: `pnpm check` unaffected; skills directory contains no secrets or client residue (scan covers it).

**Build.** `apps/syed-ai` Next.js + Payload 3 with Postgres adapter; local Compose (Postgres, MinIO); collections and globals from `agency-core` (Pages with blocks, Posts, People, Services, Industries, Locations, CaseStudies, Ventures, Testimonials, FAQs, GlossaryTerms, Citations, CTAs, Offers, Offices, SimulatorPrompts, ScorecardQuestions + Bands, RevenueModelPrograms, EvidenceStats, NewsletterIssues, Subscribers [from `_private/payload/Subscribers.ts` + `scorecard` source], Media, Navigation, Redirects, Forms, Submissions, Notices, SEOTemplates, SchemaEntities; globals SiteSettings, BrandSettings, Header, Footer, ContactLegal, SEODefaults, Integrations, ChatConfig, FormConfig, RoadmapConfig, EmailTemplates, SpamConfig); roles platform-admin / client-admin / editor / search-analyst / sales / viewer; drafts, versions, preview, scheduled publish, audit log collection; migrations; `docs/content-model.md`.

**Accept.**

- `pnpm --filter syed-ai payload migrate` on an empty database succeeds; `migrate:status` shows none pending; running twice is a no-op.
- Access-control integration tests: an `editor` cannot read `Submissions`, `Leads`, or `Subscribers`; a `sales` user cannot publish Pages; a `viewer` cannot mutate anything; `platform-admin` can do all. (One test per role × sensitive collection.)
- Audit log receives an entry on publish, redirect create, role change, and submission export (tests assert entry shape and redaction of PII fields).
- Publishing a Page triggers `revalidateTag` for the page path and its parents (hook unit test with a spied revalidator).

## C4 — Component registry and page blocks (Release 1: minimal set · Release 2: interactive blocks) · ✅ Release 1 part complete 2026-09-04 (ADR-024)

**Done (Release 1 part):** ten blocks (header, footer, hero, richText, takeawayList, evidenceGrid, faq, glossaryList, cta, briefForm) with configs, fixtures, a11y notes, `/dev/blocks`, `RenderBlocks`, chrome from globals, seed composes `/` from blocks with exact legacy title/description; stylelint logical-properties gate; git initialised. Acceptance below passes on chromium 360/1440 (53 e2e) + 14 unit tests. Remaining blocks and the motion audit are the Release 2 part.

**Added (ADR-023):** C4 opens with `git init` and the first tagged commit once the owner names the remote (R42); block fixtures never embed counts or labels that exist as data (FAQ count, builds count, select labels come from collections/`form-config`).

**Added (R36):** logical CSS properties only in `global.css`, `primitives.css` and all blocks (stylelint rule `csstools/use-logical`), so RTL is a `dir="rtl"` switch.

**Added for Release 2 (ADR-021):** install `taste-skill`, `design-motion-principles`, jezweb `motion`; run the motion audit over the interactive blocks before porting; build `blocks/effects/` (animated counter, logo marquee, text reveal) as re-tokenized cherry-picks from Magic UI / SmoothUI (MIT), on `motion` via `LazyMotion`, reduced-motion respected, within the Lighthouse JS budget. Accept: each effect block renders its full content with JS disabled; `prefers-reduced-motion: reduce` yields no transform/opacity animation (Playwright); page JS budget unchanged beyond +5 KB gz for the motion runtime.

**Build.** `agency-core/blocks` (the component registry; its own package only when a second consumer exists) with the blocks required to reproduce the five legacy pages: Header, Announcement, Breadcrumb, Footer, Hero (media/scrim variants), TakeawayList, Prose/RichText, EvidenceGrid (stat tiles with citation), ComparisonTable, PricingTable, Tiers, StepsTimeline (method, 90-day), TeamCards, Offices, NewsletterSignup, GlossaryExcerpt / GlossaryList (real `<dl>`, stable anchors), FAQ (with visible Q/A), Author (E-E-A-T), CTA / PageCTA, RelatedLinks, Citations, UpdateHistory, InlineFigure (SVG charts with `<title>/<desc>`), AnswerSimulator, Scorecard, RevenueModel, VenturesAccordion, CaseCards / CaseDetail (scrubbable chart), CommandPalette, ChatIntake, BriefForm; each with Payload block config, fixture, a11y notes, responsive rules; `/dev/blocks` preview route; `docs/component-registry.md`.

**Accept.**

- Every registry entry has a fixture that renders in `/dev/blocks` with zero axe violations at 360 and 1440 (Playwright loop over the registry).
- Components contain no hex literals (lint passes).
- Interactive blocks render their full content server-side: with JavaScript disabled, `/dev/blocks/faq`, `/glossary-list`, `/comparison-table`, `/pricing-table` contain the same text as with JavaScript enabled (Playwright text diff).
- Keyboard: Header nav, FAQ, CommandPalette, ChatIntake and BriefForm are fully operable by keyboard with visible focus (Playwright tab-order tests); `prefers-reduced-motion` disables typewriter, counters, parallax and magnetic buttons (asserts no `transform` changes).

## C5 — Syed AI content migration and route parity (Release 1: `/` + `/geo-pricing/` · Release 2: all routes) · ✅ complete 2026-09-04 (ADR-025) — all five routes pass the blocking gate; `/` word count is advisory until the Release 2 interactive blocks land

**Build.** Seed script that extracts content from the legacy HTML/JS (`CASES`, `VENTS`, `PROMPTS`, `QUIZ`, `BANDS`, `PROG`, `FEES`, `PAL`, `CHAT_*`, FAQs, glossary, offers, offices, stats, evidence figures, copy) into Payload documents — parsed from the archive, not retyped; `site-blueprint.json` for the five routes plus proposed `/work/<id>/` and `/building/<slug>/`; SEO field group with title/description/canonical/robots/OG/breadcrumb; composable JSON-LD builders reproducing the legacy graph with stable `@id`s; `robots.txt`, `sitemap.xml`, `llms.txt`, `site.webmanifest`, `404` with real status; `trailingSlash: true`; redirects for `/index.html`, non-slash variants, www/http; hash-route handling for `/#case/<id>`, `/#services` etc.; nonce-based CSP with `manifest-src`; security headers matching `.htaccess` §2.

**Accept — route parity (blocking).** For each route in `docs/baselines/seo-baseline.json`, the staged site's no-JS HTML matches the baseline on: HTTP status; `<title>`; meta description; canonical; robots; `og:*` and `twitter:*` values; exactly one `<h1>` with identical text; the multiset of JSON-LD `@type`s; the set of JSON-LD `@id`s; the 12 glossary anchor ids; the set of internal link targets (allowing additions, blocking removals). Word count within ±5 % of baseline.

- `robots.txt` and `llms.txt` are byte-identical to legacy except for the removal of `.php` references; `sitemap.xml` lists the same five URLs (plus any new ones) with the same priority/changefreq.
- Redirect tests: `/geo-pricing` → 308 `/geo-pricing/`; `/index.html` → `/`; `/geo-pricing/index.html` → `/geo-pricing/`; `http://` → `https://`; `www.` → apex. No redirect chains (single hop).
- `/#case/skincare`, `/#services`, `/#glossary` resolve to the correct view/section (Playwright).
- `/does-not-exist/` returns **404** status and renders the 404 page; `/api/health` requires auth and returns booleans only.
- No hard-coded count string in seeded copy: a test greps seeded rich text for `\b(\d+|twelve|thirteen|seventeen|six|seven|ten)\b (questions|builds|terms|steps)` and fails on any match; the rendered "N questions" text equals the FAQ collection length (ADR-023 §7).
- Every `media` document referenced by a published page has `rights` ≠ `unknown` and non-empty `alt` (or `decorative: true`); the seed fails otherwise (R34).
- Legacy diagnostic paths `/diagnose.php`, `/subscribers.php`, `/send.php`, `/email-check.php`, `/subs.php`, `/confirm.php` return 404 (or `/send.php` 410) — tested.
- Visual regression: screenshots at 360/390/768/1024/1440 compared with `docs/baselines/screenshots/` at a tolerance that allows font-rendering differences but flags layout shifts (Playwright `toHaveScreenshot` with per-route masks for the rotating simulator and animated counters).
- Lighthouse on `/` and `/geo-pricing/` (production build): ≥ 90 in all four categories; results stored as JSON.

## C5.5 — Design packs: design-system bundle, approval packs, Claude-mediated publishing (Release 2; ADR-026)

**Order (ADR-027):** the spike ran first; the remainder ran after C8, because the designer environment and PR previews it relies on are C8 deliverables. Non-blocking to Release 1 acceptance.

**Status 2026-09-10: complete (tag `c5.5`).** Spike done 2026-09-05 (ADR-026 spike results); remainder delivered under ADR-030. What exists:

- **`@factory/design-bundle`** (`tools/design-bundle`) — `pnpm design:bundle --site <client> [--fonts inline|shared] [--neutral] [--check]` renders all 16 blocks × every fixture at 1440 and 390 plus five foundation boards into `apps/<client>/design/ds-bundle/` (49 artboards, 53 files for the pilot), with `tokens/design-contract.json`, licence-gated fonts and `_factory/manifest.json`. `--check` builds twice and compares **every byte**. The committed part is `apps/<client>/design/ds-bundle.manifest.json`, which carries no timestamp and no git description so it is reproducible from the source tree alone.
- **Identity injection** — fixtures are brand-neutral (`{{brand.*}}` / `{ $brandList: … }`); `applyBrand()` resolves them from the blueprint plus `apps/<client>/design/fixture-brand.json`, and the seed, `/dev/blocks` and the bundle all use that one function. Tests assert the blueprint-owned fields cannot drift and that the resolved identity reproduces the pilot's chrome strings byte for byte, so neutral fixtures do not move the parity baseline.
- **`pnpm design:gates --site <client>`** — residue scan over the built bundle with a cross-client deny-list assembled from every _other_ app's own brand facts, plus the Playwright render check's verdict (accepted only when it names this bundle's manifest hash).
- **`pnpm design:signature`** — the distinctiveness gate (ADR-030 §4): blocking for a new client, advisory between existing ones.
- **`pnpm design:sync-status` / `design-sync`** — the truthful status model (ADR-030 §5). A cloud session reports `unavailable-in-this-session` and says nothing has been pushed; `ok` requires a recorded push that returned a remote manifest hash.
- **`pnpm design:pull --site <client> --export <zip|dir>`** — the three-way change report over a limit-first, dependency-free archive reader: tokens through the contrast gate, components as change requests, copy as an editor task, everything else refused by name.
- **`pnpm preview:pack --site <client> --pages … --base <url>`** — page screenshots and `.dc.html` artboards from a **running** site, a stamped PDF, and `pack-manifest.json` the `design-pack` skill reads before publishing. Default viewports are the two review widths; the five-viewport sweep is automated QA.
- **Four first-party skills** (`design-sync`, `design-pack`, `design-pull`, `design-change`) that execute nothing, verified and hash-pinned by `pnpm skills:verify` (now part of `pnpm check`).
- **Responsive QA** (`apps/syed-ai/e2e/design-qa.spec.ts`) at 360/390/768/1024/1440 over every fixture — horizontal overflow, text-on-text overlap, clipping — plus a named phone-hero test, and a **render check** (`design-cards.spec.ts`) that opens all 49 artboards from `file://` and asserts no console error, no network request, axe clean, and that every font the manifest calls embedded actually resolves.
- **Reviewer handoff** — `_factory/handoff.json` + `HANDOFF.md`: versions, artboards with viewport and hash, gates, font rights and provenance, findings, distinctiveness and the sync status.

**ADR-026 spike observation 5 is resolved.** The hero's media "overlapping" the heading at 390 was the static card being displayed at desktop width: a card cannot make a viewport media query resolve against anything but the viewport it is opened in. Cards now declare their viewport and the checks open them there. At a real 390 viewport the phone hero is correct — the text column carries its own gradient and the heading sits inside its section — and `design-qa.spec.ts` asserts exactly that, by name.

**Not done here, by design:** `pnpm baselines:accept` and the ledger-coupled baseline gate remain C9; no service account, automation hook or Automation review view was touched (C6.5); `--fonts shared` is emitted but unexercised, because verifying how the pane resolves relative font URLs needs the owner's `/design-login`.

**Spike (first half-day).** Render two cards (a layout block and the header), push them to a throwaway Claude Design system project under the owner's login, and settle three unknowns: whether the pane resolves relative font URLs (else `--fonts inline`); whether the `@dsCard` marker carries a viewport or the 390 cards need explicit `register_assets`; whether Payload's Lexical `<RichText>` renders under `renderToStaticMarkup` outside Next. Delete the throwaway project afterwards. Each question has a fallback already designed; the spike sets flags, not decisions.

**Build.**

- **Brand-neutral fixtures** — identity fields (`brand.name`, person, role, social links, `copyrightHolder`, hero alt) move out of fixture literals into a `FixtureBrand` injected at render time from the client blueprint's business facts; neutral default "Studio Example"; unit test asserts no fixture literal matches the residue deny-list.
- **`tools/scripts/residue-scan.mjs`** (first slice of the Release 3 scanner) — deny-list of Syed identifiers, domains, addresses, analytics ids, email identities; `pnpm residue:scan <dir>`; runs on every bundle and pack.
- **`pnpm design:bundle --site <client> [--fonts shared|inline]`** — static render of every fixture at 1440 and 390 (`renderToStaticMarkup`; concatenated `tokens.css` + `fonts.css` + primitives + block CSS), foundation boards (Type with scale and licence notice, Colors with contrast ratios, Spacing, Radii & Motion, Chrome), `tokens/design-contract.json`, licence-gated fonts under `assets/fonts/` with licence files, `_factory/manifest.json` (`site`, contract hash, registry version, per-file SHA-256). Output `apps/<client>/design/ds-bundle/` (gitignored); manifest committed. Every card first line `<!-- @dsCard group="…" -->`, `body { background: var(--color-canvas) }`.
- **Render check** — Playwright opens every card: renders without console errors, no card over 256 KiB, zero residue hits, axe clean; `design:bundle` twice → identical manifest.
- **`pnpm preview:pack --site <client> --pages home,geo-pricing,… [--base <url>]`** — Playwright against a _running_ site (local or staging): 1440 and 390 screenshots per page, a paginated PDF stamped with page name, URL, viewport and contract version, and a self-contained HTML design-pack page (component cards + page screenshots + tokens) ready for Artifact publishing. Output `apps/<client>/design/packs/<date>-<hash>/` (gitignored).
- **Project skills** `design-sync` and `design-pack` (`.claude/skills/`, hash-pinned like the vendored skills) — the Claude-mediated publish steps: verify manifest and residue result, run the handshake (remote `site` matches or project empty; project type is a design system; `claudeDesign.projectId` recorded in the blueprint), push changed files only; publish the pack page as a private Artifact; append the ledger row.
- **Ledger** — Design decisions table gains `tier` (system / page / staging), `version` (contract hash + git tag / artifact label) and `thread` (comment thread id) columns; approval convention is the client comment "APPROVED".
- **`design-pull`** (ADR-027) — exports the client's Claude Design project to `apps/<client>/design/claude-design-export/<date>/` and writes a **three-way change report**: token diffs (imported through the contrast gate), component diffs (change requests, implemented as code), copy diffs (routed to the editor as a Payload task). Pull-before-push lock; pane-owned files allow-listed; normalised HTML hashing.
- **`CLAUDE.md` + `design-change` skill** (ADR-027) — branch → edit tokens/blocks → gates → PR with pack attached; refuses external fonts, raw HTML/inline scripts, migrations without the `content-model` label, copy in code, commits to `main`, `.env`, and any deploy.
- **Docs** — `docs/design-packs.md`; `figma-contract.md` demoted; offboarding runbook lists artifacts and projects for deletion.

**Accept.**

- syed.ai's sixteen blocks are visible as a design system in Claude Design (screenshot in the checkpoint report), and a published design-pack Artifact plus a five-page PDF exist for syed.ai.
- `pnpm design:bundle --site syed-ai` run twice produces byte-identical files and the same manifest hash.
- Injecting "syed.ai" into a "Studio Example" fixture makes the bundle fail the residue scan; the default syed-ai bundle passes with the identity supplied from the blueprint.
- A push whose remote manifest says a different `site`, or whose target is not a design-system project, is refused before any write (skill test with a fixture manifest).
- A contract whose text font has `license: proprietary` produces a bundle with no font file for that family and a notice on the Type board.
- Every card passes axe and renders on a light pane ground without contrast failures.
- `design-pull` against a project where one token, one component and one copy string were changed produces a report with exactly one entry in each category; the token lands in the contract as `declared`, the other two are not imported.
- A `design-change` run that adds a Google Fonts `<link>`, an inline `<script>`, or a `migrations/` file is refused with the reason.

## C6 — Forms, CRM foundation, jobs, mock email (Release 1: brief form slice · Release 2: newsletter, roadmap, chat, abuse rules, import)

**Status 2026-09-06: Release 1 slice complete (tag `c6`).** Brief form → contact → lead → activity → `notifyOwner` + `crmSync` jobs; zod schema mirroring `send.php`; honeypot, dwell, Turnstile fail-closed (`TURNSTILE_REQUIRED` for staging/CI), disposable/typo layers, spam score, Postgres-backed limits + dedupe (`rate-events`), deterministic lead score, `CrmProvider` + mock, masked `noindex` `/thanks/`. 15 integration + 9 unit + 6 e2e tests. Release 2 items (newsletter, roadmap, chat, import) remain.

**Build.** Route handlers `POST /api/forms/brief`, `/newsletter`, `/roadmap`; zod schemas mirroring legacy field names and limits; honeypot, dwell, optional Turnstile; Postgres-backed rate limiting (20 req/h, 5 sends/h per IP; 200/day global) and dedupe (900 s); spam scoring port with CMS-editable lists; email validation port (syntax → disposable → typo rescue → MX) with `verdict:'typo'` response; CRM collections (Contacts, Companies, Leads, Pipelines/Stages, Activities, Tasks, Conversations, Messages, EmailTemplates, ConsentRecords, Suppression, LeadScoreRules, LeadScores); deterministic 0–100 lead score with stored components; jobs `notify-owner`, `send-confirmation`, `send-welcome`, `roadmap-scan` (using `safeFetch`, first built inside `agency-core`; it moves to `search-crawler` when the crawler becomes its second consumer), `retry-failed-email`; `packages/providers` email interface with `mock` + `smtp`; newsletter confirm/unsubscribe routes with dedicated secret and RFC 8058 one-click; List-Unsubscribe headers; no-JS HTML response page; CRM admin views (pipeline list, contact record with timeline, open tasks, attribution, score breakdown); `docs/crm-email.md`.

**Accept — the end-to-end lead (definition-of-done item 4).**

- Playwright: fill the brief form on `/` (JS on) → 200 → a `Contact`, a `Lead` (source `form`, page `/`, UTM captured from the URL), one `Activity`, and one queued `notify-owner` job exist; worker processes it; the mock provider holds exactly one message with `Reply-To` = visitor email and the legacy subject format `[form] New brief — <company>`. Re-submitting the same brief within 900 s returns `{duplicate:true}` and creates nothing new.
- Same flow with JavaScript disabled (native POST) returns an HTML confirmation page and produces identical records.
- Chat intake: complete the 9-step flow → same records with source `chat`.
- Newsletter: submit → `Subscriber` status `pending` before any email; mock holds one confirmation with `List-Unsubscribe` and `List-Unsubscribe-Post` headers; GET the confirm link → `confirmed`, consent IP/UA recorded, one welcome message; GET again → "Already confirmed", no new email; POST one-click unsubscribe → `unsubscribed`, `text/plain unsubscribed`. Expired confirm token → 403. Tampered token → 403.
- Anti-abuse unit tests: honeypot filled → silent 200 and no records; dwell < 3 s → 400; 6th send in an hour → 429; disposable domain → 422; `gmial.com` → 422 with suggestion `gmail.com`; `email_ok=1` bypasses typo layer only; spam score ≥ 5 → silent 200 with a `Submissions` record flagged `spam`, no email.
- Roadmap job: runs against a local fixture server; refuses `http://127.0.0.1`, `http://169.254.169.254`, `http://10.0.0.1`, a hostname resolving to a private IP, a redirect to a private IP, and `ftp://` (six SSRF tests); produces a persisted scan with score/findings/plan and queues two emails; the visitor-facing email has all visitor fields HTML-escaped (test injects `<script>`).
- Lead score: fixture leads produce expected totals and every component is stored; changing a rule in `LeadScoreRules` and re-scoring changes the total and appends to score history.
- Email idempotency: the same job executed twice sends once (idempotency key test); SMTP adapter against a local MailHog/Mailpit container delivers with correct `Message-ID`, `In-Reply-To`, `References` on a reply.
- `import-subscribers.ts` (preserved logic) imports a sanitized fixture idempotently: second run creates zero new documents.

## C6.5 — Migration readiness and the automation lane (Release 1 → 2 boundary; ADR-028)

**Status 2026-09-06: foundations landed** — `packages/seo-contracts` (five contracts, fixtures, CLI, JSON Schema), blueprint v2 validated in seed and CI, redirects `proposed|active` seeded and served from the cached map, `pages.migration` + `automation` groups, `seo.lock`, `requireVerifiedToPublish` (`VERIFICATION_ENFORCEMENT`), `qa-report` and `deploy-event` emitters, `tools/wordpress-import` boundary primitives. **Pending (C6.5 proper):** `service-accounts` + `automation` role + hooks, Automation review view, proxy limiter, `no-public-email` gate, `privacyContactAlias`, `schema-entities` email hook, audit `actorEmail` removal, threat-model `automation` row.

After C6, before C7. ~3 days. Adopts the OGCS Integration Pack v1 prerequisites P1–P4 and P6 with the ADR-028 amendments. Everything here is additive to `agency-core` under one migration; syed.ai parity and the threat-model suite are the regression guard.

**Build.**

- **`packages/seo-contracts`** — zod schemas + types + golden/negative fixtures + `validate` CLI for `blueprint` v2, `evidence-bundle`, `page-decisions`, `qa-report`, `deploy-event`; `zod` only; lint forbids `agency-core` imports both ways; schema rule: no string matches an email pattern; JSON Schema emitted for OGCS. Consumed as a tag-pinned dependency (GitHub Packages or git), never public npm.
- **Blueprint v2** — `version: 2`, required `parity` block, `pages[].migration`, `pages[].decision_ref`, `redirects[]` seeded; `seed.ts` validates and exits non-zero with JSON-pointer errors; `tools/legacy-extract` emits v2; CI validates every `apps/*/content/*.blueprint.json`.
- **`service-accounts`** auth collection (`useAPIKey`, `disableLocalStrategy`, single fixed role `automation`, `enabled`, `lastUsedAt`, `dailyWriteBudget`); `AUTOMATION_WRITERS` applied to create/update on `pages`, `posts`, `media` only; `SENSITIVE_COLLECTIONS` += `service-accounts`; hooks: `refuseStatusPublishedForAutomation`, `refuseVerificationChangeForAutomation`, `refuseSlugOrParentChangeForAutomation`, `protectLockedSeo`, `requireVerifiedToPublish` (everyone), `requireMediaRightsForAutomation`, `stampAutomationDraft` (`automation.pendingReview`, `runId` from `X-OGCS-Run-Id`, autosave bypassed); audit rows carry `runId`, actor id and role (drop `actorEmail`).
- **Automation review view** (admin custom view) — pending drafts grouped run → page → field; plain-English diffs; tactic + risk class; Approve / Reject / Hold at each level; Revert run (restore pre-run versions); conflict flag when a human edited after the draft; audit + ledger row per run; per-client `automationAutoPublish` flag (default off) reserved for a later narrow field set.
- **Redirects** — `status: proposed | active` (automation creates `proposed`); active map materialised to a tag-revalidated internal endpoint cached by `proxy.ts` with a build-time `redirects.json` fallback; seed upserts `blueprint.redirects[]` as `active` with `source: 'migration'`; slug-change hook still yields a served 308.
- **`pages.migration` group** (source URL, hash, decisions version, imported at) — admin-only, sidebar, read-only in UI; `sourceUrl` unique when present.
- **Verification enforced** — `requireVerifiedToPublish` on `pages`/`posts`; `quality-gates` gains `seo-launch-gate` (any published page unverified, any PROTECT URL missing from the sitemap, any `noindex` on `seo.lock` → fail).
- **Rate limiting** (R56) — `proxy.ts` limiter: per service account for `/api/*` (from `dailyWriteBudget` + a per-minute cap) and the C6 Postgres-backed limits for form routes; Cloudflare rate rule documented; `securityDefaults().rateLimit` removed as dead configuration.
- **No-public-email invariant** (ADR-028 §10) — `contact-legal.contactEmailPublic` → `privacyContactAlias` (rendered only on the `privacy` page type; validation refuses any `users` email or `integrations.email.*` address); `schema-entities` hook refuses `email` in `ContactPoint`/`Organization`/`Person`; `quality-gates` gains `no-public-email` (crawls public routes, `llms.txt`, sitemap, public `/api/globals/*` and public collections; fails on `mailto:`/email patterns except the alias on the privacy page); residue scanner email rule extended to bundles, packs and `handoff/`; form and newsletter confirmation pages `noindex`, uncacheable, address masked.
- **Docs** — `docs/ogcs-integration.md`; runbook line for `PAYLOAD_SECRET` rotation re-issuing API keys (R58); threat-model matrix gains the `automation` row.

**Accept.**

- Contract fixtures validate; the three negative `page-decisions` fixtures fail with the expected JSON pointer; an artefact containing an email string is rejected.
- Threat model: `automation` cannot read `users`, `service-accounts`, `contacts`, `leads`, `companies`, `activities`, `submissions`, `subscribers`, `integrations`, `audit-log`; cannot delete anything; cannot create `users` or `service-accounts`; cannot change its own roles; a disabled account gets 401; API-key auth works with `disableLocalStrategy`.
- A service account's write with `_status: 'published'`, a `verification.*` change, a slug or parent change, a `noindex`/`canonical` change on a locked page, or a `media` create without `rights` each throws with the documented message; the same writes as a draft succeed and appear in the Automation review view with `runId`.
- Bulk approve of a run publishes every draft in it, writes one audit row per document with approver id and `runId`, and one ledger row; Revert run restores each document to its pre-run version; a page edited by an editor after the automation draft is flagged and excluded.
- `proposed` redirects are not served; `active` ones resolve in exactly one hop with the declared status; a 410 returns no body; a slug change is served without restart.
- Seed of an invalid blueprint exits non-zero with a JSON pointer; syed.ai blueprint regenerated as v2 with pages/blocks byte-identical apart from new keys; parity on all five legacy routes 0 blocking.
- `no-public-email` passes syed.ai; fails on a planted `mailto:` in a page, on `ContactPoint.email` in a schema entity, and on a `users` email set as `privacyContactAlias`; the alias on the privacy page passes.
- Proxy limiter returns 429 at the configured rate for a service account and for the form route; audit rows contain no `actorEmail`.

## C7 — No-AI mode and AI provider skeleton (Release 1)

**Status 2026-09-06: complete (tag `c7`).** `packages/providers` (`@factory/providers/ai`): framework-free AI interface, gateway enforcing two switches → feature → permission → budget → prompt registry → allow-list redaction → timeout → structured-output validation → provenance stamp; deterministic `mock` provider; prompt registry with per-prompt allow-lists and zod output schemas. App side: `aiConfig`/`aiBudget`/`aiBudgetState`, the `leadSummary` job (no-op with a reason when disabled; asserts the deterministic score is unchanged), `audit-log.detail` for metadata-only AI logging, `integrations.ai.status` virtual field showing which switch is off, `docs/ai-providers.md`. 12 unit + 7 integration tests; CI runs the whole suite a second time with `AI_ENABLED=false AI_PROVIDER=none`.

**Build.** `packages/providers` AI interface, gateway (budgets, permissions, redaction, prompt registry, structured output, provenance `generated`), `mock` provider only; `AI_ENABLED=false` default; admin shows "AI disabled" states; `docs/ai-providers.md`.

**Accept.** The full C5 + C6 suite passes with `AI_ENABLED=false` and no provider configured (CI job). With the mock provider enabled, a lead summary job produces a record labelled `provenance: generated`, `provider: mock`, `promptVersion`, `timestamp`, `confidence`, and the deterministic lead score is unchanged (assert equality before/after).

## C8 — Containers and deployment notes (Release 1)

**Status 2026-09-06: complete (tag `c8`), with two acceptance items deferred to CI.** Delivered: `/api/health` (readiness — Postgres via a real `payload.count`, storage via `S3_*` presence or a write check on `MEDIA_DIR`; fixed key shape `{status, checks:{database, storage}}`, 200/503, `no-store` + `noindex`, no hostname, version, path or driver text in the body) and `/api/live` (liveness, `{status:'ok'}`, no dependencies — so a liveness probe never restarts a container over a database blip); `apps/syed-ai/Dockerfile.dev` (toolchain + installed dependencies, sources bind-mounted) and a hardened `.dockerignore`; root `compose.yaml` (`db` → `migrate` (runs to completion) → `web` + `worker` from one image, `seed` behind a profile, named volumes for `pgdata`/`media`/`node_modules`/`next_cache`, staging-like env: `AI_ENABLED=false`, `TURNSTILE_REQUIRED=false`, `VERIFICATION_ENFORCEMENT=warn`, `DEV_ROUTES=1`) — this is also the designer's local environment (ADR-027); the production `Dockerfile` HEALTHCHECK now hits `/api/health`; `tools/scripts/backup.sh` (pg_dump → tar → zstd → age → S3 → verify, `--dry-run`); `.github/workflows/deploy.yml` (staging on push to `main`; production only from a `v*` tag, behind a GitHub Environment approval, refusing a tag that is not an ancestor of `main`, waiting for readiness, then emitting a `deploy-event`); `docs/deployment-coolify-cloudflare.md`; `.env.example` completed (every variable the code reads, including the C8 additions).

**Fixed in C8 (security).** The brief route trusted `x-forwarded-for` unconditionally, so any caller could mint a fresh intake rate-limit bucket per request by varying the header. `packages/agency-core/src/intake/client-ip.ts` makes the trusted-address source explicit and fail-closed (`TRUSTED_PROXY=cloudflare|xff|xff-last|none`, default `none`), rejects values that are not plausible addresses, and buckets every untrusted request together (`UNTRUSTED_BUCKET`). 4 unit tests cover spoofing, a missing edge header, both hop orders and separator smuggling.

**Deferred to CI (no Docker daemon in the build sandbox).** `docker build`, the image-content assertions (non-root; no `.env`, no `legacy-reference/`, no tests, fixtures or `handoff/` in the image), the readiness assertions against a container (including database-down → 503 and the fixed key shape plus leak greps) and the Compose smoke test all run in the CI `docker` job, which must be green on the first push (same arrangement as C0). Health and liveness were verified locally against the standalone server in both states: `{"status":"fail","checks":{"database":"fail","storage":"ok"}}` / 503 with Postgres stopped, `{"status":"ok",…}` / 200 after restart, no leakage in either body. `apps/syed-ai/e2e/health.spec.ts` (4 tests) asserts the same from the browser.

**Added (ADR-027):** the Compose stack is also the designer's local environment (`docs/designer-onboarding.md`); Coolify PR **preview deployments** from the GitHub repo; **production deploys only from a tagged release** with a manual approval step once a site is launched; no Claude session holds a deploy credential; `docs/runbooks/first-push.md` (sanitisation, import, remote, branch protection — ADR-031 replaced the history rewrite with a fresh-history import) executed before C8 begins.

**Build.** Dockerfiles (dev, prod multi-stage) producing `web` and `worker` from one image; Compose for local; Coolify deployment notes; health/readiness endpoints; Cloudflare cache-rule notes; `.env.example` fully documented; `docs/deployment-coolify-cloudflare.md`; backup script skeleton.

**Accept.** `docker compose up` on a clean machine serves the site and admin; `docker build` succeeds; container runs as non-root; production image contains no `.env`, no `/legacy-reference`, no test fixtures (image scan test). `/api/health` returns 200 only when Postgres and storage respond, and never includes hostnames, versions or paths (snapshot test of the JSON keys).

## C9 — Quality gates, QA matrix, content verification, release report (Release 2)

**Added (ADR-023):** launch mode blocks when `turnstileReadiness()` is not `ok` for production (site key present in `integrations`, `TURNSTILE_SECRET` set); the form route's 503 path is tested; the dossier and this plan are updated at the close of every checkpoint (G4).

**Added (ADR-028):** `compare.mjs --contract` wraps its report as a `qa-report` artefact (with the `protect_missing` check from a `--decisions` file) and a post-deploy step writes `deploy-event`, both committed under `apps/<client>/handoff/`; `no-public-email` and `seo-launch-gate` run in production-launch mode.

**Added (ADR-027):** `pnpm baselines:accept --reason` couples baseline changes to a ledger Design decision row and CI refuses a baseline diff without one; the migration path guard (`migrations/**`, `**/payload.ts` need the `content-model` label) is a required check; e2e asserts zero CSP violations in the browser console on every public route.

**Added (ADR-026):** the design-system bundle builds byte-identically, every card passes the render check, and the residue scan on bundle and packs reports zero hits; the ledger's Design decisions table has a row for every page in scope at tier `page` or `staging` before production-launch mode passes.

**Added (R24, R35, R39):** per-environment indexability gate (staging must be noindex + access-protected); explicit performance budgets enforced in CI (≤90 KB gz JS, ≤40 KB gz CSS per public page, ≤200 KB above-fold images, LCP <2.5 s throttled mobile, CLS <0.1); launch checklist gains GSC property + sitemap submission, Bing, redirect-map 404 monitoring, Turnstile-enable decision.

**Build.** `quality-gates` run over the staged site; `docs/content-verification-ledger.md` populated and every fact carrying a `verification` status (ADR-016); reversible-launch criteria in `docs/launch-checklist.md` (legacy host stays live; DNS cutover only after staged crawl parity and backup proof); blocking (accidental noindex, missing/invalid canonical, redirect loop, broken critical route, empty title/H1, invalid required schema, sitemap omission, 5xx, parity mismatch, secret exposure, cross-client string leak) vs advisory (title length, description quality, internal links, thin evidence, missing citations, AI-readiness hints); machine-readable JSON report; `docs/qa-matrix.md`, `docs/launch-checklist.md`; Milestone 1 report.

**Accept.** Gate run on the staged Syed AI site reports zero blocking findings for staging; production-launch mode additionally blocks while any indexable fact is `unverified` (test seeds one unverified price and asserts the block); injecting `noindex` on `/glossary/` in a test seed produces one blocking finding and a non-zero exit; advisory findings never change the exit code.

## Multilingual / regional SEO (ADR-029) — recorded, not built

Not implemented before C7/C8, and not implemented in the Factory first: **H2O proves the multilingual Payload implementation in its own isolated staging delivery project**, and after that build passes its QA the proven implementation and requirements come back for **reconciliation into the Factory at Release 4, alongside the WordPress importer** (a Factory ADR at that point, checked against one-deployment-per-client, blueprint-only ingress, the parity gate and the no-public-email invariant).

Independent of the reconciliation, and landing with the importer's parse stage in Release 4: **language/region detection that never assumes a monolingual source** (translation-plugin tables, `wp_options` language settings, per-language permalinks, existing hreflang rows), always recorded in the import manifest, **failing loudly** rather than flattening (A23, R60). H2O intake captures historical and current variants up front (`docs/intake/h2o-language-region-variants.md`).

**Accept (Release 4, detection only).** A synthetic fixture with a translation plugin's tables produces a `LanguageDetection` with the right languages, URL pattern and default; the monolingual fixture produces `{multilingual: false, languages: []}` explicitly; a fixture with variants the Factory cannot represent makes the import exit non-zero with the languages and reason named, and writes no blueprint. **Accept (reconciliation).** Set at reconciliation time, from the proven H2O implementation; the parity gate and the `qa-report` check enum gain `hreflang` (MINOR contract bump) with a reciprocity and `x-default` check (R61).

## Out of scope for Releases 1–2

Factory extraction and `pnpm create-site` (Release 3), WordPress importer and multilingual reconciliation (Release 4, ADR-029), Search Evidence extraction beyond `safeFetch` (Release 5–6), real email/AI providers, inbound sync, backup restore drill, DNS cutover (Release 7).

## Risks carried into Releases 1–2

R7 parity drift (mitigated by C5 gates), R9 roadmap abuse (C6 caps), R15 CSP with Next.js inline runtime (nonces; verified in C5), font licensing confirmation (A2, C2), owner confirmation of new case-study URLs (A4, before C5 sitemap is final).
