# Claude Master Build Prompt: Syed AI Agency Site Factory

## Your role

Act as the principal software architect, senior Next.js and Payload CMS engineer, design-systems engineer, technical SEO engineer, CRM/email engineer, security reviewer, and QA lead for this project.

This is an implementation project, not only a consultation or architecture exercise. First inspect every supplied file, document the existing behavior, propose the implementation sequence, and then build the system in testable milestones. Do not replace working behavior merely to make the code look newer. Preserve the public experience, URLs, content, SEO signals, and useful business logic while moving them into a reusable architecture.

Ask a question only when the answer would materially change security, data ownership, scope, or architecture. Otherwise, state a reasonable assumption, record it in `/docs/assumptions.md`, and proceed.

Never put credentials in source code. Generate `.env.example` files with descriptive placeholders. Never request production database dumps containing customer personal data when a sanitized fixture will work.

## Files I am providing

1. `syed-ai-site.zip`
   - Treat this as the pilot website, visual reference, content source, and behavior specification.
   - It contains static HTML, CSS, JavaScript, PHP endpoints, PHPMailer code, design documentation, assets, and preliminary Payload work.
   - Preserve it unmodified under `/legacy-reference/syed-ai-site/` after extraction so that the migration can be compared with the original.

2. `searchevidencesuite-ai-readiness.zip`
   - Treat this as proprietary application code and the source for the Search Intelligence module.
   - It currently includes a browser-based search evidence console, IndexedDB storage, imports for search/crawl data, technical SEO analysis, content and schema analysis, AI-search readiness analysis, recommendations, reports, and related workflows.
   - Preserve an unmodified copy under `/legacy-reference/search-evidence-suite/`.

3. Optional design source:
   - A Figma file/link made available through the supported Figma integration, or exported Figma frames, variables/tokens, SVG assets, and font information.
   - Alternatively, a Claude-created design-system package containing tokens, components, page compositions, assets, and responsive rules.

4. Optional WordPress migration inputs:
   - WordPress WXR XML export and/or REST API export.
   - Public media URLs or a media archive.
   - Rank Math or Yoast metadata, redirects, schema settings, and sitemap.
   - ACF field definitions/data and Elementor page data if used.

Before modifying code, produce `/docs/input-inventory.md` listing the supplied files, their important directories, major features, data stores, routes, third-party dependencies, security concerns, and migration implications. Also create `/docs/assumptions.md` and `/docs/decision-log.md`.

## Mission

Build Syed AI as the first production site on a reusable private “Agency Site Factory.” The factory must let us turn a well-structured Figma file or Claude design-system package into a beautiful, accessible, high-performance, Payload-managed website. Once the foundation is stable, a typical 10–20-page client website should be designable, populated, tested, staged, and launched within a few days.

The reusable platform must include:

- A robust component and design-token system.
- Payload CMS and PostgreSQL.
- A lightweight CRM for website leads.
- Provider-neutral outbound and inbound email integration.
- Optional AI features using Anthropic, OpenAI, Qwen, or compatible self-hosted models.
- Strong technical SEO and structured-data controls.
- The supplied Search Evidence Suite as an integrated, evidence-based Search Intelligence module.
- WordPress content and SEO migration tools.
- Automated accessibility, SEO, browser, performance, form, migration, and security testing.
- Repeatable per-client provisioning with strict separation of client data, credentials, deployments, and databases.

Do not promise rankings, citations, traffic, or inclusion in an AI answer. Build the technical foundation, evidence workflow, measurement, and editorial controls that improve the probability of search visibility while preserving honest uncertainty.

## Non-negotiable principles

1. Payload is the editorial and operational control plane; Next.js is the public rendering layer.
2. Public pages must be server-rendered or statically rendered as appropriate. Essential content, links, metadata, and schema must exist in the initial HTML and must not depend on browser JavaScript.
3. Runtime AI must be optional. The public website, CMS, CRM, forms, search audits, and email workflows must continue to function when every AI provider is disabled.
4. Build-time AI and runtime AI are different systems. Claude may help write and maintain the application, but production AI calls must go through explicit provider adapters, budgets, permissions, and logging.
5. Separate reusable platform code from client branding, content, data, secrets, and deployments.
6. Prefer a small, understandable set of dependencies. Do not recreate stable security, authentication, database, queue, parsing, or email standards without a strong reason.
7. Preserve evidence provenance. Never turn generated content or an unverified model opinion into a measured fact.
8. A human must approve content, SEO fields, redirects, structured data, lead actions, and email sends unless a workflow has been explicitly marked safe for automation.
9. No production secret, API token, SMTP password, Gmail OAuth token, customer PII, or private key may enter the repository, prompt logs, client-side JavaScript, or AI context.
10. Each client gets a separate application environment, database, object-storage namespace, encryption material, and secrets. Several isolated deployments may share infrastructure, but must not share tenant data by default.

