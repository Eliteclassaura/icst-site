import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_leads_sync_status" AS ENUM('pending', 'synced', 'failed', 'skipped');
  CREATE TYPE "public"."enum_rate_events_scope" AS ENUM('request', 'send', 'global', 'dedupe');
  CREATE TYPE "public"."enum_integrations_crm_provider" AS ENUM('none', 'mock', 'hubspot', 'pipedrive');
  ALTER TYPE "public"."enum_activities_type" ADD VALUE 'crm-sync';
  ALTER TYPE "public"."enum_activities_type" ADD VALUE 'notification';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'notifyOwner' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'crmSync' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'notifyOwner' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'crmSync' BEFORE 'schedulePublish';
  CREATE TABLE "rate_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"scope" "enum_rate_events_scope" NOT NULL,
  	"key" varchar NOT NULL,
  	"at" timestamp(3) with time zone NOT NULL
  );
  
  ALTER TABLE "leads" ADD COLUMN "sync_status" "enum_leads_sync_status" DEFAULT 'pending';
  ALTER TABLE "leads" ADD COLUMN "sync_provider" varchar;
  ALTER TABLE "leads" ADD COLUMN "sync_external_id" varchar;
  ALTER TABLE "leads" ADD COLUMN "sync_last_attempt_at" timestamp(3) with time zone;
  ALTER TABLE "leads" ADD COLUMN "sync_attempts" numeric DEFAULT 0;
  ALTER TABLE "leads" ADD COLUMN "sync_error" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "rate_events_id" uuid;
  ALTER TABLE "integrations" ADD COLUMN "crm_provider" "enum_integrations_crm_provider" DEFAULT 'mock';
  CREATE INDEX "rate_events_scope_idx" ON "rate_events" USING btree ("scope");
  CREATE INDEX "rate_events_key_idx" ON "rate_events" USING btree ("key");
  CREATE INDEX "rate_events_at_idx" ON "rate_events" USING btree ("at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_rate_events_fk" FOREIGN KEY ("rate_events_id") REFERENCES "public"."rate_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "leads_sync_sync_external_id_idx" ON "leads" USING btree ("sync_external_id");
  CREATE INDEX "payload_locked_documents_rels_rate_events_id_idx" ON "payload_locked_documents_rels" USING btree ("rate_events_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "rate_events" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "rate_events" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_rate_events_fk";
  
  ALTER TABLE "activities" ALTER COLUMN "type" SET DATA TYPE text;
  DROP TYPE "public"."enum_activities_type";
  CREATE TYPE "public"."enum_activities_type" AS ENUM('submission', 'email-sent', 'email-received', 'note', 'stage-change', 'task', 'score-change', 'ai-insight', 'import');
  ALTER TABLE "activities" ALTER COLUMN "type" SET DATA TYPE "public"."enum_activities_type" USING "type"::"public"."enum_activities_type";
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'sendMockEmail', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'sendMockEmail', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "leads_sync_sync_external_id_idx";
  DROP INDEX "payload_locked_documents_rels_rate_events_id_idx";
  ALTER TABLE "leads" DROP COLUMN "sync_status";
  ALTER TABLE "leads" DROP COLUMN "sync_provider";
  ALTER TABLE "leads" DROP COLUMN "sync_external_id";
  ALTER TABLE "leads" DROP COLUMN "sync_last_attempt_at";
  ALTER TABLE "leads" DROP COLUMN "sync_attempts";
  ALTER TABLE "leads" DROP COLUMN "sync_error";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "rate_events_id";
  ALTER TABLE "integrations" DROP COLUMN "crm_provider";
  DROP TYPE "public"."enum_leads_sync_status";
  DROP TYPE "public"."enum_rate_events_scope";
  DROP TYPE "public"."enum_integrations_crm_provider";`)
}
