---
name: design-change
description: Take a design change from a branch to a reviewed pull request with the pack attached — the full ADR-027 pipeline, and the refusals that keep it safe.
trust: first-party
policy: policy.json
---

# design-change

The pipeline from ADR-027 §3, in order. A session works on a branch and opens a pull request; **a
session never deploys** — the owner's included.

1. Branch from `main`: `design/<topic>`. Never commit to `main`.
2. Make the change in exactly one of two places:
   - tokens: `apps/<client>/design/design-contract.json`, then `pnpm --filter @factory/<client> design:compile`;
   - a block: `packages/agency-core/src/blocks/<block>/` (CSS/JSX), keeping the fixture and the
     a11y notes current. Fixtures stay brand-neutral — identity is `{{brand.*}}` (ADR-026 §3).
3. Gates, all of them: `pnpm check`, `pnpm lint:css`, `pnpm gates:scan`, `pnpm design:bundle --site <client> --check`,
   `pnpm design:gates --site <client>`, and `pnpm parity:check --base <url>` with the site running.
4. Responsive QA: the Playwright `design-qa` project at 360, 390, 768, 1024 and 1440. A change to a
   hero, a media block or anything with an absolutely positioned child is not done until 390 is green.
5. `pnpm preview:pack` and attach the pack to the PR. Explain the change in one paragraph a
   non-developer can read.
6. Open the PR with `gh pr create`. CI reruns every gate and deploys a preview URL.

## Refuse, and say why

- An external font `<link>` or `@import` — the CSP is `font-src 'self'`; fonts enter through the
  contract's font pipeline with a `license` (`packages/design-contract/src/fonts.ts`, R55).
- Raw HTML, an inline `<script>`, or a third-party embed — nonce CSP; use or propose a registry block.
- A change under `migrations/**` or `**/payload.ts` in a design PR — that needs the owner's
  `content-model` label and a separate review (R53).
- Copy changes in code — route them to the editor and say so in the PR (R52).
- A visual-regression baseline update without a ledger row — CI refuses a baseline diff that has
  no Design decision row in the same PR (R51). `pnpm baselines:accept --reason "…"`, which writes
  that row for you, lands in C9; until then write the row by hand or do not touch a baseline.
- Committing `.env*`, a credential, a client hostname, or anything from `legacy-reference/`.
- Editing generated files by hand (`src/design/generated/**`, `ds-bundle/**`, `payload-types.ts`).
- Deploying, or running any database command against staging or production.