## Preferred technical stack

Use current stable, mutually compatible releases and record exact versions in the lockfile and `/docs/versions.md`.

- TypeScript throughout.
- Next.js App Router for the public site and integrated application routes.
- Payload CMS for content management, admin UI, authentication, access control, uploads, and operational collections.
- PostgreSQL for durable application data.
- A PostgreSQL-backed job mechanism or Payload-supported job system for imports, crawl work, email synchronization, outbound messages, reports, and AI jobs. Do not add Redis unless load testing shows it is needed.
- A package manager and monorepo workspace, preferably `pnpm`.
- React components with CSS variables and a maintainable styling approach. Avoid a generic template aesthetic.
- S3-compatible storage in production, with Cloudflare R2 as the preferred target and local storage for development.
- Docker-based deployment suitable for Coolify on a VPS.
- Cloudflare for DNS, TLS, CDN/caching, practical WAF rules, Turnstile, and optional R2.
- Stalwart as one supported SMTP/JMAP mail provider. SnappyMail is only a human mailbox interface, not the CRM integration API.
- Gmail API with OAuth for Google Workspace mailbox synchronization where appropriate; support Google Workspace SMTP relay and generic SMTP for outbound-only configurations.
- Playwright, an accessibility testing library such as axe, unit/integration tests, type checking, linting, and repeatable production build checks.
- Optional PostHog analytics with privacy-safe configuration and Uptime Kuma for infrastructure monitoring.

If a preferred dependency is incompatible with the current stable Payload/Next.js ecosystem, explain the conflict in the decision log and use the simplest supported alternative.

## Target repository structure

Create or evolve toward this logical structure. Adjust names only when required by the chosen workspace tooling.

```text
/apps/syed-ai
/packages/agency-core
/packages/component-registry
/packages/design-system
/packages/design-compiler
/packages/wordpress-importer
/packages/email-providers
/packages/ai-providers
/packages/search-evidence-core
/packages/search-data-ingestion
/packages/search-crawler
/packages/search-ai-observations
/packages/payload-search-plugin
/packages/quality-gates
/templates/client-starter
/tools/create-site
/docs
/legacy-reference
```

Keep client-specific items in the client application or a clearly defined client config layer:

- Brand name, domains, logos, icons, imagery, colors, font files/licensing notes, voice, legal details, navigation, analytics IDs, email identities, integrations, and content.

Keep these reusable:

- CMS schemas, approved page blocks, SEO fields, schema builders, CRM data model, provider interfaces, job framework, permissions, audit logging, security controls, importers, Search Intelligence, tests, deployment templates, and creation commands.

Do not build one database with a `clientId` added everywhere for the first version. Default to an isolated deployment and database per client because it is easier to reason about, back up, restore, secure, and transfer.

## Design-to-code system

### Normalized design contract

Both Figma and Claude-created designs must compile into one versioned intermediate format called `design-contract.json`. Do not couple page rendering directly to one design tool.

The contract must include:

- Brand assets and variants.
- Color roles, not only raw colors: canvas, surface, elevated surface, primary text, muted text, accent, accent contrast, border, success, warning, and error.
- Typography families, weights, optical rules, fluid size scale, line height, letter spacing, measure, and fallback stacks.
- Spacing, grids, container widths, breakpoints, radii, borders, shadows, motion, focus treatment, and z-index layers.
- Named component variants and states.
- Content-width and responsive behavior.
- Image aspect ratios and art-direction notes.
- Accessibility notes and contrast results.
- Source references back to Figma nodes or Claude design files.

Provide documented source adapters:

- Figma variables/tokens and component metadata to the design contract.
- Claude design package to the design contract.
- Existing website/design tokens to the design contract.

For Figma, define a practical handoff contract in `/docs/figma-contract.md`:

- Use variables for colors, spacing, type sizes, radii, and semantic roles.
- Use Auto Layout and explicit responsive intent.
- Name components and variants consistently.
- Identify reusable sections and page recipes.
- Provide desktop and mobile frames for every distinct page type.
- Export logos/icons as SVG when appropriate and photography at suitable sizes.
- Document licensed font files and permitted web use.

Include `figma-tokens.json` support and a command such as `pnpm import:figma-tokens`. Generated token output must be deterministic, reviewable, and committed separately from client content.

### Approved component registry

Create a typed registry of approved building blocks rather than generating arbitrary markup for each page. At minimum support:

