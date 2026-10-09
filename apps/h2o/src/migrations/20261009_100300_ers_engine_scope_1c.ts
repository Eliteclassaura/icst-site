import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_sequences_reply_mode" AS ENUM('NOT_SET', 'MONITORED', 'MANUAL');
  CREATE TYPE "public"."enum_crm_sequences_reply_coverage_days" AS ENUM('MON_FRI', 'EVERY_DAY');
  ALTER TABLE "crm_sequences" ADD COLUMN "reply_mode" "enum_crm_sequences_reply_mode" DEFAULT 'NOT_SET' NOT NULL;
  ALTER TABLE "crm_sequences" ADD COLUMN "reply_owner_id" uuid;
  ALTER TABLE "crm_sequences" ADD COLUMN "reply_coverage_days" "enum_crm_sequences_reply_coverage_days" DEFAULT 'MON_FRI';
  ALTER TABLE "crm_sequences" ADD COLUMN "reply_coverage_start_hour" numeric;
  ALTER TABLE "crm_sequences" ADD COLUMN "reply_coverage_end_hour" numeric;
  ALTER TABLE "crm_sequences" ADD COLUMN "reply_coverage_zone" varchar;
  ALTER TABLE "crm_sequences" ADD COLUMN "initial_batch" numeric;
  ALTER TABLE "crm_sequences" ADD COLUMN "reply_last_check_at" timestamp(3) with time zone;
  ALTER TABLE "crm_sequences" ADD COLUMN "reply_last_check_by_id" uuid;
  ALTER TABLE "crm_sequences" ADD CONSTRAINT "crm_sequences_reply_owner_id_users_id_fk" FOREIGN KEY ("reply_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_sequences" ADD CONSTRAINT "crm_sequences_reply_last_check_by_id_users_id_fk" FOREIGN KEY ("reply_last_check_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "crm_sequences_reply_mode_idx" ON "crm_sequences" USING btree ("reply_mode");
  CREATE INDEX "crm_sequences_reply_owner_idx" ON "crm_sequences" USING btree ("reply_owner_id");
  CREATE INDEX "crm_sequences_reply_last_check_by_idx" ON "crm_sequences" USING btree ("reply_last_check_by_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_sequences" DROP CONSTRAINT IF EXISTS "crm_sequences_reply_owner_id_users_id_fk";
  
  ALTER TABLE "crm_sequences" DROP CONSTRAINT IF EXISTS "crm_sequences_reply_last_check_by_id_users_id_fk";
  
  DROP INDEX IF EXISTS "crm_sequences_reply_mode_idx";
  DROP INDEX IF EXISTS "crm_sequences_reply_owner_idx";
  DROP INDEX IF EXISTS "crm_sequences_reply_last_check_by_idx";
  ALTER TABLE "crm_sequences" DROP COLUMN IF EXISTS "reply_mode";
  ALTER TABLE "crm_sequences" DROP COLUMN IF EXISTS "reply_owner_id";
  ALTER TABLE "crm_sequences" DROP COLUMN IF EXISTS "reply_coverage_days";
  ALTER TABLE "crm_sequences" DROP COLUMN IF EXISTS "reply_coverage_start_hour";
  ALTER TABLE "crm_sequences" DROP COLUMN IF EXISTS "reply_coverage_end_hour";
  ALTER TABLE "crm_sequences" DROP COLUMN IF EXISTS "reply_coverage_zone";
  ALTER TABLE "crm_sequences" DROP COLUMN IF EXISTS "initial_batch";
  ALTER TABLE "crm_sequences" DROP COLUMN IF EXISTS "reply_last_check_at";
  ALTER TABLE "crm_sequences" DROP COLUMN IF EXISTS "reply_last_check_by_id";
  DROP TYPE IF EXISTS "public"."enum_crm_sequences_reply_mode";
  DROP TYPE IF EXISTS "public"."enum_crm_sequences_reply_coverage_days";`)
}
