# Agency Site Factory

A private platform for turning a design contract into a Payload-managed, Next.js-rendered, SEO-first client website — with a lightweight CRM, provider-neutral email, optional AI, WordPress migration tools and an evidence-based Search Intelligence module. **Syed AI (syed.ai)** is the pilot site.

## Status — Release 1 in progress: C0 ✅ C1 ✅ C2 ✅ C3 ✅ C4 ✅ C5 ✅ (2026-09-04)

Workspace, toolchain, quality gates and CI are in place; `apps/syed-ai` runs with UUID ids, migrations, worker and e2e smoke. Content model (40 collections, 12 globals, six roles) with 84 threat-model tests against PostgreSQL; design contract compiled; fonts self-hosted. Component registry with ten blocks renders `/` from the CMS (`docs/component-registry.md`, `/dev/blocks` with `DEV_ROUTES=1`). All five legacy routes pass the parity gate (`pnpm parity:check`), with 15 new indexable case-study and build pages. Next: C6 lead slice (brief form → CRM → mock email).

```bash
pnpm install
pnpm check                 # typecheck · lint · test · build · residue scan · versions
# app: see apps/syed-ai/.env.example, then
pnpm --filter @factory/syed-ai migrate && pnpm --filter @factory/syed-ai seed
pnpm skills:install          # build-time design skills into .claude/skills (pinned npm packages)
```

| Read this                                         | For                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `docs/input-inventory.md`                         | What was supplied, what it contains, what is missing                                  |
| `docs/discovery/`                                 | Line-referenced inventories of the legacy site and the Search Evidence Suite          |
| `docs/baselines/`                                 | No-JS SEO baseline per route, screenshots ×5 viewports, deterministic engine fixtures |
| `docs/risks.md`                                   | Ranked security and migration risks (R1 needs owner action **now**)                   |
| `docs/architecture.md`                            | Proposed system shape and boundaries                                                  |
| `docs/decision-log.md`                            | ADR-001 … ADR-017                                                                     |
| `docs/assumptions.md`                             | A1 … A21                                                                              |
| `docs/release-plan.md`                            | Release 1 and 2 checkpoints with acceptance tests                                     |
| `docs/backlog.md`                                 | Releases 0–7 mapped to the master prompt's milestones; owner decisions                |
| `docs/content-verification-ledger.md`             | Every business fact that must be verified before production launch                    |
| `docs/versions.md`                                | Pinned stack and the constraints found in the C0 spike                                |
| `docs/master-prompt.md`, `docs/execution-plan.md` | The two governing inputs (copies)                                                     |

## Repository layout (current)

```
apps/syed-ai/            pilot: Next 16 + Payload 3 + Postgres, worker, Dockerfile, e2e
packages/design-contract/ schema · from-css adapter · token/font/contrast emitters · design-system bundle (C5.5, docs/design-packs.md)
packages/agency-core/    cms (collections, globals, roles, hooks, security defaults) + design-system
packages/quality-gates/  residue/secret scan (CI gate) — grows into SEO/a11y/parity gates
tools/eslint-config/     shared flat config + factory/no-hex-in-components rule
tools/scripts/           check-versions.mjs
tools/baseline/          scripts that produced docs/baselines
docs/                    all documentation (see table)
legacy-reference/        unmodified supplied archives — read-only, see LEGACY-REFERENCE-NOTICE.md
spike/c0-spike/          throwaway compatibility spike (kept for reference)
.github/workflows/ci.yml
```

Target layout after Release 1 is in `docs/decision-log.md` ADR-003.

## Reproducing the baselines

```bash
node tools/baseline/capture-baseline.mjs   # needs php + playwright (Chromium)
node tools/baseline/ses-characterize.mjs   # pure Node; deterministic
```

## Principles (short form)

Payload is the control plane, Next.js renders. Content, metadata and schema live in the initial HTML. Runtime AI is optional and off by default. One deployment and one database per client. Evidence stays classified as observed / reported / recorded / generated; missing is `null`, never zero. Humans approve publishing, redirects, schema, lead actions and email sends. No secret, PII or client hostname enters the repository, logs, client JavaScript or AI context.
