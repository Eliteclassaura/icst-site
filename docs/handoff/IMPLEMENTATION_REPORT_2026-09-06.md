# Implementation report — 2026-09-05/06 (C5.5 spike → C6 → C6.5 foundations)

Repository `agency-site-factory`, HEAD `63aabae` (tag `c6.5-prep` at `698db5b`). 25 commits in history (incl. this report); first push pending the owner's history rewrite (`docs/runbooks/first-push.md`).

## Commits (this work)

| Commit    | What                                                                                                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `884ec7a` | CI `guards` job (content-model path guard by label; baseline/ledger coupling); PR template; runbook check names; ledger security rows                                                                 |
| `aa9cc77` | C5.5 spike: static registry render incl. Lexical proven; fonts inlined for sandboxed artboards; eight cards published as a design canvas; sync needs `/design-login` on the Mac                       |
| `8ebf381` | **fix(gates):** root `gates:scan` had scanned only the quality-gates package (wrong root) — now the whole repo; CI bundle-scan path fixed; vendored pack hosts redacted                               |
| `dc87ba2` | **C6** (tag `c6`): brief form → contact → lead → activity → `notifyOwner` + `crmSync`; anti-abuse layers; Postgres limiter + dedupe; lead score; CrmProvider mock; masked `/thanks/`                  |
| `cae4bce` | `packages/seo-contracts`: five zod contracts, envelope rules, no-email-string rule, `effectiveAction`, CLI, JSON Schema emitter, fixtures, import isolation                                           |
| `b500d15` | **C6.5 foundations**: blueprint v2 validated in seed/CI; redirects `proposed\|active` seeded and served from a cached map; `pages.migration` + `automation`; `seo.lock`; verification at publish; e2e |
| `59d7d1d` | `qa-report` + `deploy-event` emitters (CI step); `tools/wordpress-import` boundary primitives + pipeline types; `docs/wordpress-importer.md`; release-plan status                                     |
| `bd2d8b2` | chore: prettier-ignore generated `next-env.d.ts`                                                                                                                                                      |
| `698db5b` | test: threat-model forms fixture order-independent                                                                                                                                                    |

## Tests run

| Suite                                                                                       | Result                                                                                           |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm check` (typecheck, lint, unit, build, residue scan, versions)                         | green                                                                                            |
| `@factory/syed-ai` vitest (integration against a migrated Postgres)                         | **105 passed** (84 threat-model + 15 intake + 6 foundations)                                     |
| `@factory/agency-core` vitest                                                               | 24 passed (15 blocks + 9 intake rules)                                                           |
| `@factory/seo-contracts` vitest                                                             | 12 passed (4 golden, 5 negative, 3 rules)                                                        |
| `@factory/design-contract` vitest                                                           | 17 passed                                                                                        |
| `@factory/quality-gates` vitest                                                             | 10 passed, 1 skipped (pristine-archive check, by design)                                         |
| `@factory/wordpress-import` vitest                                                          | 4 passed                                                                                         |
| Playwright e2e (chromium-1440, chromium-360, admin) against the standalone production build | **121 passed** (smoke, blocks, parity spec, design system, intake ×2 widths, redirects)          |
| Parity gate (`pnpm parity:check`)                                                           | PARITY OK — 0 blocking, 1 advisory (home word count, known: hidden legacy views) across 5 routes |
| Residue scan (`pnpm gates:scan`, whole repo)                                                | clean                                                                                            |
| Contract validation of emitted artefacts                                                    | `handoff/qa/*.json` valid; `deploy-event` valid                                                  |

Failed: none at HEAD. Fixed on the way: intake tests colliding on rate limits (per-test client addresses), threat-model/intake fixture order (find-or-create), e2e burst test colliding across runs (per-run address block), `next-env.d.ts` formatting churn.

## Spike results (C5.5)

Static render outside Next works, Lexical included; fonts must be inlined for sandboxed artboards (~186 KiB/card, under the cap); the client-facing Artifact canvas path is proven; **design-system project sync cannot run from a cloud session** — it needs `/design-login` in Claude Code on the owner's Mac. Recorded in ADR-026 spike results.

## Outstanding risks

- **R42 — no remote yet.** History still contains the redacted literals until the owner runs the rewrite; nothing is pushed before `verify-history-clean` passes. Highest-priority owner action.
- **Redirect map trusts `x-forwarded-for` when `cf-connecting-ip` is absent** (same for the intake limiter). Deployment must put the app behind a proxy that overwrites XFF; documented for C8.
- **`VERIFICATION_ENFORCEMENT=warn` on staging** means unverified copy can be published there by design; the C9 launch gate must refuse production-launch mode unless `enforce`.
- **Lane B not built** — OGCS has no write path yet (C6.5 proper).
- **Hero at 390** showed media overlapping the heading in the static spike render; verify in the real site and add a 390 baseline (C9).
- **R56** — the Payload-level rate limit was dead config; the intake route now has a real Postgres-backed limiter, but `/api/*` per-service-account limiting arrives with C6.5.
- **Legacy exposure (R1)** and the **H2O freeze run** remain owner actions.

## Next Factory milestone

**C7 — no-AI mode and AI provider skeleton**, then **C8 — containers and deployment** (Compose stack, PR previews, tag-only production, designer environment), then the **C5.5 remainder** (design bundle, packs, skills), then **C6.5 proper** (service accounts, automation hooks, Automation review view, proxy limiter, `no-public-email` gate, `privacyContactAlias`), then **C9**. H2O work resumes only when its inputs are supplied.
