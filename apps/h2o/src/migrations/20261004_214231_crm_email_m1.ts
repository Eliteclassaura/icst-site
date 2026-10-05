import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_email_outbox_kind" AS ENUM('RFQ_SALES_ALERT', 'RFQ_CUSTOMER_ACK');
  CREATE TYPE "public"."enum_crm_email_outbox_status" AS ENUM('PENDING', 'SENDING', 'RETRY', 'SENT', 'DEAD', 'SUPPRESSED_BY_MODE', 'SUPPRESSED_BY_SUPPRESSION', 'SUPPRESSED_ACK_DISABLED', 'SUPPRESSED_NO_RECIPIENT');
  CREATE TYPE "public"."enum_crm_email_events_event" AS ENUM('QUEUED', 'SUPPRESSED', 'SENT', 'ATTEMPT_FAILED', 'DEAD_LETTERED', 'DIRECT_SENT', 'DIRECT_SUPPRESSED', 'DIRECT_FAILED');
  ALTER TYPE "public"."enum_crm_activities_type" ADD VALUE 'EMAIL_NOTIFICATION';
  CREATE TABLE "crm_email_outbox" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"kind" "enum_crm_email_outbox_kind" NOT NULL,
  	"status" "enum_crm_email_outbox_status" NOT NULL,
  	"rfq_id" uuid,
  	"recipient_ref" varchar NOT NULL,
  	"to_address" varchar,
  	"subject" varchar,
  	"body_text" varchar,
  	"body_html" varchar,
  	"message_id" varchar,
  	"attempts" numeric DEFAULT 0 NOT NULL,
  	"next_attempt_at" timestamp(3) with time zone,
  	"lease_until" timestamp(3) with time zone,
  	"last_error_code" varchar,
  	"sent_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_email_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"event" "enum_crm_email_events_event" NOT NULL,
  	"kind" varchar NOT NULL,
  	"code" varchar,
  	"outbox_id" uuid,
  	"rfq_id" uuid,
  	"recipient_ref" varchar,
  	"attempt" numeric,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_email_outbox_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_email_events_id" uuid;
  ALTER TABLE "crm_email_outbox" ADD CONSTRAINT "crm_email_outbox_rfq_id_crm_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."crm_rfqs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_email_events" ADD CONSTRAINT "crm_email_events_outbox_id_crm_email_outbox_id_fk" FOREIGN KEY ("outbox_id") REFERENCES "public"."crm_email_outbox"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_email_events" ADD CONSTRAINT "crm_email_events_rfq_id_crm_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."crm_rfqs"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "crm_email_outbox_canonical_id_idx" ON "crm_email_outbox" USING btree ("canonical_id");
  CREATE UNIQUE INDEX "crm_email_outbox_idempotency_key_idx" ON "crm_email_outbox" USING btree ("idempotency_key");
  CREATE INDEX "crm_email_outbox_kind_idx" ON "crm_email_outbox" USING btree ("kind");
  CREATE INDEX "crm_email_outbox_status_idx" ON "crm_email_outbox" USING btree ("status");
  CREATE INDEX "crm_email_outbox_rfq_idx" ON "crm_email_outbox" USING btree ("rfq_id");
  CREATE INDEX "crm_email_outbox_recipient_ref_idx" ON "crm_email_outbox" USING btree ("recipient_ref");
  CREATE UNIQUE INDEX "crm_email_outbox_message_id_idx" ON "crm_email_outbox" USING btree ("message_id");
  CREATE INDEX "crm_email_outbox_next_attempt_at_idx" ON "crm_email_outbox" USING btree ("next_attempt_at");
  CREATE INDEX "crm_email_outbox_updated_at_idx" ON "crm_email_outbox" USING btree ("updated_at");
  CREATE INDEX "crm_email_outbox_created_at_idx" ON "crm_email_outbox" USING btree ("created_at");
  CREATE UNIQUE INDEX "crm_email_events_canonical_id_idx" ON "crm_email_events" USING btree ("canonical_id");
  CREATE INDEX "crm_email_events_event_idx" ON "crm_email_events" USING btree ("event");
  CREATE INDEX "crm_email_events_kind_idx" ON "crm_email_events" USING btree ("kind");
  CREATE INDEX "crm_email_events_outbox_idx" ON "crm_email_events" USING btree ("outbox_id");
  CREATE INDEX "crm_email_events_rfq_idx" ON "crm_email_events" USING btree ("rfq_id");
  CREATE INDEX "crm_email_events_recipient_ref_idx" ON "crm_email_events" USING btree ("recipient_ref");
  CREATE INDEX "crm_email_events_occurred_at_idx" ON "crm_email_events" USING btree ("occurred_at");
  CREATE INDEX "crm_email_events_updated_at_idx" ON "crm_email_events" USING btree ("updated_at");
  CREATE INDEX "crm_email_events_created_at_idx" ON "crm_email_events" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_email_outbox_fk" FOREIGN KEY ("crm_email_outbox_id") REFERENCES "public"."crm_email_outbox"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_email_events_fk" FOREIGN KEY ("crm_email_events_id") REFERENCES "public"."crm_email_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_crm_email_outbox_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_email_outbox_id");
  CREATE INDEX "payload_locked_documents_rels_crm_email_events_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_email_events_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_email_outbox" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_email_events" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "crm_email_outbox" CASCADE;
  DROP TABLE "crm_email_events" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_email_outbox_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_email_events_fk";
  
  ALTER TABLE "crm_activities" ALTER COLUMN "type" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_activities_type";
  CREATE TYPE "public"."enum_crm_activities_type" AS ENUM('NOTE_ADDED', 'CALL', 'MEETING', 'EMAIL_REFERENCE', 'REPLY_REFERENCE', 'DOCUMENT_REFERENCE', 'PROJECT_INTERACTION', 'INTAKE_RECEIVED', 'RFQ_CREATED', 'RFQ_STATUS_CHANGED', 'RFQ_ASSIGNED', 'OPPORTUNITY_CREATED', 'OPPORTUNITY_STAGE_CHANGED', 'OPPORTUNITY_OWNER_CHANGED', 'TASK_CREATED', 'TASK_COMPLETED', 'TASK_REASSIGNED', 'SUPPRESSION_RECORDED', 'SUPPRESSION_CLEARED', 'IDENTITY_REVIEW_OPENED');
  ALTER TABLE "crm_activities" ALTER COLUMN "type" SET DATA TYPE "public"."enum_crm_activities_type" USING "type"::"public"."enum_crm_activities_type";
  DROP INDEX "payload_locked_documents_rels_crm_email_outbox_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_email_events_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_email_outbox_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_email_events_id";
  DROP TYPE "public"."enum_crm_email_outbox_kind";
  DROP TYPE "public"."enum_crm_email_outbox_status";
  DROP TYPE "public"."enum_crm_email_events_event";`)
}
