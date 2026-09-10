# Component registry

The registry is the only way a component reaches a page (ADR-008). Editors place **layout blocks** in `pages.layout`; **chrome blocks** (header, footer) render from globals. There is no free-form HTML block and there never will be.

Source: `packages/agency-core/src/blocks/`. Preview: `/dev/blocks/` (requires `DEV_ROUTES=1`). Tests: `packages/agency-core/test/blocks.test.ts` (unit), `apps/syed-ai/e2e/blocks.spec.ts` (axe at every viewport, no-JS parity, keyboard, reduced motion).

## Anatomy of a block

| File                | Purpose                                                                                                                                         | May import                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `<slug>/index.tsx`  | Server component + `defineBlock({ slug, label, kind, Component, fixtures, a11y, interactive })`                                                 | React, primitives, its own CSS |
| `<slug>/<slug>.css` | Styles, `blk-<slug>__*` classes, **tokens only** (`var(--color-*)`, `var(--s-*)`, `var(--fs-*)`), **logical properties only** (stylelint, R36)  | —                              |
| `<slug>/fixture.ts` | Named prop sets; `default` required; real copy from the pilot, never lorem; generated placeholder imagery (rights gate, R34)                    | fixtures helpers only, no CSS  |
| `payload.ts`        | Every block's Payload config in one CSS-free file, loaded by `payload.config.ts`; field names mirror props                                      | `payload` types only           |
| `render.tsx`        | `RenderBlocks(layout, ctx)` maps CMS rows → components; full-bleed blocks (`hero`, `cta`) own their geometry, all others get a band + container | components                     |
| `chrome.ts`         | `headerProps`, `footerProps`, `formSelects` — globals → chrome props, testable without Payload                                                  | —                              |
| `manifest.ts`       | CSS-free list `{ slug, kind, interactive, fixtures[] }` for test runners                                                                        | fixtures                       |

Why namespaced stylesheets instead of hashed CSS Modules (ADR-024): block class names must be **stable** — the no-JS parity diff, Playwright screenshot masks, the residue scan and client CSS overrides all key on them. `blk-<slug>__element` is CSS-Modules discipline without hashing; the lint rules make the discipline mechanical.

## Release 1 set (C4)

| Block          | Kind   | Interactive | Renders                                                                                                           | A11y contract (summary)                                                                                              |
| -------------- | ------ | ----------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `header`       | chrome | no          | wordmark (+ optional monogram path from brand settings), primary nav from `header` global, CTA                    | one `<nav aria-label="Primary">`, real links, `aria-current="page"`; horizontal scroll on narrow screens, no JS menu |
| `footer`       | chrome | no          | link columns, offices (from `contact-legal` → `offices`), © year computed at render                               | `<nav aria-label="Footer">`, headings as `<p>`, offices as a list                                                    |
| `hero`         | layout | no          | media/scrim or plain; status line; h1 by default (`as: h2` when the page has one); CTA pair                       | real alt on the photo; scrim presentational; dot animation stops under reduced motion                                |
| `richText`     | layout | no          | Lexical document via the restricted editor; `prose` / `wide` / `full` measure                                     | heading levels from the editor (h2–h4 only)                                                                          |
| `takeawayList` | layout | no          | labelled list of lead + text                                                                                      | real `<ul>`; marker is CSS                                                                                           |
| `evidenceGrid` | layout | no          | figure + claim (h3) + detail + **required** publisher/title/href/date                                             | static figure in the DOM (counter animation is Release 2 and progressive)                                            |
| `faq`          | layout | no          | visible Q (h3) / A pairs with stable anchors (derived from the question unless set)                               | no accordion; nothing hidden; anchors shared with FAQPage JSON-LD (C5)                                               |
| `glossaryList` | layout | no          | `<dl>` with data-supplied anchors (`#geo`, `#aeo`, …)                                                             | definition-list semantics; the 12 legacy anchors are a C5 parity gate                                                |
| `cta`          | layout | no          | eyebrow, title, text, CTA pair, decorative background image                                                       | image `alt=""`; text-on-surface contrast from the compile report                                                     |
| `briefForm`    | layout | **yes**     | native `<form method="post">` mirroring legacy field names; selects from `form-config`; honeypot; Turnstile mount | labels bound by id; works without JS; honeypot out of tab order; secret never on the client                          |

| `dataTable` | layout | no | caption, row/column headers, `plain`/`compare`/`price` variants; OfferCatalog carried in `schemaExtra` | real table semantics; focusable named scroll region; empty corner header gets visually-hidden text |
| `steps` | layout | no | ordered (method, HowTo JSON-LD) or unordered (warnings); split/stack layouts | `<ol>`/`<ul>` by meaning; visible numbers aria-hidden |
| `relatedLinks` | layout | no | labelled cross-page links (the protected internal-link graph) | `<nav>` + list; link text is the destination title |
| `breadcrumb` | layout | no | trail + current page; BreadcrumbList JSON-LD from the same data | `<nav aria-label=Breadcrumb>`, `<ol>`, current is text with aria-current |
| `subNav` | layout | no | the legacy reference-pages bar; full-bleed | second labelled nav; horizontal scroll, aria-current |
| `offices` | layout | no | in-page offices list from the Offices collection (same data as the footer) | list semantics; hours are text |

Counts in titles, ledes and captions use `{{count}}` and are substituted at render (`shared/count.ts`).

Release 2 adds the interactive and remaining parity blocks (Announcement, Tiers, TeamCards, NewsletterSignup, Author, RelatedLinks, Citations, UpdateHistory, InlineFigure, AnswerSimulator, Scorecard, RevenueModel, VenturesAccordion, CaseCards/CaseDetail, CommandPalette, ChatIntake) and `blocks/effects/` (ADR-021).

## Rules every block obeys

1. **Tokens only.** No hex, rgb, hsl or oklch literal in a block (ESLint `factory/no-hex-in-components`, stylelint `color-no-hex` + disallowed list). Scrims use `color-mix()` on `--color-canvas`.
2. **Logical properties only** (`padding-inline`, `inset-block-start`, `inline-size`; stylelint `csstools/use-logical`). RTL is a `dir` switch.
3. **Full content on the server.** Interactive blocks enhance; with JavaScript disabled the text is identical (e2e diff).
4. **Counts and labels come from data.** No "17 questions" typed anywhere; the footer year is computed (unit test greps fixtures for typed counts).
5. **Sources are required** where a figure is shown (Payload config, not convention).
6. **Fixture imagery is generated**; a client photograph enters only through `media` with `rights` set.
7. **One h1 per page.** Hero owns it by default; `CmsPage` adds the page title as h1 only when no hero leads.

## Adding a block

Create the four files, add the config to `layoutBlocks` in `payload.ts`, a `case` in `render.tsx`, an entry in `manifest.ts` and `fixtures/index.ts`, then `pnpm --filter @factory/syed-ai generate:types && migrate:create <name>`. The unit test fails until manifest and CMS agree; the e2e loop picks the new fixtures up automatically.
