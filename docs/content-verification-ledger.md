# Content verification ledger

Per ADR-016. Every business fact that reaches an indexable page or JSON-LD must be verified by the content owner before **production** launch (staging is not gated). This ledger was seeded from the legacy source on 2026-09-03; the values below are what the site says today, not what has been confirmed. Statuses: `unverified` · `verified` · `needs-change` · `removed`.

Content authority: **Syed Abdul** (confirmed 2026-09-03). Verification happens in Payload via the `verification` group; this ledger is the seed list.

## Commercial facts

| Fact                        | Current value                                                   | Source                                               | Owner | Status                                              | Verified |
| --------------------------- | --------------------------------------------------------------- | ---------------------------------------------------- | ----- | --------------------------------------------------- | -------- |
| Visibility Audit price      | $4,500, fixed scope                                             | `index.html` JSON-LD Offer; `geo-pricing/index.html` |       | unverified                                          |          |
| Answer Engine Program price | $9,800 / month                                                  | same                                                 |       | unverified                                          |          |
| Owned Channel Build price   | $6,400 / month                                                  | same                                                 |       | unverified                                          |          |
| Revenue-model default fees  | geo 9,800 · seo 6,000 · email 6,400 · all 14,200                | `site.js` `FEES` 575                                 |       | unverified                                          |          |
| Revenue-model multipliers   | geo 1.55/1.22 · seo 1.85/1.05 · email 1.00/1.75 · all 1.70/1.55 | `site.js` `PROG` 569–574                             |       | unverified                                          |          |
| Availability line           | "Two engagement slots open"                                     | `index.html` hero status                             |       | unverified (legacy README calls this a placeholder) |          |
| Engagement boundaries copy  | services view "boundaries" section                              | `index.html`                                         |       | unverified                                          |          |

## Identity and locations (JSON-LD `@id`s must stay stable)

| Fact                     | Current value                                                                                                  | Source                    | Owner | Status     | Verified |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------- | ----- | ---------- | -------- |
| Person                   | Syed Abdul, "Generative Engine Optimization Consultant", `sameAs` LinkedIn `/in/syed`, Instagram `syeddigital` | `#person`                 |       | unverified |          |
| Organization             | syed.ai, ProfessionalService, areaServed US / UAE / PK / Worldwide                                             | `#service`                |       | unverified |          |
| Office — Celebration, FL | Mo–Fr 09:00–18:00, geo 28.3255 / −81.5342, no street address, no telephone                                     | `#office-celebration`     |       | unverified |          |
| Office — Abu Dhabi       | Su–Th 09:00–18:00, geo 24.4539 / 54.3773                                                                       | `#office-abudhabi`        |       | unverified |          |
| Office — Lahore          | Mo–Fr 10:00–19:00, geo 31.5204 / 74.3587                                                                       | `#office-lahore`          |       | unverified |          |
| Team size                | "Nine people across three time zones"                                                                          | `index.html` team section |       | unverified |          |
| Twitter handle           | `twitter:site @syeddigital` (same handle as Instagram)                                                         | all pages                 |       | unverified |          |
| Logo / image             | `logo.png` 640×192; Person image = `og.jpg`; author portrait reuses `hero-760.jpg`                             | JSON-LD, `#author`        |       | unverified |          |

## Audience and reach claims

| Fact                         | Current value                                                                                                                                       | Source                    | Owner | Status                          | Verified |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----- | ------------------------------- | -------- |
| Followers                    | 51.7K                                                                                                                                               | `data-count` stats row    |       | unverified (README placeholder) |          |
| Monthly reach                | 1M+                                                                                                                                                 | stats row                 |       | unverified (README placeholder) |          |
| Prompts tracked daily        | 1,840                                                                                                                                               | stats row                 |       | unverified (README placeholder) |          |
| Newsletter subscribers       | 11,400                                                                                                                                              | `#newsletter` copy        |       | unverified (README placeholder) |          |
| Newsletter issues referenced | Issue 61 "The 43% problem", Issue 62 "Your CDN is blocking the crawlers" — `BlogPosting` nodes with no URL                                          | `#blog`                   |       | unverified — pages do not exist |          |
| Systems shipped              | "14 shipped" (Custom AI Systems)                                                                                                                    | `site.js` `VENTS`         |       | unverified                      |          |
| Product statuses / progress  | Revenue CRM beta 74 % · Citegeist beta 68 % · Answerable open beta 82 % · Cadence wip 41 % · Owned Stack live $0 · AI-Native Website live 6–9 weeks | `site.js` `VENTS` 153–212 |       | unverified (README placeholder) |          |

## Evidence statistics (cited third-party figures)

| Figure                                                                                              | Attributed to      | Source                                       | Owner | Status                                     | Verified |
| --------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------- | ----- | ------------------------------------------ | -------- |
| ~90 % of ChatGPT citations go to pages ranking 21+                                                  | Ahrefs             | `index.html` evidence grid; meta description |       | unverified — confirm citation URL and date |          |
| AI search visitors convert ≈4.4× organic                                                            | Semrush            | evidence grid; ROI assumptions note          |       | unverified                                 |          |
| −34.5 % CTR when AI Overview present                                                                | (cite-src)         | evidence grid                                |       | unverified                                 |          |
| 45:1 (ratio stat)                                                                                   | (cite-src)         | evidence grid                                |       | unverified                                 |          |
| 43 % cited-but-not-recommended across 9,886 answers                                                 | Ahrefs             | `cited-not-recommended/`; evidence grid      |       | unverified                                 |          |
| 94 %, 33 %, 66.4 %                                                                                  | (cite-src)         | evidence grid                                |       | unverified                                 |          |
| AI Overview prevalence 6.49 / 24.61 / 15.69 % (Jan/Jul/Nov 2025); informational share 91.3 → 57.1 % | inline SVG figures | `index.html` 187–221                         |       | unverified                                 |          |
| Litmus figure                                                                                       | Litmus             | evidence grid                                |       | unverified                                 |          |

