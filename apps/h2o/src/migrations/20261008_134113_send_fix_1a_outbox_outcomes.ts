import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_crm_email_outbox_kind" ADD VALUE 'MFA_CODE';
  ALTER TYPE "public"."enum_crm_email_outbox_kind" ADD VALUE 'INTAKE_FAILED_ALERT';
  ALTER TYPE "public"."enum_crm_email_outbox_status" ADD VALUE 'SUBMITTING';
  ALTER TYPE "public"."enum_crm_email_outbox_status" ADD VALUE 'UNCERTAIN';
  ALTER TYPE "public"."enum_crm_email_events_event" ADD VALUE 'SUBMITTED';
  ALTER TYPE "public"."enum_crm_email_events_event" ADD VALUE 'UNCERTAIN';
  ALTER TABLE "crm_ers_settings" ALTER COLUMN "signature_email" SET DEFAULT 'sales@h2ocooling.com';
  ALTER TABLE "crm_email_outbox" ADD COLUMN "lease_owner" varchar;
  ALTER TABLE "crm_email_outbox" ADD COLUMN "attempt_identity" jsonb;
  ALTER TABLE "crm_email_outbox" ADD COLUMN "submitted_at" timestamp(3) with time zone;
  ALTER TABLE "crm_email_outbox" ADD COLUMN "accepted_response" varchar;
  ALTER TABLE "crm_email_outbox" ADD COLUMN "recipient_results" jsonb;`)
  // Owner 2026-10-08: the sales address is sales@h2ocooling.com everywhere. Only the old default value is changed; an
  // address an admin typed in stays as it is.
  await db.execute(sql`UPDATE "crm_ers_settings" SET "signature_email" = 'sales@h2ocooling.com' WHERE "signature_email" = 'sales@h2ocooling.org';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Rolling back never makes held mail sendable: SUBMITTING / UNCERTAIN rows become DEAD (terminal, never retried), with
  // their reason kept; the two new event kinds become ATTEMPT_FAILED with a code that says which they were. Rows of the
  // two new kinds would block the type change, so they become DEAD RFQ_SALES_ALERT records with the old kind in the code.
  await db.execute(sql`
   UPDATE "crm_email_outbox" SET "status" = 'DEAD', "last_error_code" = LEFT('ROLLBACK_' || "status"::text || '_' || COALESCE("last_error_code", ''), 60) WHERE "status" IN ('SUBMITTING', 'UNCERTAIN');
   UPDATE "crm_email_outbox" SET "status" = 'DEAD', "last_error_code" = LEFT('ROLLBACK_' || "kind"::text, 60), "kind" = 'RFQ_SALES_ALERT' WHERE "kind" IN ('MFA_CODE', 'INTAKE_FAILED_ALERT');
   UPDATE "crm_email_events" SET "event" = 'ATTEMPT_FAILED', "code" = LEFT('ROLLBACK_' || "event"::text || '_' || COALESCE("code", ''), 60) WHERE "event" IN ('SUBMITTED', 'UNCERTAIN');
   ALTER TABLE "crm_email_outbox" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE IF EXISTS "public"."enum_crm_email_outbox_kind";
  CREATE TYPE "public"."enum_crm_email_outbox_kind" AS ENUM('RFQ_SALES_ALERT', 'RFQ_CUSTOMER_ACK', 'RFQ_REPLY', 'SEQUENCE_EMAIL');
  ALTER TABLE "crm_email_outbox" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_crm_email_outbox_kind" USING "kind"::"public"."enum_crm_email_outbox_kind";
  ALTER TABLE "crm_email_outbox" ALTER COLUMN "status" SET DATA TYPE text;
  DROP TYPE IF EXISTS "public"."enum_crm_email_outbox_status";
  CREATE TYPE "public"."enum_crm_email_outbox_status" AS ENUM('PENDING', 'SENDING', 'RETRY', 'SENT', 'DEAD', 'SUPPRESSED_BY_MODE', 'SUPPRESSED_BY_SUPPRESSION', 'SUPPRESSED_ACK_DISABLED', 'SUPPRESSED_NO_RECIPIENT', 'SUPPRESSED_TEMPLATE');
  ALTER TABLE "crm_email_outbox" ALTER COLUMN "status" SET DATA TYPE "public"."enum_crm_email_outbox_status" USING "status"::"public"."enum_crm_email_outbox_status";
  ALTER TABLE "crm_email_events" ALTER COLUMN "event" SET DATA TYPE text;
  DROP TYPE IF EXISTS "public"."enum_crm_email_events_event";
  CREATE TYPE "public"."enum_crm_email_events_event" AS ENUM('QUEUED', 'SUPPRESSED', 'SENT', 'ATTEMPT_FAILED', 'DEAD_LETTERED', 'DIRECT_SENT', 'DIRECT_SUPPRESSED', 'DIRECT_FAILED');
  ALTER TABLE "crm_email_events" ALTER COLUMN "event" SET DATA TYPE "public"."enum_crm_email_events_event" USING "event"::"public"."enum_crm_email_events_event";
  ALTER TABLE "crm_ers_settings" ALTER COLUMN "signature_email" SET DEFAULT 'sales@h2ocooling.org';
  ALTER TABLE "crm_email_outbox" DROP COLUMN IF EXISTS "lease_owner";
  ALTER TABLE "crm_email_outbox" DROP COLUMN IF EXISTS "attempt_identity";
  ALTER TABLE "crm_email_outbox" DROP COLUMN IF EXISTS "submitted_at";
  ALTER TABLE "crm_email_outbox" DROP COLUMN IF EXISTS "accepted_response";
  ALTER TABLE "crm_email_outbox" DROP COLUMN IF EXISTS "recipient_results";`)
}
