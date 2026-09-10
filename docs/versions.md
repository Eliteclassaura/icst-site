# Versions

Pinned from the C0 compatibility spike (`spike/c0-spike`, 2026-09-03). These are the versions the Release 1 workspace adopts. Exact pins live in the lockfile; this table is the human record. Change a pin only with a decision-log entry.

## Runtime and toolchain

| Component  | Version       | Note                                                                                                                                   |
| ---------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js    | 22.22.2 (LTS) | Container base `node:22-bookworm-slim`. Next 16 requires ≥ 20.9.                                                                       |
| pnpm       | 10.28.0       | Via corepack. `onlyBuiltDependencies` allow-list for `sharp`, `esbuild` in `.npmrc`.                                                   |
| PostgreSQL | 16.13         | Compose image `postgres:16-alpine`.                                                                                                    |
| TypeScript | **5.9.3**     | TypeScript 7.0.2 (Go-based compiler) is current on npm but untested with Payload's type generation; evaluate in Release 3, not before. |

## Application

| Package                          | Version | Note                                                                                                                                       |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| next                             | 16.3.4  | App Router; `output: 'standalone'`; `proxy.ts` (Next 16's name for middleware).                                                            |
| react / react-dom                | 19.2.8  |                                                                                                                                            |
| payload                          | 3.88.0  | Peer `graphql ^16.8.1`.                                                                                                                    |
| @payloadcms/next                 | 3.88.0  | Peer range for next: `>=16.2.6 <17.0.0` (also 15.2.9–15.5.x windows).                                                                      |
| @payloadcms/db-postgres          | 3.88.0  | `push: false` always — migrations only. Transitive drizzle-orm 0.45.2, pg 8.20.0.                                                          |
| @payloadcms/richtext-lexical     | 3.88.0  | Transitive @lexical/react 0.41.0.                                                                                                          |
| @payloadcms/storage-s3           | 3.88.0  | Transitive @aws-sdk/client-s3 3.1126.0. `forcePathStyle: true` for MinIO/R2.                                                               |
| graphql                          | 16.14.2 |                                                                                                                                            |
| sharp                            | 0.35.4  | Native build; approved in `.npmrc`. Upgraded at C3: 0.34.x carried libvips CVEs (CVE-2026-33327/8, -35590/1) caught by the new audit gate. |
| zod                              | 4.5.4   | design-contract schema; form validation later.                                                                                             |
| @fontsource-variable/bodoni-moda | 5.3.0   | OFL-1.1; `latin-standard` file keeps the `opsz` axis.                                                                                      |
| @fontsource-variable/jost        | 5.3.0   | OFL-1.1; `latin-wght` file.                                                                                                                |

## Dev / test

| Package                   | Version            | Note                                                                                               |
| ------------------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| tsx                       | 4.23.13            | Worker and script runner (`node node_modules/tsx/dist/cli.mjs src/worker.ts` in containers).       |
| dotenv                    | 16.6.1             | Scripts only; Next loads `.env` itself.                                                            |
| s3rver                    | 3.7.1 (spike only) | S3-compatible test server used in the C0 spike; CI uses MinIO service container.                   |
| @playwright/test          | 1.62.1             | Chromium, Firefox, WebKit × 360/390/768/1024/1440; admin flows Chromium-only.                      |
| @axe-core/playwright      | 4.13.0             | a11y assertions in e2e.                                                                            |
| playwright                | 1.62.1             | Root: legacy extractor and parity gate drive Chromium directly (same version as @playwright/test). |
| esbuild                   | 0.28.2             | Root: strips types from `tools/legacy-extract/dom.ts` before injecting it into the legacy page.    |
| lighthouse                | 13.4.1             | Root: C5/C9 performance, a11y, best-practices, SEO scores (JSON stored in test-results).           |
| vitest                    | 5.0.0              | Unit/integration + fixture parity tests.                                                           |
| eslint                    | 9.39.5             | ESLint 10 exists but eslint-plugin-jsx-a11y 6.10 declares peers only to ^9; revisit when it does.  |
| typescript-eslint         | 8.69.0             |                                                                                                    |
| stylelint                 | 17.15.0            | `csstools/use-logical` (stylelint-use-logical 2.1.3) enforces logical properties (R36, ADR-024).   |
| stylelint-use-logical     | 2.1.3              |                                                                                                    |
| stylelint-config-standard | 40.0.0             |                                                                                                    |
| eslint-plugin-jsx-a11y    | 6.10.2             |                                                                                                    |
| eslint-plugin-react       | 7.37.5             |                                                                                                    |
| eslint-plugin-react-hooks | 7.1.1              |                                                                                                    |
| eslint-config-next        | 16.3.4             | installed for parity with Next; the flat config in tools/eslint-config is authoritative.           |
| prettier                  | 3.9.6              |                                                                                                    |
| turbo                     | 2.10.12            | task orchestration + cache.                                                                        |

## Constraints discovered in C0 (all reproduced, all resolved)

1. **Trailing slash vs Payload API.** `trailingSlash: true` makes Next 308-redirect `/api/users/login` → `/api/users/login/`, breaking Payload's REST/admin clients. Resolution: `skipTrailingSlashRedirect: true` plus `src/proxy.ts` that enforces the slash only on public routes (excludes `/api`, `/admin`, `/_next`, well-known files). Verified: `/home` → 308 `/home/` (single hop, query preserved), `/x/index.html` → 308 `/x/`, `/api/*` and `/admin` untouched, login POST returns JSON.
2. **`NextResponse.redirect(req.nextUrl.clone())` normalises the slash away** under `trailingSlash: true`; build the redirect target from a string (`new URL(pathname + '/', req.url)`).
3. **Next standalone output copies `.env` into `.next/standalone/`.** A secret leak path if `.env` is in the Docker build context or CI workspace. `.dockerignore` excludes `.env*` (keeps `.env.example`); the quality gate must scan built images/bundles for `.env`.
4. **`next start` does not work with `output: 'standalone'`** — run `node server.js` from the standalone dir with `.next/static` and `public` copied beside it (Dockerfile does this).
5. **Completed jobs are deleted by default** (`payload_jobs` empty after success). For an auditable outbox this is fine (the job wrote its own record), but Release 1 sets `jobs.deleteJobOnComplete: false` and a retention job, so failures and history are inspectable in admin.
6. **Worker/web split works with `jobs.autoRun: []`** in the shared config and a separate `src/worker.ts` calling `payload.jobs.run()`; both processes share one image. Idempotency by a unique `idempotencyKey` column was verified (duplicate job → one outbox row).
7. **Type generation and `migrate:create` need `DATABASE_URI` set** even though they do not connect for type generation; the Dockerfile supplies a placeholder at build time. `next build` itself needs no database.
8. **MinIO download host is blocked in this sandbox** (`dl.min.io`); s3rver stands in. The storage adapter was verified end to end: upload via Payload local API → objects (original + sharp-generated thumb) in the bucket → served back through `/api/media/file/*`.
9. Payload's `create-payload-app` needs an interactive TTY; the app was hand-rolled, which also documents exactly what the wiring is.

## Font licences (A2 — resolved at C2)

Bodoni Moda and Jost are both SIL Open Font License 1.1 (copyright The Bodoni Moda Project Authors / The Jost Project Authors, indestructible-type). Licence texts are copied to `apps/syed-ai/public/fonts/LICENSE-*.txt` by the compiler. OFL permits bundling and self-hosting; the Reserved Font Name clause is respected because the files are unmodified.
| @factory/seo-contracts (workspace) | 1.0.0 | Contracts crossing the OGCS boundary (ADR-028): page-decisions 1.0.0, qa-report 1.0.0, deploy-event 1.0.0, evidence-bundle 1.0.0, blueprint v2. Package version tracks the highest contract MAJOR. |
| @factory/providers (workspace) | 0.1.0 | Runtime provider adapters (C7): AI interface, gateway (budgets, permissions, redaction, prompt registry, structured output, provenance), deterministic mock. Real AI providers arrive in Release 6/7. |
