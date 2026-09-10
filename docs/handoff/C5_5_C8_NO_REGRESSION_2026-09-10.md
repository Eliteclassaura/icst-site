# C8 external-acceptance and no-regression status, after C5.5

**Date:** 2026-09-10 · **C8 tag:** `c8` (`a1d0864`) · **C5.5 base:** the same commit · **Verified by:** the run in `C5_5_TEST_REPORT_2026-09-10.md`

C8's contracts are operational: how the app reports readiness, how it decides which forwarded address to believe, how it is containerised, and how a release reaches production. C5.5 is design tooling. The two should not touch, and this document is the evidence that they did not.

## 1. Files C8 owns — none modified by C5.5

| C8 artefact                                                              | Modified in C5.5? |
| ------------------------------------------------------------------------ | ----------------- |
| `apps/syed-ai/src/app/(site)/api/health/route.ts`                        | **no**            |
| `apps/syed-ai/src/app/(site)/api/live/route.ts`                          | **no**            |
| `apps/syed-ai/Dockerfile`, `Dockerfile.dev`, `.dockerignore`             | **no**            |
| `compose.yaml`                                                           | **no**            |
| `.github/workflows/deploy.yml`                                           | **no**            |
| `tools/scripts/backup.sh`                                                | **no**            |
| `packages/agency-core/src/intake/client-ip.ts` (R62 trusted-proxy model) | **no**            |
| `tools/parity/emit-deploy-event.mjs`, `emit-qa-report.mjs`               | **no**            |
| `apps/syed-ai/.env.example`                                              | **no**            |
| `docs/deployment-coolify-cloudflare.md`                                  | **no**            |

`.github/workflows/ci.yml` **was** modified — five steps added (skill trust, bundle determinism, neutral-bundle leak check, design render check + responsive QA, pack build). No existing step was changed or removed, and none of the added steps runs in the `docker` job or the `guards` job.

## 2. Behaviour re-verified

| C8 behaviour                                                    | How it was checked now                                                                | Result                                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Readiness backed by a real Postgres query and a storage check   | `GET /api/health` against the standalone build                                        | `{"status":"ok","checks":{"database":"ok","storage":"ok"}}` HTTP 200                                          |
| Liveness, dependency-free                                       | `health.spec.ts` (4 tests) in the full e2e run                                        | pass                                                                                                          |
| 200/503 semantics and the fixed key shape                       | unchanged code path; `health.spec.ts` asserts the shape                               | pass                                                                                                          |
| No host, path, version or driver text in a health body          | unchanged code path; asserted in CI's docker job                                      | unchanged                                                                                                     |
| Trusted-proxy model, fail-closed (`TRUSTED_PROXY`, R62)         | 28 `agency-core` unit tests + the five intake e2e specs under `TRUSTED_PROXY=xff`     | pass                                                                                                          |
| Docker / Compose / deployment documentation                     | files untouched                                                                       | unchanged                                                                                                     |
| Tag-only production deploy behind a GitHub Environment approval | `deploy.yml` untouched                                                                | unchanged                                                                                                     |
| Backups                                                         | `backup.sh` untouched; restore drill still never run (Release 7)                      | unchanged                                                                                                     |
| Designer environment (the Compose stack)                        | untouched; C5.5's tooling runs on the host and in that stack alike                    | unchanged                                                                                                     |
| Residue / security gates                                        | `pnpm gates:scan` over the whole repository                                           | ✔ clean                                                                                                       |
| Contracts                                                       | `qa-report` and `deploy-event` emitted and validated against `@factory/seo-contracts` | ✔ both valid                                                                                                  |
| Parity                                                          | `pnpm parity:check` over five routes                                                  | **0 blocking, 1 advisory** — the same pre-existing `/` word-count advisory, unchanged in value (7251 vs 5191) |

The parity result deserves a sentence of its own, because C5.5 changed six fixtures. It did not move parity, because the seeded chrome is now produced by injecting the client's identity into those fixtures through `applyBrand()`, and a unit test asserts the injected values reproduce the previous literals byte for byte. That test is the mechanism keeping this row green in future.

## 3. External acceptance still pending — unchanged

C8 was reported as _implemented and tagged, with first-push Docker CI acceptance pending owner verification_. That is still exactly true. C5.5 did not and could not change it:

| Pending item                                                                                                   | Owner                             | Status                                                    |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------- |
| `docker build`, image-content assertions, readiness-against-a-container, Compose smoke test                    | CI `docker` job on the first push | **still pending** — no Docker daemon in the cloud sandbox |
| History rewrite + `verify-history-clean`, then the first GitHub push                                           | owner, on the Mac                 | **still pending**                                         |
| Legacy-exposure runbook (R1) on the live host                                                                  | owner                             | **still pending**                                         |
| GitHub Environment secrets and variables (`COOLIFY_WEBHOOK`, `COOLIFY_TOKEN`, `STAGING_URL`, `PRODUCTION_URL`) | owner                             | **still pending**                                         |
| `TRUSTED_PROXY=cloudflare` on Cloudflare-fronted deployments                                                   | owner                             | **still pending**                                         |

None of these was performed, simulated or claimed in this checkpoint.

## 4. One operational note for whoever runs the suite next

A local `.next/standalone` server started without copying `.next/static` into it serves **no CSS**, and the resulting design-QA report reads as "every block overflows at every viewport". That is the harness, not the site. Check that the page's stylesheet returns 200 before believing a layout failure. CI's e2e step already does the copy correctly (`ci.yml`); this only bites a local run, and it cost part of an afternoon here.
