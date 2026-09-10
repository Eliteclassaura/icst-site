# C5.5 → C6.5 boundary report

**Date:** 2026-09-10 · **Status:** C6.5 proper is **not started** and **not self-authorized**. ADR-028 is not reopened.

C5.5 touches design tooling and the skills that publish it. C6.5 is the automation lane: a service-account identity, hooks that constrain what it may write, and a human review view. This document states exactly where the line was drawn, so the next session does not have to infer it.

## 1. C6.5 features — none implemented

| C6.5 feature                                                                                                                     | State after C5.5                                                  |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `service-accounts` collection                                                                                                    | **not created**                                                   |
| `automation` role                                                                                                                | **not created**                                                   |
| Automation write hooks (drafts only; refuse `_status`, `verification.*`, slug/parent, locked SEO, media without rights, deletes) | **not implemented**                                               |
| Automation review view with bulk approval                                                                                        | **not implemented**                                               |
| Per-service-account rate limiting and the proxy limiter for `/api/*`                                                             | **not implemented**                                               |
| Lane-B editorial integration (OGCS writing drafts to a Factory site)                                                             | **not implemented** — OGCS still cannot write to any Factory site |
| `no-public-email` gate                                                                                                           | **not implemented**                                               |
| `privacyContactAlias` field                                                                                                      | **not implemented**                                               |
| `schema-entities` email hook, dropping `actorEmail`, threat-model `automation` row                                               | **not implemented**                                               |

No file under `packages/agency-core/src/cms/**`, no migration, and no `payload.ts` was modified in this checkpoint. The `content-model` path guard would have caught it if one had been.

## 2. Interfaces prepared where C5.5 genuinely needed them

Three things exist that C6.5 will use. Each was needed by C5.5 on its own terms; none is a C6.5 feature wearing a disguise.

| Interface                                                                   | Why C5.5 needed it                                                                                          | What C6.5 can do with it                                                                                                                                                                                        |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`syncCapability()` / `recordSync()`** (`tools/design-bundle/src/sync.ts`) | The design-sync publish step must not claim a push it did not make (workstream F).                          | The same evidence-not-assertion shape fits any "did the machine actually do it?" record. C6.5's automation runs will want the equivalent: a run is recorded when the write returned, not when it was attempted. |
| **`checkHandshake()`** (`tools/design-bundle/src/manifest.ts`)              | A push must refuse the wrong project, the wrong client and a project edited since the last pull (R50, R54). | The refusal shape — pure function, one reason per branch, every branch a unit test — is the pattern ADR-028's Lane-B refusals should follow. It is a pattern, not a dependency.                                 |
| **`@factory/design-bundle/safety`**                                         | Bundles, packs and design exports all need path, asset and markup admission (workstream H).                 | Importable by anything later that ingests third-party content, including the WordPress importer at Release 4. It has no Payload, React or Next dependency, on purpose.                                          |

Nothing in these three knows what a service account is.

## 3. Deliberate near-misses

Two places where the obvious next step was C6.5 work, and was not taken:

1. **The `design-sync` skill records a ledger row.** It appends to `docs/content-verification-ledger.md` as a human-run step, exactly as ADR-026 §1 specifies. It does **not** write a `verification.*` field, touch `_status`, or go anywhere near a Payload document — those are C6.5's constrained-write surface and the boundary the automation hooks will enforce.
2. **`design-pull` classifies copy changes as "route to the editor as a Payload task".** It writes a report saying so; it does not create the task, and it has no Payload client. Creating editor tasks from machine input is Lane-B behaviour.

## 4. What C6.5 will need from C5.5, and will find ready

- The **skill trust model** (`pnpm skills:verify`) is generic: any C6.5 skill gets the same no-executable-content, hash-pinned, declared-commands treatment for free by being listed in `FIRST_PARTY`.
- The **safety package** already refuses the file classes an automation lane will meet if it ever accepts media.
- **`pnpm check` now includes `skills:verify`**, so a C6.5 skill cannot land unpinned.

## 5. Standing instruction

**Do not self-authorize C6.5.** The roadmap is `C5.5 remainder → C6.5 proper → C9`, and C6.5 begins only on an explicit Control Tower instruction. Autonomous OGCS publishing remains prohibited; H2O Payload and migration work remains out of scope; the ADR-028 architecture is settled and not to be reopened.