- Header, announcement, breadcrumb, footer.
- Hero variants.
- Rich text and editorial prose.
- Logo cloud and trust evidence.
- Feature grids and media/text sections.
- Service and industry sections.
- Metrics and evidence panels.
- Testimonial and case-study components.
- Process/timeline sections.
- Pricing and comparison sections.
- FAQ and glossary components.
- Calls to action.
- Contact, newsletter, chat-style intake, scorecard, calculator, and gated-resource forms.
- Related content, author information, citations/references, and update history.

Each block needs a Payload schema, React implementation, responsive behavior, accessibility requirements, Storybook-like fixture or development preview, and automated tests where behavior is non-trivial.

### Typography and visual quality

The output must feel intentionally art-directed, not like a generic AI dashboard or component-library demo.

- Use at most two main type families unless the supplied design clearly justifies another.
- Self-host optimized WOFF2 fonts when licensing permits; preload only truly critical font files and provide good system fallbacks.
- Use a fluid type scale with intentional heading hierarchy and mobile behavior.
- Aim for readable prose measures around 55–75 characters.
- Establish consistent baseline, vertical rhythm, alignment, and whitespace.
- Use balanced or pretty text wrapping progressively, with safe fallbacks.
- Avoid excessive rounded cards, pills, gradients, glass effects, gratuitous icons, and dense boxed layouts.
- Preserve the Syed AI visual language found in the supplied site: near-black/dark foundations, restrained champagne-gold accents, square geometry, editorial contrast, Bodoni Moda-style display typography, and Jost-style body typography, subject to font licensing and accessibility verification.
- Support reduced motion, keyboard navigation, visible focus, high contrast, zoom, long text, and content reflow.

### Site blueprint

Create a versioned `site-blueprint.json` describing:

- Route and page type.
- Page title/purpose and primary audience.
- Chosen component sequence.
- CMS content references.
- SEO intent, canonical rule, schema type, and indexability.
- Design source reference.
- Required forms/integrations.
- Acceptance checks.

Create reusable recipes for home, service, industry, location, about, team/person, case study, article/blog, category, pricing, comparison, FAQ, glossary, contact, legal, campaign landing, and custom tool pages. Recipes are starting points, not rigid templates.

## Syed AI pilot migration

Use `syed-ai-site.zip` as the first proof that the factory works.

Preserve the existing public routes, including at least:

- `/`
- `/geo-pricing/`
- `/geo-vs-seo/`
- `/cited-not-recommended/`
- `/glossary/`

Inventory all other routes before implementation. Preserve trailing-slash behavior or create explicit permanent redirects. Never silently change a ranking URL.

Migrate the useful behavior currently implemented in HTML/CSS/JavaScript/PHP, including where present:

- Conversational/chat-style contact intake.
- Standard contact and newsletter forms.
- Double opt-in/confirmation flow.
- Roadmap generation.
- Scorecard and calculators.
- Answer simulator.
- Command palette.
- Subscriber storage.
- Existing SEO tags, schema, copy, images, and internal links.

Replace PHP endpoints such as `send.php`, `roadmap.php`, subscriber handlers, and confirmation handlers with validated server-side application routes, Payload operations, and background jobs. Remove public diagnostic behavior such as `diagnose.php` and `email-check.php`; replace it with authenticated health checks that expose no secrets or infrastructure details.

Map hard-coded JavaScript arrays and editable business content to Payload collections, globals, or typed configuration. Keep interaction code in the frontend only when it truly represents UI state.

Use `_private/docs/DESIGN-TOKENS.md`, the current CSS, and rendered pages as design evidence. If no Figma input is supplied for this first build, derive the initial `design-contract.json` from those sources and clearly label inferred values.

## Payload CMS content model

Implement only fields that have a clear editorial or operational purpose. Suggested content types:

- Pages.
- Posts/articles.
- Authors and people.
- Categories, tags, topics, services, industries, and locations.
- Case studies, testimonials, FAQs, glossary terms, citations/references, and reusable calls to action.
- Media with alt text, focal point, caption, rights/source, dimensions, and optimization state.
- Navigation menus, redirects, forms, form submissions, and site notices.
- SEO templates and reusable schema entities.

Suggested globals:

- Site settings.
- Brand settings.
- Header/navigation.
- Footer.
- Contact and legal details.
- Default SEO/social metadata.
- Integration toggles and public identifiers.

Pages should use approved typed layout blocks. Avoid allowing unbounded arbitrary HTML. If a trusted administrator needs custom embeds, isolate and sanitize them.

