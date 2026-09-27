# CRM_TEST_REPORT — H2O / ICS CRM-1

All runs took place in the Factory cloud workspace, on a byte-verified copy of the worktree baseline.

- **Toolchain:** Node 22.22.2, pnpm 10.28.0, lockfile unchanged.
- **Database gates:** an isolated synthetic PostgreSQL 16.13, freshly created by `initdb` in the
  container. It listens on `127.0.0.1:55432` only, with database `h2o_crm_synthetic`.
  - No staging or production credentials exist in the workspace.
  - The DB test setup refuses any non-loopback host, or any database name without
    `synthetic`/`test`.

## Gate summary

| Gate                                                   | Command                                        | Result                                                                                                                                                                                                                                                        |
| ------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H2O typecheck                                          | `tsc --noEmit` (apps/h2o)                      | **PASS**, exit 0                                                                                                                                                                                                                                              |
| H2O lint                                               | `eslint src --max-warnings 0`                  | **PASS**, exit 0                                                                                                                                                                                                                                              |
| Prettier (CRM files, config, migrations, docs)         | `prettier --check`                             | **PASS**                                                                                                                                                                                                                                                      |
| CRM unit and static tests (default suite)              | `vitest run src/crm`                           | **PASS**, 33/33                                                                                                                                                                                                                                               |
| CRM DB tests (Local API plus real REST route handlers) | `vitest run -c vitest.crm-db.config.ts`        | **PASS**, 120/120, 4 files                                                                                                                                                                                                                                    |
| Discrimination (mutation) harness                      | `crm-discrimination.mjs`                       | **PASS**. The baseline passes, **23/23** unsafe mutations are caught, and every file is restored byte-identically                                                                                                                                             |
| Full H2O suite                                         | `vitest run` and `vitest.integrated.config.ts` | 604 pass / 28 fail. The **28 failures are identical, by name, to the pre-change baseline**: all are `ENOENT` on `apps/h2o/public/**` media binaries (517 MB), which were not transferred to the Factory. `NOT_EXECUTED_ENVIRONMENT` for those 28 → Commander. |
| agency-core                                            | `tsc` / `vitest`                               | PASS / 29 of 29                                                                                                                                                                                                                                               |
| syed-ai                                                | `tsc --noEmit`                                 | PASS                                                                                                                                                                                                                                                          |
| Payload type generation                                | `payload generate:types`                       | Regenerated. Existing types unchanged except for the populated `collectionsJoins`.                                                                                                                                                                            |
| Import map                                             | `payload generate:importmap`                   | Regenerated (see CONTROL_TOWER_REPORT §J, stale baseline)                                                                                                                                                                                                     |
| Migration create / apply / drift / down-up             | `payload migrate*`                             | **PASS** (CRM_MIGRATION_PLAN.md)                                                                                                                                                                                                                              |
| CMS production build                                   | `next build` (apps/h2o, synthetic env)         | **PASS**, exit 0                                                                                                                                                                                                                                              |
| Admin runtime (dev server)                             | `next dev` + curl                              | **PASS** for the observations in `RUNTIME_ADMIN_EVIDENCE.txt`                                                                                                                                                                                                 |
| Residue / secret scan                                  | `pnpm gates:scan`                              | Findings are **identical to baseline (311,181 = 311,181)**. All are pre-existing in `apps/h2o/content/**`, `src/site`, `tools`; **0 are in CRM files**. The gate is red at baseline, so it is not a CRM regression.                                           |
| CSS lint                                               | `pnpm lint:css`                                | 2,608 errors **identical to baseline**, all pre-existing in `src/app/(site)/*.css`. The CRM CSS module passes stylelint on its own.                                                                                                                           |
| `skills:verify`, `versions:check`                      | —                                              | PASS                                                                                                                                                                                                                                                          |
| Public static build                                    | `build:public`                                 | **NOT_EXECUTED_ENVIRONMENT**: it needs the public media not transferred. CRM does not touch its inputs, and the static tests prove it.                                                                                                                        |

## Control Tower minimum tests (§46)

