# CRM_ADVERSARIAL_REPORT — H2O / ICS CRM-1 (Pass 3)

## §47 attack cases

| Attack                                         | Expected                            | Result | Evidence                                                                                                                    |
| ---------------------------------------------- | ----------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| Same Typeform event twice                      | 1 RFQ, a no-op on the 2nd delivery  | PASS   | rfq-intake › delivered twice; M05, M20                                                                                      |
| Email casing differences                       | one contact                         | PASS   | rfq-intake › casing; entities › unique key                                                                                  |
| Same name, different people                    | two contacts, review, no merge      | PASS   | rfq-intake › same name; entities › coexist                                                                                  |
| Same company name, different company           | no link without a verified domain   | PASS   | rfq-intake › company-name candidate; M17                                                                                    |
| Account with multiple plants                   | both sites under the account        | PASS   | entities › joins (2 sites)                                                                                                  |
| Multiple towers at one site                    | both assets                         | PASS   | entities › site → assets                                                                                                    |
| Greenfield opportunity, no asset               | allowed                             | PASS   | entities › NEW_TOWER needs no asset                                                                                         |
| Rebuild tied to an existing asset              | bound to the asset on the same site | PASS   | entities › rebuild bound                                                                                                    |
| Contact A's evidence applied to Contact B      | refused                             | PASS   | entities › cross-account buying group; rfq-intake › contact-account conflict; M13                                           |
| Project A's evidence applied to Project B      | refused                             | PASS   | entities › other site/account assets refused; RFQ ↔ other-account opportunity refused; opportunity account write-once (M22) |
| Unknown buying-group role treated as verified  | refused / gate false                | PASS   | entities › unknown role; gate                                                                                               |
| Unknown value shown as $0                      | never                               | PASS   | unit, overview; M09                                                                                                         |
| Two touches doubling one opportunity's revenue | counted once                        | PASS   | unit › confirmedRevenueByCurrency                                                                                           |
| Suppressed contact considered sendable         | blocked; eligibility refused        | PASS   | entities › T22; M10                                                                                                         |
| RFQ exposed publicly                           | 401/403, not in static export       | PASS   | access, static, dev server                                                                                                  |
| Sales reads an admin-only pricing field        | denied                              | PASS   | access › pricing                                                                                                            |
| Anonymous API reads CRM                        | 403                                 | PASS   | REST handlers and real HTTP                                                                                                 |
| Audit record missing after a critical mutation | present                             | PASS   | entities › T21; rfq-intake › transitions                                                                                    |

## Additional attacks tried

| Attack                                                                          | Result                                                                         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Client-supplied `canonical_id`                                                  | Ignored on create; rejected on update                                          |
| Forged `source_system`, `rfq_number`, `received_at` on a manual RFQ over REST   | Replaced by server values                                                      |
| Forged task `source = SYSTEM_RULE` / `idempotency_key`                          | Discarded (`MANUAL`, null)                                                     |
| Forged system activity (`RFQ_CREATED`)                                          | Refused (`ACTIVITY_TYPE_SYSTEM_ONLY`)                                          |
| Editing an activity, a suppression or an intake identity                        | Refused on every path                                                          |
| Deleting an account, RFQ, suppression or task with `overrideAccess`             | Refused                                                                        |
| Clearing a hard bounce                                                          | Refused. Complaint clear without re-consent: refused. Sales clearing: refused. |
| Recording a hard bounce as marketing-only                                       | Refused (scope too narrow)                                                     |
| Sales setting `marketing_eligibility = ELIGIBLE` or revenue `CONFIRMED`         | Write discarded (value stays UNKNOWN / UNVERIFIED)                             |
| Admin setting ELIGIBLE with unknown jurisdiction, or over an active suppression | Refused                                                                        |
| Two accounts claiming one verified domain                                       | 409 refused                                                                    |
| Moving a site to another account, or an opportunity to another account          | Refused                                                                        |
| Protocol-relative / traversal / unknown-key hidden context                      | Dropped and flagged                                                            |
| `limit=0` / `pagination=false` / `limit=100000` as sales                        | Capped at 100                                                                  |
| Tampered replay (same `event_id`, new body)                                     | Quarantined; the stored RFQ is unchanged                                       |
| Transient failure mid-processing                                                | RFQ survives; the retry completes it once                                      |
| Five concurrent deliveries                                                      | One processor (atomic claim)                                                   |
| PII probe through the full intake plus a bad-signature path                     | Absent from logs                                                               |
| Non-CRM role opening the CRM Overview                                           | No data; no queries made (spy asserted)                                        |

## Pass 3 release review of changed files

- **Shared mutations.** None. agency-core, syed-ai, packages/* and tools/* are byte-identical to the
  baseline manifest.
- **Public website.** Unchanged: `src/site`, `src/conversion`, `src/app/(site)`, `src/proxy.ts`,
  `release/**` and `content/**` are byte-identical.
- **Production references and credentials.** None. The test secrets use the scanner's `test-` placeholder
  prefix, and the residue scan adds 0 findings.
- **PII.** Fixtures use `example.com`, `example.test` and 555-01xx numbers only (static test).
- **Hidden DB writes.** Only the documented intake claim uses raw SQL, and it touches two operational
  columns. Every other write goes through Payload hooks.
- **Live network.** No `fetch`, http, net or tls client and no mail transport in CRM source (static test).
- **Permission bypass.** Hooks hold on the Local API. The residual trust in `context.crmServer` is
  recorded as risk R1 in `CRM_SECURITY_MODEL.md`.
- **Duplicate entity models.** None. The agency-core CRM is not registered, and slugs are prefixed.
- **Generated files.** `payload-types.ts`, `importMap.js`, the migration `.json` and the migration UP are
  generator output. Nothing was hand-edited except the documented DOWN reorder.
- **Test false positives.** Checked with the 23-mutation discrimination run. There are no test skips; the
  DB suite is a separate explicit gate, not a skip.
- **Package contamination.** Checked in the package validator (no node_modules, .git, env values, dumps,
  CSV, fonts or media).

## Findings raised against the Factory's own work during Pass 3 (fixed before packaging)

1. **Concurrent processing race.** Two processors could run on one event, with a risk of duplicate items.
   Fixed with an atomic lease claim and a unique `(rfq, line_no)`.
2. **Partial REST PATCH.** Cross-field hooks could see partial data. Fixed with a merged view in every
   rule; a REST PATCH test covers it.
3. **Write-once array-row comparison.** Rows compared by row id would have let a value change pass.
   Fixed to compare by content, with a unit test.
4. **Suppression lookup capped by the list limiter** for non-admin requests. Server lookups are now
   exempt.
5. **Generated DOWN failure.** Reordered, and UP → DOWN → UP was proven.
6. **Opportunity account mutability.** It was changeable. It is now write-once (M22).
