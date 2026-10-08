import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * SHEET-SYNC-1 (additive, reversible): two plain tables owned by src/sheets (not Payload collections, so no Payload schema
 * change): the queue of RFQs to append to the Google Sheet (one row per RFQ id, with state, attempts, lease and the last error
 * CODE; no customer data) and a tiny key/value state (when the feature was first switched on, and the queue cursor).
 * Down drops exactly these.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "crm_sheet_appends" (
    "inquiry_id" text PRIMARY KEY,
    "state" text NOT NULL DEFAULT 'PENDING',
    "attempts" integer NOT NULL DEFAULT 0,
    "next_attempt_at" timestamp(3) with time zone,
    "lease_owner" text,
    "lease_until" timestamp(3) with time zone,
    "last_error_code" text,
    "appended_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone NOT NULL DEFAULT now()
  );
  CREATE INDEX "crm_sheet_appends_due_idx" ON "crm_sheet_appends" ("state", "next_attempt_at");
  CREATE TABLE "crm_sheet_state" (
    "key" text PRIMARY KEY,
    "value" text NOT NULL
  );`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "crm_sheet_state";
  DROP TABLE "crm_sheet_appends";`)
}