| #   | Requirement                                 | Test (file › name)                                                                                         | Status |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------ |
| 1   | CRM collections register                    | access › T1 registration (14, `crm-` prefix, no agency-core CRM)                                           | PASS   |
| 2   | Unauthorized CRM access rejected            | access › anonymous GET/POST ×14; viewer/editor/search-analyst ×14                                          | PASS   |
| 3   | Admin access works                          | access › platform-admin and client-admin can list                                                          | PASS   |
| 4   | Sales per current permissions               | access › sales read/create; no delete; no audit-log; no intake create                                      | PASS   |
| 5   | Account relationships                       | entities › account → contacts/sites/opportunities joins                                                    | PASS   |
| 6   | Contact relationships                       | entities › contacts identity; buying group                                                                 | PASS   |
| 7   | Site relationships                          | entities › multiple plants; site → assets                                                                  | PASS   |
| 8   | Asset relationships                         | entities › account derived from site; multiple towers                                                      | PASS   |
| 9   | Opportunity relationships                   | entities › scope binding (site/asset/account)                                                              | PASS   |
| 10  | RFQ creation                                | rfq-intake › verified delivery persists …                                                                  | PASS   |
| 11  | rfq_number stability                        | rfq-intake › write-once via REST, Local API, admin                                                         | PASS   |
| 12  | RFQItem relationship                        | rfq-intake › item with source context; exact-slug resolution                                               | PASS   |
| 13  | Duplicate event → no duplicate RFQ          | rfq-intake › delivered twice; five concurrent; resent under new event id                                   | PASS   |
| 14  | Replay idempotent                           | rfq-intake › retried to completion without duplicating; conflicting replay quarantined                     | PASS   |
| 15  | Deterministic contact match                 | rfq-intake › email casing differences                                                                      | PASS   |
| 16  | Ambiguous contact not auto-merged           | rfq-intake › exact email + different name; same name + different email                                     | PASS   |
| 17  | Deterministic account match                 | rfq-intake › verified domain → `MATCHED_VERIFIED_DOMAIN`                                                   | PASS   |
| 18  | Ambiguous account fails safely              | rfq-intake › company-name match, consumer domain, contact-account conflict, shared-domain refusal          | PASS   |
| 19  | UNKNOWN amount stays UNKNOWN                | entities › no amount, no currency, no probability                                                          | PASS   |
| 20  | Explicit zero distinguishable               | entities › explicit zero vs unknown                                                                        | PASS   |
| 21  | Audit where required                        | entities › T21 audit (create, stage, owner; no PII); rfq-intake › status/assignee transitions              | PASS   |
| 22  | Suppression durable                         | entities › T22 (send gate, append-only, never-clearable, re-consent, survives archive)                     | PASS   |
| 23  | Invalid webhook verification rejected       | rfq-intake › invalid signature → 401, nothing stored; unit › signature                                     | PASS   |
| 24  | Malformed intake fails safely               | rfq-intake › non-JSON, unsupported type, other form, hostile context                                       | PASS   |
| 25  | Missing optional context fabricates nothing | rfq-intake › missing optional context                                                                      | PASS   |
| 26  | Public/static routes cannot access CRM      | static › no import from site/conversion/(site); prepare.mjs copy list; REST anonymous 403                  | PASS   |
| 27  | Missing security config fails closed        | unit › config; rfq-intake › no secret → 503; not enabled → 503                                             | PASS   |
| 28  | No production PII in fixtures               | static › fixtures use only reserved example domains                                                        | PASS   |
| 29  | No live Typeform call                       | rfq-intake › `fetch` spied to throw, asserted never called; handler not mounted                            | PASS   |
| 30  | No live email                               | rfq-intake › `payload.sendEmail` spied and asserted never called; static › no mail transport in CRM source | PASS   |

## Discrimination mutations (each must make the suite fail)

| #   | Mutation                                  | Result |
| --- | ----------------------------------------- | ------ |
| M01 | anonymous read allowed                    | CAUGHT |
| M02 | delete guard removed                      | CAUGHT |
| M03 | write-once disabled                       | CAUGHT |
| M04 | signature always accepted                 | CAUGHT |
| M05 | business uniqueness keyed on transport id | CAUGHT |
| M06 | gmail-style alias folding                 | CAUGHT |
| M07 | missing amount coerced to 0 USD           | CAUGHT |
| M08 | NEW_TOWER may bind an asset               | CAUGHT |
| M09 | unknown displayed as $0                   | CAUGHT |
| M10 | send gate ignores suppression             | CAUGHT |
| M11 | bulk-export cap removed                   | CAUGHT |
| M12 | audit summary populated                   | CAUGHT |
| M13 | cross-account buying-group rule removed   | CAUGHT |
| M14 | asset evidence rule removed               | CAUGHT |
| M15 | stage change without reason               | CAUGHT |
| M16 | people may forge system events            | CAUGHT |
| M17 | company-name similarity links an account  | CAUGHT |
| M18 | PII written to intake log                 | CAUGHT |
| M19 | retry re-logs receipt                     | CAUGHT |
| M20 | replay/claim gate bypassed                | CAUGHT |
| M21 | audit records actor email                 | CAUGHT |
| M22 | opportunity may change account            | CAUGHT |
| M23 | product linked without exact slug         | CAUGHT |

**Honesty note.** The first discrimination run caught 18 of 19 mutations. The miss was "activity
pre-check removed". The unique DB index still enforced idempotency, so that mutation broke no behaviour.
It was replaced by stronger mutations (M19, M20), and the retry test gained an assertion.

A flaky concurrency result was also found. Five simultaneous deliveries occasionally produced two
processors. This was **fixed in source** with an atomic lease claim (`intake/typeform/claim.ts`), not in
the test. Afterwards: 8 of 8 repeat runs passed, then the full suite passed.

## Not executed

- `NOT_EXECUTED_ENVIRONMENT`: real-browser and accessibility audit; the 28 media-dependent site tests;
  `build:public`; Docker/native Commander gates.
- `NOT_EXECUTED`, by rule: any staging or production database, any live Typeform delivery, any email.
