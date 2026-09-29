# CRM_BACKUP_RECOVERY_PLAN — H2O / ICS CRM

**Principle: the VPS is replaceable.** A full recovery must be possible from four things:

- **Git.** Source, migrations and generated types.
- **Postgres backups.** CRM, catalog, users and audit data.
- **External media storage.** Catalog uploads. CRM-1 adds no uploads.
- **The secret store.** Environment and secrets.

Nothing needed for recovery may live only on the server.

This is a design. No backup was taken, no production database was touched, and no secret was created.

## 1. What must be recoverable

| Asset                                                                  | Source of truth                  | Loss impact                                                                        |
| ---------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| CRM records (accounts, RFQs, opportunities, suppressions, audit…)      | Postgres                         | Commercial history lost. **Losing suppressions risks remailing opted-out people.** |
| Intake raw events                                                      | Postgres `crm_intake_events`     | Loses the evidence trail and replay ability                                        |
| Schema                                                                 | Git migrations                   | Reproducible                                                                       |
| Config and secrets (`PAYLOAD_SECRET`, `DATABASE_URI`, Typeform secret) | Secret store (owner input OI-09) | Service unavailable; sessions invalidated                                          |

## 2. Postgres backups

- **Daily logical dump.** `pg_dump -Fc`, taken with a read-only backup role, of the H2O database.
- **Continuous WAL archiving.** Recommended for point-in-time recovery once real RFQs arrive.
  - The target RPO is an owner input (OI-10). The proposal is ≤ 15 min with WAL, ≤ 24 h with dumps only.
- **Encryption.** Backups are encrypted at rest (e.g. `age` or restic) before leaving the host. Keys live
  in the secret store, never beside the backup.
- **Off-server copy.** An object-storage bucket on a different provider or account from the VPS, with
  write-only credentials on the server and deletion protected (object lock or versioning).
- **Retention (proposal, OI-11).**
  - Daily backups kept 14 days, weekly 8 weeks, monthly 12 months.
  - Audit and suppression are also retained under their own legal retention (E0.1: suppression is
    durable; any legally required deletion keeps a minimal suppression token).
- **Integrity.** Each backup has a SHA-256 recorded in a manifest. The latest manifest is verified before
  any prune.

## 3. Restore validation (must be tested, not assumed)

**Monthly drill, run by Commander:**

1. Provision a fresh, disposable host or container.
2. Restore the latest dump into an empty database.
3. Check out the tagged release, then run `pnpm install --frozen-lockfile` and `payload migrate:status`.
   Every migration should read _Ran_, with no pending ones.
4. Run the read-only checks:
   - row counts per `crm_*` table against the manifest;
   - `rfq_number` uniqueness;
   - suppression count greater than or equal to the last known count;
   - the most recent intake event timestamp.
5. Boot the admin against the restored database on a private host, and log in with a drill account.
6. Record the result in the ops ledger, then destroy the drill environment.

**Restore tooling is DEFERRED to Commander.** CRM-1 provides the checks as a list, not a script that
connects to any database.

## 4. Environment and secrets

- **Required variables.**
  - `DATABASE_URI` and `PAYLOAD_SECRET` fail closed at boot.
  - The Typeform intake variables fail closed at the handler.
- **Storage.** Secrets live in the deployment secret store (the Coolify environment, or the owner's
  choice) and are backed up separately from database backups.
  - A lost `PAYLOAD_SECRET` invalidates sessions and tokens but not data.
  - A lost Typeform secret means rotating it in Typeform and in the store together.
- **Secret rotation** is audited (E0.1 §12).

## 5. Migration rollback and deployment recovery

- **Before every schema-changing deploy.** Take a fresh backup, then run `migrate` as a separate,
  observed step before switching traffic.
- **On failure before traffic switches.** Payload's per-migration transaction rolls back automatically.
  Keep the old release running.
- **On failure after real writes.** Restore from the pre-deploy backup. Don't use DOWN: it destroys CRM
  data.
- **Code-only rollback.** Redeploy the previous tag. The additive CRM tables are harmless to older code.

## 6. Disaster restore (the VPS is lost)

1. Provision a new host from the deployment recipe.
2. Restore secrets from the secret store.
3. Restore the database from the off-server backup, running point-in-time recovery if WAL is available.
4. Restore media from external storage.
5. Deploy the tagged release and run the restore-validation checks.
6. Re-point DNS. DNS changes are owner-controlled and outside CRM-1.
7. Replay Typeform deliveries missed during the outage from Typeform's own response store. Intake is
   idempotent by event id and response token, so a replay cannot duplicate an RFQ.
