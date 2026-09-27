# CRM_PROVENANCE_MODEL — H2O / ICS CRM-1

## `provenance` group

Accounts, contacts, sites, assets, opportunities, buying-group members, RFQ items and activities all carry
this group:

| Field                            | Meaning                                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source_system`                  | `TYPEFORM`, `MANUAL_ENTRY`, `LEGACY_IMPORT`, `SYSTEM_DERIVED`, `SYNTHETIC_FIXTURE` or `UNKNOWN`. It is **required and has no default**. A hand-made record is forced to `MANUAL_ENTRY`; only trusted server code may record another source. |
| `source_record_id`               | The identifier in the source system. It is never a canonical id.                                                                                                                                                                            |
| `source_event_id`                | The source event, e.g. a Typeform `event_id`. It is never a canonical id.                                                                                                                                                                   |
| `evidence_ref`                   | Pointer to evidence (a document, RFQ, record or URL)                                                                                                                                                                                        |
| `first_seen_at` / `last_seen_at` | Observation window                                                                                                                                                                                                                          |
| `import_batch_id`                | For a future import. The field exists; no import was run.                                                                                                                                                                                   |
| `verification_state`             | `VERIFIED`, `REVIEWED_UNVERIFIED`, `UNVERIFIED` or `UNKNOWN`. It defaults to `UNKNOWN` and is never `VERIFIED` by creation.                                                                                                                 |

RFQs carry their own write-once receipt block:

- `source_system`, `source_form_id`, `source_event_id` and `client_submission_id`;
- `submission_key`, `raw_payload_hash`, `received_at` and `submitted_at`;
- the `submitted` snapshot and the `attribution` context;
- a link to the raw `crm-intake-events` row, whose `raw_payload` is admin-read-only.

## Fact-level evidence

- **Assets.** Every non-empty technical fact needs a `technical_evidence` row for that fact: manufacturer,
  model, tower type, material, cell count, commissioned year, and any non-UNKNOWN condition. `known_dates`
  rows require `evidence_ref`. There is no code path that infers condition or replacement need.
- **Opportunities.** `VERIFIED_*` and `PROJECT_ON_HOLD` project states require `project_evidence_ref`
  (E1.4).
- **Buying group.**
  - A VERIFIED membership or role requires `provenance.evidence_ref`.
  - A cross-account member always requires it.
  - An UNKNOWN role cannot be VERIFIED.
- **Contacts.** `account_link_confidence` accompanies every account link. A VERIFIED link is protected.

## Never overwrite a stronger fact with a weaker one

- Intake never changes a matched contact's names, phones or existing account link. It only fills an
  empty link with a deterministic domain match (as `HIGH_CONFIDENCE`) and otherwise opens a review.
- Server context cannot replace an existing RFQ or contact link (`SERVER_RELINK_FORBIDDEN`).
- A VERIFIED contact–account link can be changed only by an admin.
- The RFQ `submitted` snapshot is write-once. Corrections go on the contact or account, so the original
  evidence stays intact.

## Legacy contacts (≈16,395 rows) — import LOCKED

CRM-1 imports nothing. The model already preserves what a future governed import needs:

- UNKNOWN company: `account = null`, `account_link_confidence = UNKNOWN`, `company_name_original` kept;
- UNKNOWN geography: `country_code = null`, `jurisdiction = COUNTRY_UNKNOWN`;
- UNKNOWN relationship and consent: `relationship_evidence = UNKNOWN`, `marketing_eligibility = UNKNOWN`;
- source identity: `LEGACY_IMPORT` plus `source_record_id` and `import_batch_id`;
- suppression provenance: an append-only ledger with `source = LEGACY_IMPORT`.

Being eligible for CRM import is not the same as being eligible for promotional email. An imported contact
is `UNKNOWN` for marketing until an admin, with evidence, sets `ELIGIBLE`, and the hook refuses that while
any suppression is active.
