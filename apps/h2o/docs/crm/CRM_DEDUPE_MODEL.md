# CRM_DEDUPE_MODEL — H2O / ICS CRM-1

The principle: **deterministic links only. Everything uncertain stays apart and goes to a person.**
Nothing in CRM-1 merges records.

## Deterministic identity

| Entity                          | Key                                                                                                                                        | Notes                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact                         | `email_match_key`: the address lowercased and trimmed, IDNA domain. Unique.                                                                | E0.1 forbids provider alias folding, so `j.doe+rfq@` and `jdoe@` stay distinct. The address is write-once; a replacement address is a new contact point. |
| Account (from intake)           | The email domain equals a `VERIFIED_OWNED` / `VERIFIED_ALIAS` domain on **exactly one** account, and the domain is not a consumer mailbox. | The result is `HIGH_CONFIDENCE`. `VERIFIED` is reserved for human verification (E0.1 §03).                                                               |
| Account (domain claims)         | A verified domain may sit on one account only. A second claim is refused with 409.                                                         | E0.1: "two accounts share a domain → human review".                                                                                                      |
| Site / Asset                    | Canonical id only. No matching by name or address in CRM-1, and intake never creates or links a site or asset.                             |                                                                                                                                                          |
| Intake event                    | `(source_system, source_event_id)` unique                                                                                                  | Transport identity                                                                                                                                       |
| RFQ                             | `submission_key = form_id:token` unique                                                                                                    | Business identity of one submitted response                                                                                                              |
| Buying-group member             | `(opportunity, contact)` unique                                                                                                            |                                                                                                                                                          |
| System activity / task / review | `idempotency_key` / `dedupe_key` unique                                                                                                    | Replays are idempotent                                                                                                                                   |

## Review triggers (`crm-identity-reviews`, with an `IDENTITY_REVIEW` task)

| Reason                                 | When                                                                                  | What automation does                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `EMAIL_MATCH_NAME_MISMATCH`            | Same address, a different submitted name                                              | Links by email and **does not overwrite** names                   |
| `SAME_NAME_DIFFERENT_EMAIL`            | A new contact's normalised full name equals another contact's                         | Keeps both                                                        |
| `VERIFIED_DOMAIN_ON_MULTIPLE_ACCOUNTS` | The defensive path; the write-time refusal should prevent it                          | Links nothing                                                     |
| `COMPANY_NAME_MATCH_UNVERIFIED`        | The submitted company equals an account name or alias, but the domain is not verified | Links nothing                                                     |
| `CONTACT_ACCOUNT_CONFLICT`             | An existing contact is linked to account X and the domain matches account Y           | Keeps the contact's link; the RFQ account stays null              |
| `POSSIBLE_DUPLICATE_SUBMISSION`        | Same email + message + product slug as another RFQ                                    | Keeps both RFQs (E0.1: never discard a legitimate second inquiry) |
| `INTAKE_CONFLICTING_PAYLOAD`           | Same event id, different body                                                         | Never applies the second body                                     |

Each review is opened once per conflict (`dedupe_key`). A person resolves it as `CONFIRMED_DISTINCT`,
`DISMISSED` or `CONFIRMED_DUPLICATE_PENDING_MERGE`, and must write a note.

## Merge — DEFERRED (state designed, tooling not built)

The contact and account schemas carry `record_state` / `account_state = MERGED`. A future merge
operation must be:

- permission-controlled (admin);
- lineage-preserving (the survivor records the absorbed canonical ids);
- auditable (`ics.account.merged` event);
- reversible (the absorbed record is archived, not deleted — deletion is refused anyway).

Suppression is keyed on the address, so a merge can never lose it.
