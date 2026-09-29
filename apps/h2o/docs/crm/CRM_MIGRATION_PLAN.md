# CRM_MIGRATION_PLAN — H2O / ICS CRM-1

## Source added

| File                                                           | SHA-256                                            | Origin                                                                                                                                    |
| -------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/h2o/src/migrations/20260925_011109_crm1_foundation.ts`   | `3ad259ea…2e70` (full hash in `CHANGED_FILES.tsv`) | `payload migrate:create crm1_foundation`, then prettier. **UP is byte-identical to the generator's output.** DOWN has one reorder, below. |
| `apps/h2o/src/migrations/20260925_011109_crm1_foundation.json` | `adf18d14…46bf`                                    | Generator snapshot, untouched                                                                                                             |
| `apps/h2o/src/migrations/index.ts` (modified)                  | `485992c8…91a8`                                    | The generator appends one entry; prettier formats it. The three prior entries are unchanged.                                              |

All accepted migrations (`20260912_202131`, `20260913_012440`, `20260914_133257_…`) are **unedited**.

## What UP does

| Statement                                                                |               Count |
| ------------------------------------------------------------------------ | ------------------: |
| `CREATE TYPE`                                                            | 78 (CRM enums only) |
| `CREATE TABLE`                                                           |                  21 |
| `CREATE UNIQUE INDEX`                                                    |                  23 |
| `CREATE INDEX`                                                           |                 194 |
| `ADD CONSTRAINT` (FKs)                                                   |                  79 |
| `ALTER TABLE "payload_locked_documents_rels" ADD COLUMN` (nullable uuid) |                  14 |
| `DROP` / `ALTER COLUMN` / data rewrite                                   |               **0** |

- **Tables.** One per collection, plus array and rel tables:
  - `crm_accounts` (+ `_aliases`, `_domains`), `crm_contacts` (+ `_phones`), `crm_sites`;
  - `crm_assets` (+ `_technical_evidence`, `_known_dates`), `crm_opportunities` (+ `_rels`);
  - `crm_buying_group_members`, `crm_rfqs`, `crm_rfq_items`, `crm_activities`, `crm_notes`,
    `crm_tasks`, `crm_suppressions`;
  - `crm_intake_events` (+ `_conflicting_deliveries`), `crm_identity_reviews`.
- **Unique indexes.** `canonical_id` on every entity, plus `email_match_key`, `rfq_number`,
  `submission_key`, `idempotency_key` (activities and tasks), `dedupe_key`, and the compound indexes
  `(opportunity, contact)`, `(rfq, line_no)` and `(source_system, source_event_id)`.
- **The only change to an existing table** is the 14 nullable columns and FKs Payload adds to
  `payload_locked_documents_rels`, which it does for every new collection. No existing row is touched.
- **FK behaviour.** This is Payload's default, `ON DELETE SET NULL` for relationships. CRM deletes are
  refused in hooks, so these FKs only act if a _user_ or a _product_ is deleted. Deleting a user nulls
  owner and assignee, which leaves visible "unassigned" work rather than orphaned rows.

## DOWN — one reorder (generator defect)

The generated DOWN ran `DROP TABLE crm_* CASCADE` first and then
`ALTER TABLE payload_locked_documents_rels DROP CONSTRAINT …_crm_*_fk`. CASCADE had already removed those
FKs, so the DOWN failed and rolled back (measured).

The CRM-1 file moves the 42 `payload_locked_documents_rels` statements (constraints, indexes and columns)
before the table drops, with a comment. No `IF EXISTS` was added.

The same defect exists in the accepted `20260913_012440` DOWN. It was observed while testing and **was not
edited**; it is reported in `CONTROL_TOWER_REPORT.md`.

## Measured in the Factory (isolated synthetic Postgres 16.13, `127.0.0.1:55432`)

| Gate                                      | Result                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline 3 migrations from zero           | PASS                                                                                                                                  |
| `migrate:create --skip-empty` on baseline | no file emitted (no pre-existing drift)                                                                                               |
| CRM migration from zero (4 migrations)    | PASS                                                                                                                                  |
| `migrate:create --skip-empty` after CRM   | no file emitted (schema equals config)                                                                                                |
| UP → DOWN → UP, with CRM as its own batch | PASS. After DOWN, `pg_dump --schema-only` is **identical** to the baseline-only database.                                             |
| `generate:types`                          | Regenerated. For existing collections, the only change is `collectionsJoins: {}` becoming populated; all other changes are additions. |

## Ordering and dependencies

- The migration runs after `20260914_133257_delete_provenance_fk_restrict`.
- It needs the foundation tables `users` and `payload_locked_documents_rels`, and the catalog table
  `products` (RFQ items relate to it).
- There is no agency-core or syed.ai schema dependency. The syed-ai migration set is untouched.

## Rollback considerations

- DOWN drops every CRM table, which means **all CRM data**. After any real use, rollback is a
  _restore-from-backup_ decision (`CRM_BACKUP_RECOVERY_PLAN.md`), not a routine DOWN.
- Rollback of application code without a DOWN is safe: the extra tables are simply unused.
- The compound index names are generic (`opportunity_contact_idx`, `rfq_line_no_idx`,
  `source_system_source_event_id_idx`). Postgres index names are schema-global, so a future collection with
  the same compound fields would collide. This was noted rather than renamed, because renaming means
  hand-editing generated UP.

## Commander-native gates still required

1. Run `pnpm install --frozen-lockfile` and `payload migrate` on a **fresh native staging-like database**
   created by Commander, never on the live staging DB without authorization.
2. Upgrade an existing database that holds realistic synthetic catalog rows, and confirm no data rewrite
   (row snapshot before and after).
3. Run `migrate:down` on that database with CRM as its own batch, and compare the schema dump to the
   pre-CRM one.
4. Run the `test:crm-db` suite against Commander's isolated database.
5. Before any real use, record a backup taken immediately before running the migration.