Add drafts, preview, version history, scheduled publishing where supported, revalidation after publish, role-based access, and an audit trail for important operational changes.

## Technical SEO and AI-search foundation

Implement SEO as first-class data and validation, not as a final plugin pass.

Per indexable page support:

- Editable SEO title and meta description with safe template fallbacks.
- Canonical URL.
- Index/follow controls.
- Open Graph and social card metadata.
- Featured/social image.
- Primary keyword/topic as editorial planning data, not a ranking switch.
- Breadcrumb data.
- Redirect history when slug changes.
- Relevant structured-data configuration.
- Optional citations/references and reviewed/updated dates.

Generate:

- Valid canonical URLs.
- XML sitemap indexes and segmented sitemaps where useful.
- Intentional robots.txt.
- RSS/Atom feeds for editorial content where useful.
- Breadcrumbs and consistent internal navigation.
- Correct status codes, redirects, pagination behavior, and not-found pages.
- `llms.txt` only as an experimental, transparent aid; never represent it as a ranking requirement.

Build composable JSON-LD for relevant entities and page types, such as Organization or LocalBusiness, WebSite, WebPage, BreadcrumbList, Article, Person, Service, Product/Offer when factual, FAQPage only when eligible and visible, and other types supported by the real content. Never generate fabricated ratings, reviews, prices, credentials, or relationships. Do not attach every schema type to every page.

Enforce exactly one clear page-level H1 unless an explicitly documented accessibility/semantic exception exists. Preserve a logical heading outline, descriptive anchor text, crawlable links, image dimensions, useful alt text, and server-rendered primary content.

Create an SEO validation panel in Payload that distinguishes:

- Launch-blocking errors: accidental noindex, missing/invalid canonical, redirect loop, broken critical route, empty title/H1, invalid required schema fields, missing sitemap inclusion, server error, or material migration mismatch.
- Advisory opportunities: title length, description quality, weak internal linking, thin evidence, missing citations, unhelpful heading copy, or AI-readiness suggestions.

Advisory scores must never prevent a legitimate editor from publishing unless the client explicitly changes policy.

## Search Evidence Suite integration

Do not iframe the supplied console or paste its large application file into the Payload admin as the final architecture. First make the existing application runnable and capture characterization tests or stable fixtures for its important calculations. Then extract its reusable engines incrementally into typed modules.

Keep a standalone edition working if practical while creating an integrated edition.

Target packages:

- `search-evidence-core`: normalized types, evidence model, scoring, audit rules, recommendation logic, comparisons, report data, and deterministic calculations.
- `search-data-ingestion`: parsers/adapters for Google Search Console exports/API data, Semrush exports, crawler exports, Screaming Frog, Sitebulb, and supported CSV/JSON formats.
- `search-crawler`: secure server-side crawl orchestration, extraction, normalization, crawl budgets, robots handling, and comparison.
- `search-ai-observations`: explicitly labeled observations from supported AI/search-answer sources or manual evidence capture.
- `payload-search-plugin`: Payload collections, access rules, admin views, actions, jobs, reports, and links to affected content.

Replace IndexedDB as the system of record in the integrated edition with PostgreSQL. IndexedDB may remain only for temporary client-side draft state or the standalone edition. Replace `proxy.php` in the integrated edition with authenticated server jobs and strict outbound-request protection.

The crawler/fetch layer must defend against SSRF:

- Allow only HTTP/HTTPS.
- Resolve and reject loopback, link-local, private, metadata-service, and disallowed network destinations.
- Re-check redirects and DNS resolution.
- Enforce timeouts, content-type and size limits, concurrency limits, crawl budgets, and a controlled user agent.
- Log requests without secrets.
- Respect explicit project scope and robots policy.

Suggested Payload collections:

- SearchProjects.
- DataConnections.
- ImportedDatasets.
- CrawlRuns and CrawledPages.
- SearchMetrics.
- PageAudits.
- TopicClusters.
- Competitors.
- AISearchObservations.
- AuditRuns.
- Recommendations.
- ContentBriefs.
- DraftAnalyses.
- Snapshots.
- SearchReports.

Preserve and make visible the Search Evidence Suite's methodological safeguards:

- `observed`: directly found during a crawl, API retrieval, or reproducible check.
- `reported`: supplied by a third-party platform/export.
- `recorded`: manually entered with source/date/proof.
- `generated`: an AI or deterministic suggestion, not proof.
- Missing evidence is `null` or “not measured,” never zero and never silently inferred.
- Generated writing or AI suggestions cannot improve a measured score until published and subsequently observed.
- Every score stores its model/rules version and calculation timestamp.
- Recommendations include evidence links, affected URLs, confidence, effort, expected impact, owner, state, and verification criteria.