## Modelled content (must be labelled, not verified as outcomes)

| Item                                                                                       | Note                                                                                                                                                          | Source                    | Owner | Status     |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----- | ---------- |
| Six case studies (`skincare`, `hrtech`, `medspa`, `marketplace`, `coldemail`, `lifecycle`) | Legacy copy labels them "modelled scenarios"; every figure, timeline and "calibrated against" source needs the label preserved in CMS and the sources checked | `site.js` `CASES` 243–369 |       | unverified |
| Answer simulator before/after                                                              | Illustrative; sources `[n]` are hostnames                                                                                                                     | `site.js` `PROMPTS`       |       | unverified |
| Scorecard weights and bands                                                                | Editorial model, not measurement                                                                                                                              | `site.js` `QUIZ`/`BANDS`  |       | unverified |

## Design decisions requiring owner sign-off (ADR-020, R37; tiers and threads per ADR-026)

| Decision             | Change                                                                                                      | Reason                                                                                                                                                                                                                                                 | Status                                               | Tier     | Version                | Thread |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | -------- | ---------------------- | ------ |
| `controlBorder` role | Form-input borders change from `--c-line` (#443C2E, dark hairline) to `--c-gold-dark` (#8A6A30, quiet gold) | Legacy pair fails WCAG 1.4.11 non-text contrast (1.67:1 < 3:1); new pair is 3.62:1 on the input surface. Quiet gold is already the palette's "quiet accent" (DESIGN-TOKENS.md); the only other 3:1 candidates are text colours, too loud for a border. | **verified 2026-09-04** (owner delegated the choice) | `system` | C2 contract (`c5` tag) | —      |
| `warning` colour     | Accent gold reused (no legacy warning colour)                                                               | No equivalent existed                                                                                                                                                                                                                                  | unverified                                           | `system` | C2 contract (`c5` tag) | —      |

Tiers: `system` (tokens + component library), `page` (composition per page type), `staging` (real page before launch). `Version` is the contract hash + git tag or the Artifact label; `Thread` is the comment thread carrying the client's `APPROVED` (see `docs/design-packs.md`).

## Image rights (R34)

| Image                                               | Source / licence                                                                             | Status           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------- |
| `hero-*.jpg/webp` (portrait, 1600×900)              | **owned** — owner's photographs, edited by the owner's designer (owner statement 2026-09-04) | verified         |
| `desk-*.jpg/webp` (900×1129)                        | **owned** — as above                                                                         | verified         |
| `cta-*.jpg/webp`                                    | **owned** — as above; duplicate crop noted                                                   | verified         |
| OG images ×10                                       | generated from `og-src.svg` — owner-made                                                     | unverified       |
| Planned images in `IMAGE-PROMPTS.md` (AI-generated) | AI-generated; confirm disclosure/usage policy                                                | not yet produced |

## Copy inconsistencies to resolve (found in discovery)

| Where                                          | Says                                                               | Actual                    |
| ---------------------------------------------- | ------------------------------------------------------------------ | ------------------------- |
| `404.html:65`, `geo-pricing/index.html:171`    | scorecard has "Twelve questions"                                   | six                       |
| `index.html:725`                               | "Six builds"                                                       | seven                     |
| `404.html:39`                                  | "Everything on syed.ai lives on one page"                          | four sub-pages exist      |
| `_private/docs/README.md:434–435`              | 13-question FAQ, 10-term glossary                                  | 17 and 12                 |
| `site.js` `VENTS`/`chat.js` vs form `<select>` | budget/revenue/timeline option labels differ between chat and form | normalise in `FormConfig` |

## Owner decisions recorded 2026-09-04

| Decision                | Value                                                           | Source        |
| ----------------------- | --------------------------------------------------------------- | ------------- |
| A4 indexable URLs       | real `/work/<id>/`, `/building/<slug>/`                         | owner message |
| Image rights            | owned; photographs by the owner, edited by the owner's designer | owner message |
| Outbound sending domain | `buyingblogposts.com`, separate registration                    | owner message |

## Security actions (owner, dated)

| Action (see `docs/runbooks/legacy-exposure.md`)                                  | Date       | Result                                         |
| -------------------------------------------------------------------------------- | ---------- | ---------------------------------------------- |
| `diagnose.php` / `subscribers.php` removed or denied on live host                | —          | pending                                        |
| Access logs inspected for foreign hits on both scripts                           | —          | pending                                        |
| Google app password rotated                                                      | —          | pending                                        |
| Repository sanitised (legacy key + client allowlist redacted; scanner on hashes) | 2026-09-05 | done (`d38f664`)                               |
| History rewritten so the literals never existed; `verify-history-clean` green    | —          | pending (owner, `docs/runbooks/first-push.md`) |
| First push to `github.com/Eliteclassaura/agency-site-factory`; `main` protected  | —          | pending                                        |
| Subscriber list exported once over SFTP (if needed)                              | —          | pending                                        |
