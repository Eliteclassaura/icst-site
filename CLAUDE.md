# Agency Site Factory — instructions for Claude sessions working in this repository

This file is read by every Claude session (owner's or a designer's). It states what the repository is, how a change reaches the live site, and what a session must refuse. The long form is in `docs/`; the decisions are in `docs/decision-log.md` (ADR-001 … ADR-031).

## What this is

A private platform that turns a design contract and a content blueprint into a Payload-managed, Next.js-rendered, SEO-first client website, with a small CRM, provider-neutral email and optional AI. `apps/syed-ai` is the pilot; its legacy URLs, content, SEO and design are preserved (parity gate). One deployment and one database per client. Runtime AI is off by default.

## Non-negotiables

- **No secret, PII or client hostname enters the repository, logs, client JavaScript or AI context.** Secrets come from the environment only. The residue scanner (`pnpm gates:scan`) enforces this and runs in CI. Never write the legacy admin key or the legacy client allowlist anywhere; the scanner recognises them by hash.
- **`legacy-reference/` is read-only and is never imported by code.** It is a redacted copy (see its NOTICE).
- **The registry is the only renderer.** No raw HTML, no inline scripts, no page-level CSS outside `packages/agency-core/src/blocks/**` and the design-system primitives. Tokens come from `design-contract.json` through the compiler, never as literals in block CSS.
- **Content lives in the CMS.** Copy is edited in Payload, never in fixtures or components. Fixtures are brand-neutral generic copy.
- **Humans approve publishing.** A session commits, opens pull requests, publishes design packs and design systems. **A session never deploys**, never touches production data, never holds a deploy credential — the owner's session included.
- **Never silently change a ranking URL.** Redirects are declared in the blueprint and reviewed; automation may only _propose_ redirects.
- **No email address on any public surface** (ADR-028): not in pages, blocks, JSON-LD, `llms.txt`, the sitemap, or public REST. Contact goes through forms. The one exception is the alias mailbox on the `privacy` page (`contact-legal.privacyContactAlias`), never a person's or an admin's. Never write an admin's, a client's or a visitor's email into content, fixtures, docs, artefacts or logs.
- **Never assume a source site is monolingual** (ADR-029): the Factory renders no hreflang or locales yet, and the WordPress importer must detect language/region variants and fail loudly rather than flatten them. Multilingual support is proven by H2O in isolation and reconciled into the Factory at Release 4 — do not implement it before C7/C8.
- **Machines write drafts, humans publish.** The `automation` service account (OGCS) can only create drafts on `pages`, `posts`, `media`; publishing, verifying, deleting and structural changes are human actions (bulk approval in the Automation review view).

## How a change reaches the live site (ADR-027)

1. Branch from `main` (`design/<topic>`, `feat/<topic>`, `fix/<topic>`). Never commit to `main`.
2. Make the change. For design: edit `apps/<client>/design/design-contract.json` (tokens) or a block under `packages/agency-core/src/blocks/<block>/` (CSS/JSX; keep the fixture and a11y notes current).
3. Run the gates: `pnpm check` (lint, typecheck, unit), `pnpm lint:css`, `pnpm gates:scan`, `pnpm parity:check` when the site is running, `pnpm preview:pack --site <client>` for a design change.
4. Open a PR with `gh pr create`. Attach the pack screenshots. Explain the change in one paragraph a non-developer can read.
5. CI reruns every gate and deploys a **preview URL** for the PR. Fix anything red.
6. Approval: the owner, or the gates alone when the owner works alone (branch protection decides — not you).
7. Merge to `main` deploys **staging**. **Production deploys only from a tagged release**, created by the owner outside any session.

Commit trailers: `Co-Authored-By: Claude <model> <noreply@anthropic.com>` and the session link.

## Refuse, and say why

- Adding an external font `<link>` or `@import` — the CSP is `font-src 'self'`; fonts enter through the contract's font pipeline with a `license` field (`packages/design-contract/src/fonts.ts`).
- Raw HTML, inline `<script>`, or third-party embeds — nonce CSP; use or propose a registry block.
- Changing `migrations/**` or `**/payload.ts` in a design PR — content-model changes need the owner's `content-model` label and a separate review.
- Copy changes in code — route them to the editor (Payload) and note it in the PR.
- Committing `.env*` (other than `.env.example`), credentials, client hostnames, or anything from `legacy-reference/` into packages, fixtures, docs or generated output.
- Editing generated files by hand (`src/design/generated/**`, `payload-types.ts`, `ds-bundle/**`) — regenerate them.
- Deploying, running database commands against staging or production, or "quick fixes" on a live host.
- Reading or requesting production PII (subscriber exports, lead data) — fixtures exist for every pipeline.

## Design work in particular (ADR-026, ADR-027, ADR-030)

- `pnpm design:bundle --site <client> [--check]` renders the client's design system deterministically; `--check` builds twice and compares every byte. `pnpm design:gates --site <client>` runs the residue and cross-client scan plus the render check's verdict. The `design-sync` skill publishes to the client's Claude Design project (manifest handshake, pull-before-push).
- **Fixtures are brand-neutral.** Identity is `{{brand.*}}` and `{ $brandList: … }`, resolved by `applyBrand()` from the blueprint plus `apps/<client>/design/fixture-brand.json`. Never write a client's name, person, social link, office or hero alt into a fixture.
- **A card is faithful only at the viewport it declares.** A static file cannot make a media query resolve against another width; open a 390 card at 390.
- `pnpm preview:pack --site <client> --pages …` renders page previews, artboards and a PDF from a **running** site; the `design-pack` skill publishes the pack page for client comments. Approval is the client comment `APPROVED`, recorded in `docs/content-verification-ledger.md`.
- `pnpm design:pull --site <client> --export <zip|dir>` produces the three-way change report: tokens (import through the contrast gate), components (implement as code), copy (route to the editor). Never extract an export by hand — the archive limits and the path policy are the point.
- **Never claim a sync you did not perform.** `pnpm design:sync-status --site <client>` computes the truth; from a cloud session it is `unavailable-in-this-session`, and the honest sentence is "nothing has been pushed".
- `pnpm design:signature` measures whether a client's design system is distinct from every other's. Blocking for a new client.
- **A skill executes nothing.** First-party skills are Markdown + `policy.json`, hash-pinned; `pnpm skills:verify` (part of `pnpm check`) refuses a script, an execute bit, an undeclared command or an external URL.
- Visual-regression baselines change only with a ledger row in the same PR; `pnpm baselines:accept --reason "…"`, which writes that row for you, lands in C9.

## Where things are

`docs/architecture.md` (boundaries), `docs/release-plan.md` (checkpoints and acceptance tests), `docs/design-packs.md` (design workflow), `docs/component-registry.md` (blocks), `docs/design-contract.md` (tokens), `docs/designer-onboarding.md` (accounts and the ten-minute loop), `docs/runbooks/` (operational procedures), `docs/backlog.md` (what is planned), `docs/assumptions.md`, `docs/risks.md`.