Integrate these existing or inferred capabilities after confirming them in the source:

- GSC and Semrush ingestion.
- Crawl and site-audit ingestion.
- Technical SEO and page-level analysis.
- Topic clustering and content cannibalization analysis.
- Internal-link recommendations.
- Media, metadata, and structured-data checks.
- SERP-feature and generative-search observation formats.
- AI eligibility/readiness checks.
- Citation/evidence packs.
- Content briefs and a controlled live editor/draft workflow.
- Action queue, snapshots, comparisons, and reports.

Search Intelligence workflow:

1. Create a project and define verified domains and crawl scope.
2. Import data or run authorized connectors/crawls.
3. Normalize evidence and calculate versioned audits.
4. Link findings to Payload pages/posts by canonical URL.
5. Create recommendations or content briefs.
6. Let an editor accept, reject, assign, or convert them to a draft.
7. Require human approval to publish material content/schema/redirect changes.
8. Re-crawl after deployment and compare observed results with the baseline.
9. Add outcome metrics when enough post-change data exists.

The integrated module should improve production work in three places:

- Pre-launch: crawl staging and preview output, compare routes/content/metadata/schema/internal links with the source site, and enforce critical gates.
- Editorial: show page-specific evidence and recommendations beside the content being edited.
- Post-launch: measure indexing, impressions, clicks, position, technical health, content changes, and explicitly captured AI-search observations over time.

Join Search Intelligence with CRM outcomes only at safe attribution levels such as landing page, campaign, source/medium, and aggregate conversion/revenue. Do not claim that a particular search query belongs to a named lead unless reliable consented first-party data proves it.

Create commands similar to:

```text
pnpm search:import
pnpm search:crawl --project=<id>
pnpm search:audit --project=<id>
pnpm search:compare --project=<id> --baseline=<snapshot>
pnpm search:report --project=<id>
```

AI-search observations must record provider/surface, model or interface when known, query/prompt, locale, date/time, whether the brand/domain was cited, exact destination URL if present, captured proof, extraction method, and confidence. Treat this as sampled observation data, not universal ranking data.

## CRM

Build a focused CRM for website-generated opportunities, not a premature replacement for every enterprise CRM feature.

Suggested collections:

- Contacts.
- Companies.
- Leads/opportunities.
- Pipelines and stages.
- Activities/timeline events.
- Tasks and reminders.
- Conversations, messages, and email threads.
- Forms and submissions.
- Email templates.
- Campaigns or sequences only after the transactional flow is stable.
- Consent records, suppression entries, and communication preferences.
- Lead-score rules, score history, and AI insights.

Form submission flow:

1. Validate and normalize on the server.
2. Verify Turnstile when enabled and apply rate limits/honeypot rules.
3. Create or safely match the contact using normalized email/phone and provenance.
4. Create a lead/opportunity and record the source page, UTM values, referrer, campaign IDs, consent, and submitted fields.
5. Add an immutable timeline activity.
6. Queue notifications and acknowledgements; do not block the form response on SMTP.
7. Return a stable success/failure response without exposing infrastructure details.

Use a deterministic, configurable lead score from 0–100 for auditable factors such as service fit, geography, budget, timeline, engagement, recency, and explicit negative conditions. Store every score component. AI may summarize, classify, or recommend a next action, but it may not silently overwrite the deterministic score or send a message. Label AI output, provider/model, prompt version, timestamp, confidence, inputs used, and reviewer action.

Provide practical CRM views:

- Pipeline board/list.
- Contact/company record.
- Chronological activity and email timeline.
- Open tasks and follow-up date.
- Source/landing-page attribution.
- Deterministic score breakdown.
- Optional AI summary and recommended next step.
- Search-content conversion report aggregated by landing page.

## Email architecture

Create a provider-neutral interface covering outbound send, delivery events where available, inbound synchronization where available, thread/message normalization, and connection health.

Adapters:

1. Stalwart:
   - SMTP submission for outbound mail.
   - Prefer JMAP or a documented supported mechanism for inbound/thread synchronization.
   - Use webhooks/events where supported and verified.
   - SnappyMail remains a human webmail client and must not be treated as the integration server.

2. Google Workspace/Gmail:
   - Gmail API with OAuth for mailbox read/thread sync and user-authorized sending where that is the correct client setup.
   - Google Workspace SMTP relay or supported SMTP for outbound-only cases.

3. Generic SMTP:
   - Outbound sending only unless a separate inbound adapter is configured.

4. Mock/test provider:
   - Captures messages locally without contacting the internet.

