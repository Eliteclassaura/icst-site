# CRM_OPPORTUNITY_PIPELINE — H2O / ICS CRM-1

## Two dimensions, reconciled from the authorities

| Field                      | Values                                                                                                                                                                          | Authority                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `stage` (commercial)       | `NEW → QUALIFYING → QUALIFIED → PROPOSAL → NEGOTIATION`, `DELAYED`, `WON`, `LOST`, `CANCELLED`                                                                                  | E0.1 `opportunity.schema.json` (frozen)             |
| `project_stage` (nullable) | `EARLY_SIGNAL`, `DISCOVERY`, `TECHNICAL_SCOPING`, `STAKEHOLDER_ALIGNMENT`, `BUDGETING_OR_BUSINESS_CASE`, `PROCUREMENT_PREPARATION`, `DELAYED`, `ON_HOLD`, `NO_CURRENT_DECISION` | E1.4 `sequence_library.json` allowed_project_stages |
| `project_state`            | the 9 E1.4 eligibility states; default `UNKNOWN_PROJECT_STATUS`                                                                                                                 | E1.4 `project_eligibility.json`                     |
| `motion`                   | `NEW_TOWER`, `REBUILD_REPLACEMENT`, `REPAIR`, `UPGRADE_RETROFIT`, `MAINTENANCE_INSPECTION`, `PARTS`, `OTHER_APPROVED`                                                           | E0.1 (frozen)                                       |
| `motion_detail`            | the 12 Control Tower motions, each mapped to exactly one `motion`                                                                                                               | CRM-1 §4, validated                                 |
| `project_type`             | `NEW_TOWER`, `MAJOR_REBUILD_REPLACEMENT`, `CAPACITY_EXPANSION_MODERNIZATION`                                                                                                    | E1.4 `project_identity.json`                        |

Control Tower's `RFQ_RFP_ACTIVE` and `QUOTE_PROPOSAL_ACTIVE` are not stages here. They are expressed by the
RFQ record and the E0.1 `PROPOSAL` stage, which avoids inventing a permanent enum. Permanent stage naming
is owner input OI-02. Adding a value later is additive.

## Transitions are evidence-driven

- A stage change on an existing opportunity requires `stage_change_reason`. It is stamped in
  `last_stage_change {from, to, at, by, reason}`, timelined as `ics.opportunity.stage_changed` and audited.
- Nothing writes `stage` on a timer: there is no job, cron or hook that does. "Stalled" in the overview is a
  display filter (not updated for 30 days, provisional per OI-07) and moves nothing. A test proves that
  loading the overview a year in the future leaves the stage unchanged.

## Economics (E3)

| Rule                          | Enforcement                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unknown amount ≠ 0            | `amount = null` with `amount_status ∈ {NOT_ENTERED, WITHHELD_OR_NOT_AVAILABLE, UNKNOWN}`. An amount requires `KNOWN`.                                   |
| Explicit zero                 | Allowed only with `KNOWN` + `source_record_explicit_zero`                                                                                               |
| Unknown currency ≠ USD        | No default currency. `KNOWN` requires an ISO-4217 code.                                                                                                 |
| Unknown probability ≠ 0 %     | Nullable; forecast only                                                                                                                                 |
| Unknown close date ≠ today    | `expected_decision_date`, `won_date` and `closed_at` are nullable and never defaulted                                                                   |
| Revenue truth                 | `revenue_truth_state` is derived: only `WON + KNOWN + revenue_verification_state = CONFIRMED` is `WON_REVENUE_CONFIRMED`. `CONFIRMED` is admin-only.    |
| RFQ / click / reply ≠ revenue | No CRM path derives revenue from them                                                                                                                   |
| Multi-touch                   | `confirmedRevenueByCurrency` counts each opportunity once                                                                                               |
| Currencies                    | Totals are per native currency; no FX (base currency and FX source are OI-04)                                                                           |
| Display                       | `amount_display`: "Value not entered", "Value withheld / not available", "Value unknown", `JPY 1,500`, `USD 0 (explicit zero)`. Never `$0` for unknown. |

## Pipeline UI

- **Opportunities list columns:** name, account, site, motion, stage, owner, `amount_display`, next step
  due, updated.
- **Filters:** Payload list filters on any field (owner, stage, motion, `motion_detail`, `project_stage`,
  account, site, `revenue_truth_state`). All are indexed.
- **Opportunity detail:** joins to the buying group, RFQs, tasks and activity (newest first).
- **Next task and age:** the overview lists open opportunities with no open task, and those not updated
  in 30 days. Age is `updatedAt` / `createdAt`.

## Workflow precedence (future automation)

The model keeps the E1.4 precedence implementable:

1. suppression, legal, kill-switch and identity blocks;
2. active human conversation;
3. active RFQ;
4. active quote;
5. opportunity-specific human communication;
6. mega-project nurture;
7. installed-base, legacy and background programs.

The data behind each level:

- level 1: the suppression ledger and `evaluateSend`;
- level 2: `REPLY_REFERENCE` / `MEETING` activities;
- level 3: `crm-rfqs.status`;
- level 4: stage `PROPOSAL`;
- levels 5–6: opportunity plus buying group;
- level 7: the asset relationship.

CRM-1 runs no automation.
