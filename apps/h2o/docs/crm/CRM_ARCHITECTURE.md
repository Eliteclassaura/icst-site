# CRM_ARCHITECTURE — H2O / ICS CRM-1

## 1. Boundary

```
PUBLIC SITE (static export — unchanged)
  src/app/(site) · src/site · src/conversion   ──►  Typeform F22cAgx3 (form.typeform.com)
        │  no import of src/crm (static test)            │
        │  release/prepare.mjs never copies src/crm      │  future webhook (NOT activated in CRM-1)
        ▼                                                ▼
PRIVATE CMS (Payload 3.88 / Next 16, /admin + /api, never exported)
  src/crm/**  ── 14 crm-* collections · hooks · access · audit · intake service · CRM Overview view
        │
        ▼
POSTGRES (one database per client; CRM-1 adds 21 tables via one additive migration)
```

- CRM-1 lives entirely in `apps/h2o/src/crm/`.
  - It is registered by `apps/h2o/src/payload.config.ts` after the catalog collections, because RFQ items
    relate to `products`.
  - It uses the existing `users`, `audit-log` and `products` collections.
  - It does not register the agency-core CRM layer and changes no shared file.
- The public site is static. `release/prepare.mjs` copies only `src/app/(site)` (with `api/` filtered out),
  `src/site`, `src/conversion`, `content` and `public` into the renderer. It deletes `PAYLOAD_SECRET` and
  `DATABASE_URI` from the build environment. A static test pins both facts, and a second static test
  proves no public-site file imports `src/crm`.
- CRM-1 adds no route to the public estate. The only new HTTP surfaces are Payload's automatic
  `/api/crm-*` REST routes and the `/admin` views, which are access-controlled. The Typeform webhook
  handler exists as code and is **not mounted**.

## 2. Generic engine vs ICS extension

| Layer                           | CRM-1 realisation                                                                                                                                                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generic Revenue Engine concepts | Canonical UUIDv7 identity, provenance, append-only activity timeline, tasks, suppression ledger, intake event store, identity-review queue, audit. These carry no cooling-tower fields.                                                               |
| ICS tenant extension            | Account → Plant/Site → Asset/Cooling Tower → Opportunity (motion, project type, project stage), RFQ and RFQ items, and the buying group. Tower facts exist only on `crm-assets`.                                                                      |
| Deferred generic core           | Sequence, SequenceVersion, Step, Enrollment, Draft, Send, Attempt, Thread, Reply, SendingIdentity, Mailbox, Domain, TransportIdentity, HealthState, KillSwitch, AIWritingProfile, ContentRuleSet, ConversationLock. None is built, and nothing sends. |

The tenant key is fixed to `ICS`, following the Factory rule of one deployment per client. It is recorded
on intake events and suppressions so a later multi-tenant data plane has it.

## 3. Module map (`apps/h2o/src/crm/`)

| File                      | Responsibility                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `vocabulary.ts`           | Every enum, each copied verbatim from its authority or marked as a CRM-1 operational taxonomy                                            |
| `ids.ts`                  | UUIDv7 and `rfq_number`                                                                                                                  |
| `normalize.ts`            | Email match key (lowercase only), domain normalisation, consumer-domain list, name and company keys (for flags only)                     |
| `access.ts`               | Access rules composed from the kernel roles, plus the bulk-export cap                                                                    |
| `guards.ts`               | Hook-level invariants: canonical id, write-once, append-only, delete refusal, server-owned fields, merged view                           |
| `collection.ts`           | `crmCollection()` wrapper, which applies the shared invariants to every CRM collection                                                   |
| `audit.ts`                | PII-safe audit entries in the existing `audit-log`                                                                                       |
| `activity.ts`, `tasks.ts` | Idempotent system timeline and task writers                                                                                              |
| `economics.ts`            | E3 amount, currency and revenue-truth rules and display                                                                                  |
| `suppression.ts`          | The one "may this address be emailed" gate. Fail-closed.                                                                                 |
| `identity.ts`             | Deterministic matching, plus the review opener (never merges)                                                                            |
| `intake/typeform/*`       | config (fail-closed), verify (HMAC), parse (map by ref), claim (atomic lease), ingest (orchestration), endpoint (unmounted HTTP adapter) |
| `overview.ts`, `admin/*`  | CRM Overview data and admin view, and the nav link                                                                                       |
| `collections/*`           | The 14 collections                                                                                                                       |
| `fixtures/synthetic.ts`   | Synthetic data only                                                                                                                      |

## 4. Enforcement layering

1. **Access** (`access.ts`). Governs REST, GraphQL (off by default) and the admin UI. Anonymous callers and
   non-CRM roles get `false`. No CRM rule returns a `Where` allow, except the author-scoped update on notes.
2. **Hooks** (`guards.ts` and each collection). Invariants that must hold even on the Local API with
   `overrideAccess: true`: identity, write-once, append-only, delete refusal, scope binding, economics,
   evidence rules and server-owned stamps. A violation throws a 4xx `CrmInvariantError`. It is rejected,
   never silently discarded.
3. **Database**:
   - unique indexes: `canonical_id`, `email_match_key`, `rfq_number`, `submission_key`,
     `(source_system, source_event_id)`, `(opportunity, contact)`, `(rfq, line_no)`, and every
     `idempotency_key` and `dedupe_key`;
   - one atomic conditional `UPDATE … RETURNING` for the intake processing claim.

## 5. Persistence order (E0.1 §10)

1. Verify the signature on the raw bytes.
2. Store the intake event.
3. Create the RFQ. It is linked to nothing yet.
4. Create items.
5. Match or create the contact and match the account.
6. Open reviews.
7. Record tasks and activities.
8. Mark the event processed.

Notification is not a step: `notification_state = NOT_SENT_DISABLED_IN_CRM1`. A failure after step 2 marks
the event `FAILED_RETRYABLE` and returns 500. Every later step is idempotent, so a retry completes the work
exactly once.