Correctly preserve `Message-ID`, `In-Reply-To`, and `References` headers. Store provider IDs, direction, sender/recipient addresses, timestamps, delivery state, thread association, sanitized text/HTML, attachments as controlled media references, and sync cursors. Make synchronization and send jobs idempotent, retryable, observable, and safe from duplicate sends.

Include bounce, complaint, suppression, unsubscribe, consent, retention, and deletion mechanisms. Keep transactional messages separate from marketing sequences. Do not launch bulk marketing behavior until authentication, consent rules, unsubscribe, suppression, rate limits, and deliverability monitoring have been explicitly tested.

## Runtime AI architecture

Create an internal provider interface that can support:

- Anthropic/Claude.
- OpenAI.
- Qwen through a supported API or OpenAI-compatible endpoint.
- Optional local OpenAI-compatible services such as Ollama/vLLM when configured.
- A deterministic mock/no-AI provider for tests.

All runtime calls must be server-side. Implement timeouts, retry policy, usage/budget limits, structured-output validation, prompt/version logging, redaction, tenant separation, permission checks, and failure fallbacks. Never expose provider keys to the browser.

Potential opt-in AI functions:

- Lead summary and suggested next action.
- Draft follow-up email.
- Lead classification with human review.
- Content brief/draft assistance grounded in Search Intelligence evidence.
- Schema or internal-link suggestions.
- Search-report narrative based only on supplied measurements.

Never send a lead email, publish content, change a lead stage, alter a deterministic score, or deploy a site solely because a model suggested it. Make AI processing opt-in per client and document what data leaves the deployment.

## WordPress migration

Build a dry-run, idempotent importer that can use WXR XML and/or the WordPress REST API. Support CSV/JSON mapping where plugins require it.

Import or preserve when present:

- Pages, posts, authors, publish/update dates, statuses, slugs, excerpts, categories, tags, and featured images.
- Media files, alt text, captions, source URLs, and attachment relationships.
- Internal links and reusable content.
- Rank Math or Yoast SEO titles, descriptions, canonicals, robots directives, social metadata, focus terms as planning data, breadcrumbs where applicable, and custom schema when valid.
- ACF data through declared mappings.
- Redirect history and known legacy routes.
- Elementor content by extracting semantic content and mapping approved sections when possible. Do not reproduce Elementor's generated wrapper markup as the new design system.

Generate a migration report containing imported, skipped, transformed, failed, duplicate, unmapped, and manual-review records. Re-running the same import must update or skip the same record, not create duplicates.

Before launch, crawl the existing WordPress site and save a baseline of:

- URL, status, redirect target, canonical, title, description, H1, indexability, structured-data types, main content checksum, word count, major internal links, image/alt presence, and sitemap membership.

Compare the staged Payload/Next.js output against that baseline. Any disappearing indexable URL, changed canonical, lost material content, lost high-value internal link, redirect chain, or accidental schema removal must be explicitly resolved or approved. Produce a final redirect map and parity report.

Do not remove the old WordPress site until the new deployment, redirects, DNS plan, backup, and rollback procedure have passed review.

## Security, privacy, and permissions

Implement least-privilege roles such as platform administrator, client administrator, editor, SEO/search analyst, sales user, and read-only viewer. Scope sensitive CRM/search/email actions separately from ordinary content editing.

At minimum:

- Server-side validation and output encoding.
- CSRF-safe state changes and secure session/cookie settings.
- Rate limiting for authentication, forms, AI calls, crawling, imports, and email.
- Cloudflare Turnstile on public forms when configured, verified server-side.
- File type, size, and content restrictions for uploads; safe generated filenames.
- Sanitization for rich text, imported HTML, and email HTML.
- Encryption or strong protection for stored OAuth tokens and provider secrets.
- Audit logs for sign-in, permissions, exports, content publish, redirects, CRM changes, AI actions, email sends, imports, and sensitive configuration.
- No public debugging or diagnostic routes.
- Dependency scanning and documented update cadence.
- Automated PostgreSQL and object-storage backups, retention, and tested restore instructions.
- Privacy-safe log retention and data export/deletion workflows.

Do not send contact data, private email bodies, unpublished content, credentials, or customer PII to an AI provider unless the client has opted in and the exact feature requires it. Redact unnecessary data.

## Testing and quality gates

Testing is part of the product. Build fixtures and run the suite continuously during implementation.

Required checks:

- Type checking, linting, production build, unit tests, and database migrations.
- Integration tests for Payload access control, hooks, jobs, forms, CRM matching, lead scoring, email adapter behavior, AI-disabled operation, imports, and Search Evidence calculations.
- Playwright tests in Chromium, Firefox, and WebKit for critical public and admin flows.
- Responsive checks at approximately 360, 390, 768, 1024, and 1440 CSS pixels.
- Accessibility checks plus manual keyboard/focus verification for critical flows.
- Visual-regression references for approved components and page recipes; compare with supplied Figma/Claude frames rather than relying only on screenshots generated by the implementation.
- Lighthouse or equivalent checks. Aim for 90+ in performance, accessibility, best practices, and SEO on representative production-like pages, but investigate evidence instead of gaming a score.
- Metadata, canonical, robots, sitemap, hreflang if used, JSON-LD validity, heading outline, broken links, image dimensions/alt, redirect chains, and HTTP status checks.
- Contact, chat intake, newsletter, confirmation, roadmap, calculator/scorecard, and error-state tests.
- Mock email testing for duplicate prevention, retry, unsubscribe, bounce/suppression, and threading headers.
- WordPress importer dry run, rerun/idempotency, media handling, URL parity, and SEO parity.
- Search importer fixtures, crawl limits, score-version reproducibility, null/missing evidence, and draft-vs-observed separation.
- SSRF, permission, upload, injection, rate-limit, secret-exposure, and log-redaction tests.
- A complete no-AI mode test.

A release is blocked by broken critical routes, accidental noindex, missing canonical on an indexable page, redirect loops, failed form persistence, cross-client data exposure, exposed credentials, broken auth/access controls, failed backup verification, importer data loss, or a critical accessibility failure. Advisory SEO/content opportunities should be reported without blocking a valid release.

Provide `/docs/qa-matrix.md`, `/docs/launch-checklist.md`, and machine-readable test reports where practical.

## Deployment and operations

Produce:

- Development and production Dockerfiles.
- A compose configuration suitable for local work and a documented Coolify deployment.
- Separate web and worker processes when job execution needs isolation.
- PostgreSQL configuration expectations.
- R2/S3 storage settings.
- Health and readiness endpoints that reveal no secrets.
- Cloudflare DNS/TLS/cache/WAF/Turnstile notes.
- Database migration procedure.
- Backup, restore, staging, launch, rollback, and incident notes.
- `.env.example` with every variable documented and no real value.

Use cache rules that do not cache personalized/admin/API responses. Purge or revalidate affected public routes after publish. Keep Payload admin, database, storage credentials, and job controls private.

The implementation may use private Git and automated deployments behind the scenes even if the business owner does not want to interact with Git. Provide a simple operator workflow that does not require daily command-line or Git knowledge.

## Repeatable client-site creation

Create a command such as:

```text
pnpm create-site
```

It should guide an operator through:

- Client/site name and domains.
- Design source: Figma, Claude design package, existing design contract, or starter.
- Brand assets and fonts.
- Chosen page recipes and route blueprint.
- WordPress migration source, if any.
- Email provider: Stalwart, Gmail/Workspace, generic SMTP, or mock.
- AI provider: Anthropic, OpenAI, Qwen-compatible, local compatible, or disabled.
- Storage, analytics, Search Intelligence, and CRM feature flags.

It should generate:

- A separate client application/config package.
- A validated design contract and token output.
- A site blueprint and CMS seed scaffolding.
- Client-specific `.env.example`.
- Docker/Coolify deployment template.
- Database and storage namespace instructions.
- Initial admin/setup instructions.
- Test and staging commands.
- A launch checklist.

The creation process must never copy Syed AI logos, company names, copy, analytics IDs, email addresses, schema identities, CRM records, secrets, or legal text into another client's site. Include automated scans for those accidental leftovers.

Version the reusable core. Document how a client app pins a version, receives an upgrade, runs migrations, executes visual/functional regression tests, and rolls back. Do not automatically push a core update across all clients without staged verification.

## Implementation milestones

Work in the following sequence. At the end of each milestone, show changed files, commands run, test results, remaining risks, and the next milestone. Keep the repository runnable.

### Milestone 0 — Discovery and baselines

- Extract and inventory both ZIPs.
- Run the original applications locally when feasible.
- Record routes, features, data flows, dependencies, security issues, and SEO baseline.
- Capture representative screenshots and characterization fixtures.
- Write the architecture decision record and detailed phased backlog.

### Milestone 1 — Stable Syed AI site factory foundation

- Set up the monorepo, Next.js, Payload, PostgreSQL, approved components, design contract, CMS models, forms, CRM foundation, mock email, no-AI mode, tests, and Docker deployment.
- Migrate the Syed AI public site and interactive tools while preserving its design and routes.
- Demonstrate one end-to-end lead from form submission to CRM timeline and queued mock email.

