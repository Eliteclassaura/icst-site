# CRM_TYPEFORM_INGESTION — H2O / ICS CRM

**State (CRM go-live patch, 2026-10-02):** the endpoint is mounted at `POST /api/crm/intake/typeform/` and is
**off by default**: it answers 404 unless `H2O_CRM_TYPEFORM_INGEST_ENABLED=1`. Staging is proven with signed
synthetic payloads only (`ops/crm-golive/pass2-synthetic-intake.mjs`). The real Typeform webhook on F22cAgx3 is
configured only at production cutover, by a separate owner GO (`ops/crm-golive/README.md`).

- `TYPEFORM_LIVE_WEBHOOK_ACTIVATED = NO` until that GO.
- Fail-closed order: flag not `1` → 404 · flag `1` but configuration invalid → 503 · content type not JSON → 415 ·
  body over 256 KB (declared or streamed) → 413 · bad/missing signature → 401 (nothing stored).

## 1. Contract used

- **Public side (unchanged).** The accepted `QuoteCta`/`RfqMount` adapter passes only the
  `SAFE_CONTEXT_KEYS` as Typeform hidden fields:
  - `page_path`
  - `cta_placement`
  - on product mounts: `product_id` (a **legacy route number**, not a Payload id) and `product_slug`
    (the legacy slug)
  - `utm_*` where present

  CRM re-declares this allowlist in `intake/typeform/parse.ts`. A static test asserts it is identical to
  the adapter's list. The adapter is not imported, because the site boundary test forbids that.

- **Delivery envelope read.**
  - Top level: `event_id`, `event_type = form_response`.
  - `form_response`: `form_id`, `token`, `submitted_at`, `hidden`, and `answers[]`.
  - Answers are read by `field.ref` and typed value (`text`, `email`, `phone_number`, `number`,
    `choice`, `choices`, `boolean`, `date`, `url`).
- **Signature.** `Typeform-Signature: sha256=<base64 HMAC-SHA256(secret, raw body)>`.

## 2. Configuration (all from the environment; fail-closed)

| Variable                          | Meaning                                                                                                                                                                                                                                  | Missing →                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `H2O_CRM_TYPEFORM_WEBHOOK_SECRET` | Signing secret, at least 24 chars                                                                                                                                                                                                        | `SECRET_MISSING` / `SECRET_TOO_SHORT` → 503                                                            |
| `H2O_TYPEFORM_FORM_ID`            | Same variable the public adapter uses; pattern `^[A-Za-z0-9]{6,32}$`                                                                                                                                                                     | 503                                                                                                    |
| `H2O_CRM_TYPEFORM_FIELD_MAP`      | JSON `{ "<field ref>": "<target>" }`. Targets: `first_name`, `last_name`, `full_name`, `email`, `phone`, `company`, `country_code`, `message`, `requested_quantity`, `requested_scope`, `other:<key>`. Identity targets may appear once. | No map is valid: RFQs persist with `FIELD_MAPPING_MISSING` and go to review, and no contact is created |
| `H2O_CRM_TYPEFORM_INGEST_ENABLED` | Must be exactly `1`                                                                                                                                                                                                                      | 404 (indistinguishable from an unmounted route)                                                        |

**Owner input OI-01 (resolved for review):** the recommended map for `F22cAgx3` is
`F22CAGX3_RECOMMENDED_FIELD_MAP` in `src/crm/intake/typeform/config.ts`, taken from the refs recorded in the CRM-2
authority capture (`TYPEFORM_FIELD_LEDGER.tsv`). It is not a default: the operator sets the JSON in the
environment after confirming the refs against the live form definition.

**Owner input OI-02 (open):** the live form declares **no hidden fields**, so Typeform drops `page_path`,
`cta_placement` and the product context the site passes. Until the owner adds the eleven hidden fields
(`product_id, product_slug, product_path, product_title, page_path, cta_placement, utm_source, utm_medium,
utm_campaign, utm_term, utm_content`) to F22cAgx3, real RFQs arrive without page or product context (they are
still created, contact and account matching still run).

