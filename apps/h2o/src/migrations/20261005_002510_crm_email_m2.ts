import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_email_messages_direction" AS ENUM('OUTBOUND', 'INBOUND');
  CREATE TYPE "public"."enum_crm_email_messages_status" AS ENUM('QUEUED', 'SENT', 'FAILED', 'NOT_SENT');
  ALTER TYPE "public"."enum_crm_activities_type" ADD VALUE 'EMAIL_REPLY';
  ALTER TYPE "public"."enum_crm_email_outbox_kind" ADD VALUE 'RFQ_REPLY';
  CREATE TABLE "crm_email_messages" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"direction" "enum_crm_email_messages_direction" NOT NULL,
  	"rfq_id" uuid NOT NULL,
  	"status" "enum_crm_email_messages_status" NOT NULL,
  	"status_code" varchar,
  	"author_id" uuid,
  	"from_address" varchar,
  	"to_address" varchar,
  	"reply_to" varchar,
  	"subject" varchar NOT NULL,
  	"body_text" varchar NOT NULL,
  	"body_html" varchar,
  	"message_id" varchar,
  	"in_reply_to" varchar,
  	"references" varchar,
  	"idempotency_key" varchar,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"sent_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_reply_tokens" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"token" varchar NOT NULL,
  	"rfq_id" uuid NOT NULL,
  	"issued_at" timestamp(3) with time zone NOT NULL,
  	"last_used_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"revoked_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "crm_email_outbox" ADD COLUMN "conversation_message_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_email_messages_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_reply_tokens_id" uuid;
  ALTER TABLE "crm_email_messages" ADD CONSTRAINT "crm_email_messages_rfq_id_crm_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."crm_rfqs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_email_messages" ADD CONSTRAINT "crm_email_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_reply_tokens" ADD CONSTRAINT "crm_reply_tokens_rfq_id_crm_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."crm_rfqs"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "crm_email_messages_canonical_id_idx" ON "crm_email_messages" USING btree ("canonical_id");
  CREATE INDEX "crm_email_messages_direction_idx" ON "crm_email_messages" USING btree ("direction");
  CREATE INDEX "crm_email_messages_rfq_idx" ON "crm_email_messages" USING btree ("rfq_id");
  CREATE INDEX "crm_email_messages_status_idx" ON "crm_email_messages" USING btree ("status");
  CREATE INDEX "crm_email_messages_author_idx" ON "crm_email_messages" USING btree ("author_id");
  CREATE UNIQUE INDEX "crm_email_messages_message_id_idx" ON "crm_email_messages" USING btree ("message_id");
  CREATE UNIQUE INDEX "crm_email_messages_idempotency_key_idx" ON "crm_email_messages" USING btree ("idempotency_key");
  CREATE INDEX "crm_email_messages_occurred_at_idx" ON "crm_email_messages" USING btree ("occurred_at");
  CREATE INDEX "crm_email_messages_updated_at_idx" ON "crm_email_messages" USING btree ("updated_at");
  CREATE INDEX "crm_email_messages_created_at_idx" ON "crm_email_messages" USING btree ("created_at");
  CREATE UNIQUE INDEX "crm_reply_tokens_canonical_id_idx" ON "crm_reply_tokens" USING btree ("canonical_id");
  CREATE UNIQUE INDEX "crm_reply_tokens_token_idx" ON "crm_reply_tokens" USING btree ("token");
  CREATE UNIQUE INDEX "crm_reply_tokens_rfq_idx" ON "crm_reply_tokens" USING btree ("rfq_id");
  CREATE INDEX "crm_reply_tokens_expires_at_idx" ON "crm_reply_tokens" USING btree ("expires_at");
  CREATE INDEX "crm_reply_tokens_updated_at_idx" ON "crm_reply_tokens" USING btree ("updated_at");
  CREATE INDEX "crm_reply_tokens_created_at_idx" ON "crm_reply_tokens" USING btree ("created_at");
  ALTER TABLE "crm_email_outbox" ADD CONSTRAINT "crm_email_outbox_conversation_message_id_crm_email_messages_id_fk" FOREIGN KEY ("conversation_message_id") REFERENCES "public"."crm_email_messages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_email_messages_fk" FOREIGN KEY ("crm_email_messages_id") REFERENCES "public"."crm_email_messages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_reply_tokens_fk" FOREIGN KEY ("crm_reply_tokens_id") REFERENCES "public"."crm_reply_tokens"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "crm_email_outbox_conversation_message_idx" ON "crm_email_outbox" USING btree ("conversation_message_id");
  CREATE INDEX "payload_locked_documents_rels_crm_email_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_email_messages_id");
  CREATE INDEX "payload_locked_documents_rels_crm_reply_tokens_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_reply_tokens_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_email_messages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_reply_tokens" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "crm_email_messages" CASCADE;
  DROP TABLE "crm_reply_tokens" CASCADE;
  ALTER TABLE "crm_email_outbox" DROP CONSTRAINT "crm_email_outbox_conversation_message_id_crm_email_messages_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_email_messages_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_reply_tokens_fk";
  
  ALTER TABLE "crm_activities" ALTER COLUMN "type" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_activities_type";
  CREATE TYPE "public"."enum_crm_activities_type" AS ENUM('NOTE_ADDED', 'CALL', 'MEETING', 'EMAIL_REFERENCE', 'REPLY_REFERENCE', 'DOCUMENT_REFERENCE', 'PROJECT_INTERACTION', 'INTAKE_RECEIVED', 'RFQ_CREATED', 'RFQ_STATUS_CHANGED', 'RFQ_ASSIGNED', 'OPPORTUNITY_CREATED', 'OPPORTUNITY_STAGE_CHANGED', 'OPPORTUNITY_OWNER_CHANGED', 'TASK_CREATED', 'TASK_COMPLETED', 'TASK_REASSIGNED', 'SUPPRESSION_RECORDED', 'SUPPRESSION_CLEARED', 'IDENTITY_REVIEW_OPENED', 'EMAIL_NOTIFICATION');
  ALTER TABLE "crm_activities" ALTER COLUMN "type" SET DATA TYPE "public"."enum_crm_activities_type" USING "type"::"public"."enum_crm_activities_type";
  ALTER TABLE "crm_email_outbox" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_email_outbox_kind";
  CREATE TYPE "public"."enum_crm_email_outbox_kind" AS ENUM('RFQ_SALES_ALERT', 'RFQ_CUSTOMER_ACK');
  ALTER TABLE "crm_email_outbox" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_crm_email_outbox_kind" USING "kind"::"public"."enum_crm_email_outbox_kind";
  DROP INDEX "crm_email_outbox_conversation_message_idx";
  DROP INDEX "payload_locked_documents_rels_crm_email_messages_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_reply_tokens_id_idx";
  ALTER TABLE "crm_email_outbox" DROP COLUMN "conversation_message_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_email_messages_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_reply_tokens_id";
  DROP TYPE "public"."enum_crm_email_messages_direction";
  DROP TYPE "public"."enum_crm_email_messages_status";`)
}
