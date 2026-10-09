import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_email_outbox" ADD COLUMN "resend_accepted_at" timestamp(3) with time zone;
  CREATE INDEX "crm_email_outbox_resend_accepted_at_idx" ON "crm_email_outbox" USING btree ("resend_accepted_at");`)
  // OVERVIEW-FIX-1 (review L03): an unconfirmed internal alert whose one resend was already accepted is handled. Its
  // status stays UNCERTAIN (history); it is only stamped, with the resend's sent time.
  await db.execute(sql`
   UPDATE "crm_email_outbox" o SET "resend_accepted_at" = r."sent_at"
   FROM "crm_email_outbox" r
   WHERE r."idempotency_key" = o."idempotency_key" || '#resend' AND r."status" = 'SENT' AND o."status" = 'UNCERTAIN' AND o."resend_accepted_at" IS NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "crm_email_outbox_resend_accepted_at_idx";
  ALTER TABLE "crm_email_outbox" DROP COLUMN IF EXISTS "resend_accepted_at";`)
}
