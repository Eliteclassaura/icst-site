import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_email_review_reason" AS ENUM('NO_TOKEN', 'UNKNOWN_TOKEN', 'EXPIRED_TOKEN', 'MULTIPLE_TOKENS', 'AUTO_SUBMITTED', 'BULK', 'SPAM', 'OWN_ADDRESS', 'PROCESSING_FAILED');
  CREATE TYPE "public"."enum_crm_email_review_state" AS ENUM('OPEN', 'LINKED', 'DISCARDED');
  ALTER TYPE "public"."enum_crm_activities_type" ADD VALUE 'EMAIL_RECEIVED';
  ALTER TYPE "public"."enum_crm_email_messages_status" ADD VALUE 'RECEIVED';
  CREATE TABLE "crm_email_review" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"reason" "enum_crm_email_review_reason" NOT NULL,
  	"state" "enum_crm_email_review_state" DEFAULT 'OPEN' NOT NULL,
  	"source_ref" varchar NOT NULL,
  	"from_address" varchar,
  	"from_name" varchar,
  	"to_addresses" varchar,
  	"subject" varchar,
  	"body_text" varchar,
  	"message_id" varchar,
  	"in_reply_to" varchar,
  	"references" varchar,
  	"received_at" timestamp(3) with time zone NOT NULL,
  	"attachments_withheld" jsonb,
  	"rfq_id" uuid,
  	"resolved_by_id" uuid,
  	"resolved_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "crm_email_messages" ADD COLUMN "from_name" varchar;
  ALTER TABLE "crm_email_messages" ADD COLUMN "source_ref" varchar;
  ALTER TABLE "crm_email_messages" ADD COLUMN "attachments_withheld" jsonb;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_email_review_id" uuid;
  ALTER TABLE "crm_email_review" ADD CONSTRAINT "crm_email_review_rfq_id_crm_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."crm_rfqs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_email_review" ADD CONSTRAINT "crm_email_review_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "crm_email_review_canonical_id_idx" ON "crm_email_review" USING btree ("canonical_id");
  CREATE INDEX "crm_email_review_reason_idx" ON "crm_email_review" USING btree ("reason");
  CREATE INDEX "crm_email_review_state_idx" ON "crm_email_review" USING btree ("state");
  CREATE UNIQUE INDEX "crm_email_review_source_ref_idx" ON "crm_email_review" USING btree ("source_ref");
  CREATE INDEX "crm_email_review_message_id_idx" ON "crm_email_review" USING btree ("message_id");
  CREATE INDEX "crm_email_review_received_at_idx" ON "crm_email_review" USING btree ("received_at");
  CREATE INDEX "crm_email_review_rfq_idx" ON "crm_email_review" USING btree ("rfq_id");
  CREATE INDEX "crm_email_review_resolved_by_idx" ON "crm_email_review" USING btree ("resolved_by_id");
  CREATE INDEX "crm_email_review_updated_at_idx" ON "crm_email_review" USING btree ("updated_at");
  CREATE INDEX "crm_email_review_created_at_idx" ON "crm_email_review" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_email_review_fk" FOREIGN KEY ("crm_email_review_id") REFERENCES "public"."crm_email_review"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "crm_email_messages_source_ref_idx" ON "crm_email_messages" USING btree ("source_ref");
  CREATE INDEX "payload_locked_documents_rels_crm_email_review_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_email_review_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_email_review" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "crm_email_review" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_email_review_fk";
  
  ALTER TABLE "crm_activities" ALTER COLUMN "type" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_activities_type";
  CREATE TYPE "public"."enum_crm_activities_type" AS ENUM('NOTE_ADDED', 'CALL', 'MEETING', 'EMAIL_REFERENCE', 'REPLY_REFERENCE', 'DOCUMENT_REFERENCE', 'PROJECT_INTERACTION', 'INTAKE_RECEIVED', 'RFQ_CREATED', 'RFQ_STATUS_CHANGED', 'RFQ_ASSIGNED', 'OPPORTUNITY_CREATED', 'OPPORTUNITY_STAGE_CHANGED', 'OPPORTUNITY_OWNER_CHANGED', 'TASK_CREATED', 'TASK_COMPLETED', 'TASK_REASSIGNED', 'SUPPRESSION_RECORDED', 'SUPPRESSION_CLEARED', 'IDENTITY_REVIEW_OPENED', 'EMAIL_NOTIFICATION', 'EMAIL_REPLY');
  ALTER TABLE "crm_activities" ALTER COLUMN "type" SET DATA TYPE "public"."enum_crm_activities_type" USING "type"::"public"."enum_crm_activities_type";
  ALTER TABLE "crm_email_messages" ALTER COLUMN "status" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_email_messages_status";
  CREATE TYPE "public"."enum_crm_email_messages_status" AS ENUM('QUEUED', 'SENT', 'FAILED', 'NOT_SENT');
  ALTER TABLE "crm_email_messages" ALTER COLUMN "status" SET DATA TYPE "public"."enum_crm_email_messages_status" USING "status"::"public"."enum_crm_email_messages_status";
  DROP INDEX "crm_email_messages_source_ref_idx";
  DROP INDEX "payload_locked_documents_rels_crm_email_review_id_idx";
  ALTER TABLE "crm_email_messages" DROP COLUMN "from_name";
  ALTER TABLE "crm_email_messages" DROP COLUMN "source_ref";
  ALTER TABLE "crm_email_messages" DROP COLUMN "attachments_withheld";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_email_review_id";
  DROP TYPE "public"."enum_crm_email_review_reason";
  DROP TYPE "public"."enum_crm_email_review_state";`)
}