### Milestone 2 — WordPress and SEO parity

- Complete the importer, Rank Math/Yoast mapping, media handling, redirect generation, crawl baseline, staged crawl comparison, CMS SEO controls, structured data, and critical launch gates.
- Demonstrate an idempotent sample import and parity report.

### Milestone 3 — Search Evidence extraction

- Characterize the existing suite.
- Extract normalized types, scoring, imports, crawl analysis, recommendations, snapshots, and reports into modular packages.
- Store integrated data in PostgreSQL and expose safe Payload admin workflows.
- Preserve evidence classifications and versioned scoring.

### Milestone 4 — Optimization workflow

- Connect Search Intelligence to content records, briefs, drafts, assignments, approvals, recrawls, comparisons, and reports.
- Add provider-neutral AI assistance with AI disabled by default and human approval required.

### Milestone 5 — Email, intelligence, and replication hardening

- Finish Stalwart and Google adapters, inbound synchronization where supported, lead scoring, AI lead assistance, conversion attribution, client creation command, versioned upgrades, complete security tests, load checks, backups, restore drill, staging, and launch documentation.

Do not attempt all integrations at once before the first stable site exists. Preserve compatibility interfaces so later milestones do not require rewriting the core.

## Required documentation and deliverables

Deliver working code plus:

- `README.md` with a concise operator quick start.
- `/docs/input-inventory.md`.
- `/docs/architecture.md` with a diagram and boundaries.
- `/docs/assumptions.md`.
- `/docs/decision-log.md`.
- `/docs/versions.md`.
- `/docs/figma-contract.md`.
- `/docs/design-contract.md`.
- `/docs/component-registry.md`.
- `/docs/content-model.md`.
- `/docs/crm-email.md`.
- `/docs/ai-providers.md`.
- `/docs/search-intelligence.md`.
- `/docs/wordpress-migration.md`.
- `/docs/security-privacy.md`.
- `/docs/deployment-coolify-cloudflare.md`.
- `/docs/backup-restore.md`.
- `/docs/qa-matrix.md`.
- `/docs/launch-checklist.md`.
- `/docs/client-site-runbook.md`.
- `.env.example` files.
- Database migrations and sanitized seed/fixture data.
- A sample `design-contract.json` and `site-blueprint.json` for Syed AI.
- A machine-readable redirect map and WordPress parity report format.
- A full test suite and repeatable commands.

## Definition of done

The foundation is complete only when all of the following are demonstrated:

1. Syed AI is rendered from Next.js/Payload with its important routes, visual identity, content, tools, and forms preserved.
2. A non-developer editor can update page content, posts, metadata, schema-relevant facts, navigation, and reusable sections without editing code.
3. Public pages render crawlable content and metadata without runtime AI or client JavaScript.
4. A form submission safely creates a CRM contact/lead/activity and queues a test email without duplicates.
5. Runtime AI can be entirely disabled without breaking core workflows.
6. At least one AI adapter works in a sandbox configuration and all AI-generated material is labeled and reviewable.
7. At least one email adapter plus the mock provider passes end-to-end tests; production credentials are not present in source.
8. A sample WordPress export imports idempotently and produces an actionable SEO/URL parity report.
9. The Search Evidence Suite's key deterministic calculations are extracted, fixture-tested, stored in PostgreSQL, and visible through a usable Search Intelligence workflow.
10. Evidence remains separated into observed, reported, recorded, and generated classes, with null for unmeasured data and versioned scoring.
11. The staged site passes critical browser, accessibility, SEO, form, security, and migration gates.
12. Backup and restore are documented and successfully tested with non-production data.
13. `pnpm create-site` can generate a second isolated sample client using different branding without leaking Syed AI content, data, domains, or secrets.
14. An operator can deploy that sample to staging from documented steps and obtain a launch report.
15. All known limitations, recurring costs, provider dependencies, licenses, and manual operational responsibilities are documented plainly.

## Start now

Begin with Milestone 0. Do not start by redesigning the supplied sites from memory. Extract and inspect both archives, run and render the existing interfaces where possible, inventory every important behavior, identify what can be reused and what must be replaced, and create the baselines and decision log.

Then present:

1. The input inventory.
2. The current Syed AI route/feature map.
3. The current Search Evidence Suite capability/data map.
4. Proposed repository structure and architectural boundaries.
5. Security and migration risks ranked by severity.
6. The exact Milestone 1 implementation plan with acceptance tests.
7. Any genuinely blocking questions—no more than necessary.

After that review, proceed to implement Milestone 1 in small, testable commits or checkpoints while keeping a clear record of commands and results.