**Launch rules added by the go-live patch:** product context is kept only when the site could have produced it
(placement `header_action`, `footer_rfq_band`, `rfq_page` or `category_and_family`, a page path, a slug, a numeric
id) — otherwise the product fields are dropped and the RFQ goes to review; an existing address with a different
name leaves the RFQ **unlinked** with an `EMAIL_MATCH_NAME_MISMATCH` review; an active suppression is recorded
(`normalized_summary.suppression_active`) and shown on the RFQ even when it is unlinked, and is never altered.

## 3. Flow and failure behaviour

| Situation                                                   | Behaviour                                                                                                    | HTTP | Stored                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---- | ---------------------------------------------------- |
| Invalid, missing or malformed signature                     | Reject                                                                                                       | 401  | nothing                                              |
| Signed but not JSON                                         | Quarantine, keyed `sha256:<hash>`                                                                            | 200  | intake event `QUARANTINED_MALFORMED`                 |
| Unsupported `event_type`, missing ids                       | Quarantine                                                                                                   | 200  | `QUARANTINED_UNSUPPORTED` / `_MALFORMED`             |
| Form id other than configured                               | Quarantine                                                                                                   | 200  | `QUARANTINED_UNSUPPORTED` (`FORM_ID_NOT_CONFIGURED`) |
| Same `event_id`, same body                                  | No-op; replay counted atomically                                                                             | 200  | —                                                    |
| Same `event_id`, different body                             | Record the conflicting hash, open review, never apply                                                        | 200  | conflict row, review                                 |
| Concurrent duplicates                                       | One wins the atomic claim; the rest no-op                                                                    | 200  | one set                                              |
| Same response `token`, new `event_id`                       | Link to the existing RFQ                                                                                     | 200  | `DUPLICATE_OF_EXISTING_SUBMISSION`                   |
| New genuine submission                                      | Intake → RFQ → item → identity → reviews → tasks/activities                                                  | 200  | full set                                             |
| Identical content, different response                       | **Kept**; flagged `POSSIBLE_DUPLICATE_SUBMISSION`                                                            | 200  | second RFQ, review                                   |
| Unknown or invalid email                                    | RFQ persisted without a contact (`NO_VALID_EMAIL`)                                                           | 200  | RFQ, review                                          |
| Unknown contact                                             | New contact from submitted fields. `relationship_evidence = RFQ_REQUEST`, `marketing_eligibility = UNKNOWN`. | 200  | —                                                    |
| Ambiguous or conflicting account                            | No link; review                                                                                              | 200  | —                                                    |
| Invalid context (traversal, protocol-relative, unknown key) | Value dropped, rejection recorded, RFQ to review                                                             | 200  | —                                                    |
| Product slug with no exact product                          | Item kept `UNRESOLVED`                                                                                       | 200  | —                                                    |
| Failure after the intake is stored                          | `FAILED_RETRYABLE`, lease released on retry; completion is idempotent                                        | 500  | RFQ survives                                         |
| Downstream notification                                     | Not implemented: `notification_state = NOT_SENT_DISABLED_IN_CRM1`                                            | —    | —                                                    |

Transport receipt is never treated as business uniqueness. There are three separate keys:

- the event identity `(TYPEFORM, event_id)`;
- the submission identity `form_id:token`, unique on the RFQ;
- a content fingerprint, which only flags.

## 4. Activation checklist (CRM-2, requires authorization)

1. Owner supplies the `F22cAgx3` field-ref map (OI-01) and approves the targets.
2. Control Tower authorizes endpoint registration.
3. Commander registers `typeformWebhookHandler` on a private host path, sets the secret in the secret store
   (never in git), and sets `H2O_CRM_TYPEFORM_INGEST_ENABLED=1` in staging only.
4. Commander configures the Typeform webhook with the secret and replays a **test-mode** delivery against
   staging.
5. Commander verifies the staging DB result.
6. Production follows only by separate authorization.
