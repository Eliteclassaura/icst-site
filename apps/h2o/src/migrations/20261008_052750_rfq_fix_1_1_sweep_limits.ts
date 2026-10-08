import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_crm_intake_events_processing_state" ADD VALUE 'FAILED_PERMANENT';
  ALTER TABLE "crm_intake_events" ADD COLUMN "sweep_attempts" numeric DEFAULT 0;
  ALTER TABLE "crm_intake_events" ADD COLUMN "last_sweep_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   -- rolling back keeps the given-up requests, still out of the sweeper's reach (failure_code SWEEP_GAVE_UP stays)
   UPDATE "crm_intake_events" SET "processing_state" = 'QUARANTINED_UNSUPPORTED' WHERE "processing_state" = 'FAILED_PERMANENT';
   ALTER TABLE "crm_intake_events" ALTER COLUMN "processing_state" SET DATA TYPE text;
  ALTER TABLE "crm_intake_events" ALTER COLUMN "processing_state" SET DEFAULT 'PROCESSING'::text;
  DROP TYPE "public"."enum_crm_intake_events_processing_state";
  CREATE TYPE "public"."enum_crm_intake_events_processing_state" AS ENUM('PROCESSING', 'PROCESSED', 'PROCESSED_WITH_REVIEW', 'DUPLICATE_OF_EXISTING_SUBMISSION', 'QUARANTINED_MALFORMED', 'QUARANTINED_UNSUPPORTED', 'FAILED_RETRYABLE', 'QUARANTINED_SPAM');
  ALTER TABLE "crm_intake_events" ALTER COLUMN "processing_state" SET DEFAULT 'PROCESSING'::"public"."enum_crm_intake_events_processing_state";
  ALTER TABLE "crm_intake_events" ALTER COLUMN "processing_state" SET DATA TYPE "public"."enum_crm_intake_events_processing_state" USING "processing_state"::"public"."enum_crm_intake_events_processing_state";
  ALTER TABLE "crm_intake_events" DROP COLUMN "sweep_attempts";
  ALTER TABLE "crm_intake_events" DROP COLUMN "last_sweep_at";`)
}
