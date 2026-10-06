/**
 * Revenue Engine slice 1 (additive; no data step — the E1.1 sequences and templates are seeded by the app on first use):
 *   - crm_sequences, crm_sequence_versions (+ steps), crm_enrollments (+ missing items), the crm_ers_settings global;
 *   - crm_email_outbox: enrollment, step_key, recipient_domain, lint, approval_decision, bounced_at, reply_to,
 *     list_unsubscribe;
 *   - enum values: VERIFIED_THAILAND (jurisdiction), SEQUENCE_EVENT (activity), SEQUENCE_STEP / SEQUENCE_REVIEW (task),
 *     SEQUENCE_EMAIL (outbox kind), SEQUENCE (template purpose).
 */
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_email_outbox_approval_decision" AS ENUM('AUTO_AUTHORIZED', 'BLOCKED');
  CREATE TYPE "public"."enum_crm_sequences_language" AS ENUM('EN', 'JA', 'TH');
  CREATE TYPE "public"."enum_crm_sequences_message_purpose" AS ENUM('ACCOUNT_RELATIONSHIP', 'SEQUENCE_OUTREACH');
  CREATE TYPE "public"."enum_crm_sequences_run_state" AS ENUM('DRAFT', 'ACTIVE', 'PAUSED', 'RETIRED');
  CREATE TYPE "public"."enum_crm_sequences_approval_mode" AS ENUM('AUTO', 'REQUIRED');
  CREATE TYPE "public"."enum_crm_sequences_compliance_address_footer" AS ENUM('INHERIT', 'ON', 'OFF');
  CREATE TYPE "public"."enum_crm_sequences_compliance_business_hours" AS ENUM('INHERIT', 'ON', 'OFF');
  CREATE TYPE "public"."enum_crm_sequences_compliance_warmup" AS ENUM('INHERIT', 'ON', 'OFF');
  CREATE TYPE "public"."enum_crm_sequence_versions_steps_type" AS ENUM('EMAIL', 'WAIT', 'TASK');
  CREATE TYPE "public"."enum_crm_sequence_versions_state" AS ENUM('DRAFT', 'PUBLISHED', 'RETIRED');
  CREATE TYPE "public"."enum_crm_enrollments_missing_items" AS ENUM('DESIGN_SPECIFICATION', 'PROJECT_SCHEDULE', 'DRAWINGS', 'TOWER_TYPE', 'CELL_COUNT', 'MODEL_SERIAL', 'DESIGN_CONDITIONS', 'SITE_LOCATION', 'QUANTITIES', 'PHOTOS');
  CREATE TYPE "public"."enum_crm_enrollments_enrolled_via" AS ENUM('MANUAL', 'SAVED_VIEW');
  CREATE TYPE "public"."enum_crm_enrollments_status" AS ENUM('ACTIVE', 'AWAITING_SEND', 'PAUSED', 'COMPLETED', 'EXITED', 'DEAD_LETTER');
  CREATE TYPE "public"."enum_crm_enrollments_pause_reason" AS ENUM('SEQUENCE_PAUSED', 'LINT_HOLD', 'RENDER_HOLD', 'MANUAL');
  CREATE TYPE "public"."enum_crm_enrollments_exit_reason" AS ENUM('REPLIED', 'RFQ_SUBMITTED', 'RFQ_CLOSED', 'RFQ_QUALIFIED', 'OWNER_RESPONDED', 'UNSUBSCRIBED', 'BOUNCED', 'COMPLAINT', 'SUPPRESSED', 'MANUAL_STOP');
  CREATE TYPE "public"."enum_crm_ers_settings_health_state" AS ENUM('ACTIVE', 'PAUSED');
  ALTER TYPE "public"."enum_crm_contacts_jurisdiction" ADD VALUE 'VERIFIED_THAILAND' BEFORE 'VERIFIED_OTHER';
  ALTER TYPE "public"."enum_crm_activities_type" ADD VALUE 'SEQUENCE_EVENT';
  ALTER TYPE "public"."enum_crm_tasks_kind" ADD VALUE 'SEQUENCE_STEP';
  ALTER TYPE "public"."enum_crm_tasks_kind" ADD VALUE 'SEQUENCE_REVIEW';
  ALTER TYPE "public"."enum_crm_email_outbox_kind" ADD VALUE 'SEQUENCE_EMAIL';
  ALTER TYPE "public"."enum_crm_email_templates_purpose" ADD VALUE 'SEQUENCE';
  CREATE TABLE "crm_sequences" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"key" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"language" "enum_crm_sequences_language" DEFAULT 'EN' NOT NULL,
  	"message_purpose" "enum_crm_sequences_message_purpose" DEFAULT 'ACCOUNT_RELATIONSHIP' NOT NULL,
  	"run_state" "enum_crm_sequences_run_state" DEFAULT 'DRAFT' NOT NULL,
  	"published_version_id" uuid,
  	"approval_mode" "enum_crm_sequences_approval_mode" DEFAULT 'AUTO' NOT NULL,
  	"needs_missing_items" boolean DEFAULT false,
  	"compliance_address_footer" "enum_crm_sequences_compliance_address_footer" DEFAULT 'INHERIT',
  	"compliance_business_hours" "enum_crm_sequences_compliance_business_hours" DEFAULT 'INHERIT',
  	"compliance_warmup" "enum_crm_sequences_compliance_warmup" DEFAULT 'INHERIT',
  	"paused_reason" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_sequence_versions_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"step_key" varchar NOT NULL,
  	"type" "enum_crm_sequence_versions_steps_type" NOT NULL,
  	"template_id" uuid,
  	"template_hash" varchar,
  	"business_days" numeric,
  	"task_title" varchar,
  	"task_due_days" numeric
  );
  
  CREATE TABLE "crm_sequence_versions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"sequence_id" uuid NOT NULL,
  	"version_number" numeric NOT NULL,
  	"state" "enum_crm_sequence_versions_state" DEFAULT 'DRAFT' NOT NULL,
  	"definition_hash" varchar,
  	"rule_set_sha" varchar,
  	"published_at" timestamp(3) with time zone,
  	"published_by_id" uuid,
  	"retired_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_enrollments_missing_items" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum_crm_enrollments_missing_items",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "crm_enrollments" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"coalesce_key" varchar NOT NULL,
  	"sequence_id" uuid NOT NULL,
  	"version_id" uuid NOT NULL,
  	"contact_id" uuid NOT NULL,
  	"rfq_id" uuid NOT NULL,
  	"account_id" uuid,
  	"owner_id" uuid,
  	"enrolled_by_id" uuid,
  	"enrolled_via" "enum_crm_enrollments_enrolled_via" NOT NULL,
  	"saved_view_id" uuid,
  	"cohort_hash" varchar,
  	"status" "enum_crm_enrollments_status" DEFAULT 'ACTIVE' NOT NULL,
  	"current_step" numeric DEFAULT 0 NOT NULL,
  	"next_action_at" timestamp(3) with time zone,
  	"last_step_at" timestamp(3) with time zone,
  	"enrolled_at" timestamp(3) with time zone NOT NULL,
  	"pause_reason" "enum_crm_enrollments_pause_reason",
  	"hold_code" varchar,
  	"exit_reason" "enum_crm_enrollments_exit_reason",
  	"exited_at" timestamp(3) with time zone,
  	"awaiting_outbox_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_ers_settings" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"enabled" boolean DEFAULT false,
  	"daily_cap" numeric DEFAULT 55,
  	"domain_daily_cap" numeric DEFAULT 5,
  	"domain_hourly_cap" numeric DEFAULT 2,
  	"window_start_hour" numeric DEFAULT 9,
  	"window_end_hour" numeric DEFAULT 17,
  	"warmup_schedule" varchar DEFAULT '10,20,30,40,50,55',
  	"warmup_step_business_days" numeric DEFAULT 5,
  	"warmup_started_on" timestamp(3) with time zone,
  	"compliance_address_footer" boolean DEFAULT true,
  	"compliance_business_hours" boolean DEFAULT true,
  	"compliance_warmup" boolean DEFAULT true,
  	"postal_address" varchar,
  	"signature_signer" varchar DEFAULT 'ICS Sales Team',
  	"signature_include_office_phone" boolean DEFAULT true,
  	"signature_email" varchar DEFAULT 'sales@h2ocooling.org',
  	"health_state" "enum_crm_ers_settings_health_state" DEFAULT 'ACTIVE',
  	"health_reason" varchar,
  	"health_changed_at" timestamp(3) with time zone,
  	"bounce_pause_ratio" numeric DEFAULT 0.05,
  	"bounce_warn_ratio" numeric DEFAULT 0.02,
  	"min_sends_for_ratio" numeric DEFAULT 20,
  	"inbound_last_ok_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "crm_email_outbox" ADD COLUMN "enrollment_id" uuid;
  ALTER TABLE "crm_email_outbox" ADD COLUMN "step_key" varchar;
  ALTER TABLE "crm_email_outbox" ADD COLUMN "recipient_domain" varchar;
  ALTER TABLE "crm_email_outbox" ADD COLUMN "lint" jsonb;
  ALTER TABLE "crm_email_outbox" ADD COLUMN "approval_decision" "enum_crm_email_outbox_approval_decision";
  ALTER TABLE "crm_email_outbox" ADD COLUMN "bounced_at" timestamp(3) with time zone;
  ALTER TABLE "crm_email_outbox" ADD COLUMN "reply_to" varchar;
  ALTER TABLE "crm_email_outbox" ADD COLUMN "list_unsubscribe" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_sequences_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_sequence_versions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_enrollments_id" uuid;
  ALTER TABLE "crm_sequences" ADD CONSTRAINT "crm_sequences_published_version_id_crm_sequence_versions_id_fk" FOREIGN KEY ("published_version_id") REFERENCES "public"."crm_sequence_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_sequence_versions_steps" ADD CONSTRAINT "crm_sequence_versions_steps_template_id_crm_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."crm_email_templates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_sequence_versions_steps" ADD CONSTRAINT "crm_sequence_versions_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."crm_sequence_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "crm_sequence_versions" ADD CONSTRAINT "crm_sequence_versions_sequence_id_crm_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."crm_sequences"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_sequence_versions" ADD CONSTRAINT "crm_sequence_versions_published_by_id_users_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_enrollments_missing_items" ADD CONSTRAINT "crm_enrollments_missing_items_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."crm_enrollments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "crm_enrollments" ADD CONSTRAINT "crm_enrollments_sequence_id_crm_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."crm_sequences"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_enrollments" ADD CONSTRAINT "crm_enrollments_version_id_crm_sequence_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."crm_sequence_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_enrollments" ADD CONSTRAINT "crm_enrollments_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_enrollments" ADD CONSTRAINT "crm_enrollments_rfq_id_crm_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."crm_rfqs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_enrollments" ADD CONSTRAINT "crm_enrollments_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_enrollments" ADD CONSTRAINT "crm_enrollments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_enrollments" ADD CONSTRAINT "crm_enrollments_enrolled_by_id_users_id_fk" FOREIGN KEY ("enrolled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_enrollments" ADD CONSTRAINT "crm_enrollments_saved_view_id_crm_saved_views_id_fk" FOREIGN KEY ("saved_view_id") REFERENCES "public"."crm_saved_views"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_enrollments" ADD CONSTRAINT "crm_enrollments_awaiting_outbox_id_crm_email_outbox_id_fk" FOREIGN KEY ("awaiting_outbox_id") REFERENCES "public"."crm_email_outbox"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "crm_sequences_canonical_id_idx" ON "crm_sequences" USING btree ("canonical_id");
  CREATE UNIQUE INDEX "crm_sequences_key_idx" ON "crm_sequences" USING btree ("key");
  CREATE INDEX "crm_sequences_run_state_idx" ON "crm_sequences" USING btree ("run_state");
  CREATE INDEX "crm_sequences_published_version_idx" ON "crm_sequences" USING btree ("published_version_id");
  CREATE INDEX "crm_sequences_updated_at_idx" ON "crm_sequences" USING btree ("updated_at");
  CREATE INDEX "crm_sequences_created_at_idx" ON "crm_sequences" USING btree ("created_at");
  CREATE INDEX "crm_sequence_versions_steps_order_idx" ON "crm_sequence_versions_steps" USING btree ("_order");
  CREATE INDEX "crm_sequence_versions_steps_parent_id_idx" ON "crm_sequence_versions_steps" USING btree ("_parent_id");
  CREATE INDEX "crm_sequence_versions_steps_template_idx" ON "crm_sequence_versions_steps" USING btree ("template_id");
  CREATE UNIQUE INDEX "crm_sequence_versions_canonical_id_idx" ON "crm_sequence_versions" USING btree ("canonical_id");
  CREATE INDEX "crm_sequence_versions_sequence_idx" ON "crm_sequence_versions" USING btree ("sequence_id");
  CREATE INDEX "crm_sequence_versions_state_idx" ON "crm_sequence_versions" USING btree ("state");
  CREATE INDEX "crm_sequence_versions_definition_hash_idx" ON "crm_sequence_versions" USING btree ("definition_hash");
  CREATE INDEX "crm_sequence_versions_published_by_idx" ON "crm_sequence_versions" USING btree ("published_by_id");
  CREATE INDEX "crm_sequence_versions_updated_at_idx" ON "crm_sequence_versions" USING btree ("updated_at");
  CREATE INDEX "crm_sequence_versions_created_at_idx" ON "crm_sequence_versions" USING btree ("created_at");
  CREATE INDEX "crm_enrollments_missing_items_order_idx" ON "crm_enrollments_missing_items" USING btree ("order");
  CREATE INDEX "crm_enrollments_missing_items_parent_idx" ON "crm_enrollments_missing_items" USING btree ("parent_id");
  CREATE UNIQUE INDEX "crm_enrollments_canonical_id_idx" ON "crm_enrollments" USING btree ("canonical_id");
  CREATE UNIQUE INDEX "crm_enrollments_coalesce_key_idx" ON "crm_enrollments" USING btree ("coalesce_key");
  CREATE INDEX "crm_enrollments_sequence_idx" ON "crm_enrollments" USING btree ("sequence_id");
  CREATE INDEX "crm_enrollments_version_idx" ON "crm_enrollments" USING btree ("version_id");
  CREATE INDEX "crm_enrollments_contact_idx" ON "crm_enrollments" USING btree ("contact_id");
  CREATE INDEX "crm_enrollments_rfq_idx" ON "crm_enrollments" USING btree ("rfq_id");
  CREATE INDEX "crm_enrollments_account_idx" ON "crm_enrollments" USING btree ("account_id");
  CREATE INDEX "crm_enrollments_owner_idx" ON "crm_enrollments" USING btree ("owner_id");
  CREATE INDEX "crm_enrollments_enrolled_by_idx" ON "crm_enrollments" USING btree ("enrolled_by_id");
  CREATE INDEX "crm_enrollments_saved_view_idx" ON "crm_enrollments" USING btree ("saved_view_id");
  CREATE INDEX "crm_enrollments_status_idx" ON "crm_enrollments" USING btree ("status");
  CREATE INDEX "crm_enrollments_next_action_at_idx" ON "crm_enrollments" USING btree ("next_action_at");
  CREATE INDEX "crm_enrollments_exit_reason_idx" ON "crm_enrollments" USING btree ("exit_reason");
  CREATE INDEX "crm_enrollments_awaiting_outbox_idx" ON "crm_enrollments" USING btree ("awaiting_outbox_id");
  CREATE INDEX "crm_enrollments_updated_at_idx" ON "crm_enrollments" USING btree ("updated_at");
  CREATE INDEX "crm_enrollments_created_at_idx" ON "crm_enrollments" USING btree ("created_at");
  ALTER TABLE "crm_email_outbox" ADD CONSTRAINT "crm_email_outbox_enrollment_id_crm_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."crm_enrollments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_sequences_fk" FOREIGN KEY ("crm_sequences_id") REFERENCES "public"."crm_sequences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_sequence_versions_fk" FOREIGN KEY ("crm_sequence_versions_id") REFERENCES "public"."crm_sequence_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_enrollments_fk" FOREIGN KEY ("crm_enrollments_id") REFERENCES "public"."crm_enrollments"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "crm_email_outbox_sent_at_idx" ON "crm_email_outbox" USING btree ("sent_at");
  CREATE INDEX "crm_email_outbox_enrollment_idx" ON "crm_email_outbox" USING btree ("enrollment_id");
  CREATE INDEX "crm_email_outbox_recipient_domain_idx" ON "crm_email_outbox" USING btree ("recipient_domain");
  CREATE INDEX "crm_email_outbox_bounced_at_idx" ON "crm_email_outbox" USING btree ("bounced_at");
  CREATE INDEX "payload_locked_documents_rels_crm_sequences_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_sequences_id");
  CREATE INDEX "payload_locked_documents_rels_crm_sequence_versions_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_sequence_versions_id");
  CREATE INDEX "payload_locked_documents_rels_crm_enrollments_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_enrollments_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_sequences" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_sequence_versions_steps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_sequence_versions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_enrollments_missing_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_enrollments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_ers_settings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "crm_sequences" CASCADE;
  DROP TABLE "crm_sequence_versions_steps" CASCADE;
  DROP TABLE "crm_sequence_versions" CASCADE;
  DROP TABLE "crm_enrollments_missing_items" CASCADE;
  DROP TABLE "crm_enrollments" CASCADE;
  DROP TABLE "crm_ers_settings" CASCADE;
  ALTER TABLE "crm_email_outbox" DROP CONSTRAINT "crm_email_outbox_enrollment_id_crm_enrollments_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_sequences_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_sequence_versions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_enrollments_fk";
  
  ALTER TABLE "crm_contacts" ALTER COLUMN "jurisdiction" SET DATA TYPE text;
  ALTER TABLE "crm_contacts" ALTER COLUMN "jurisdiction" SET DEFAULT 'COUNTRY_UNKNOWN'::text;
  DROP TYPE "public"."enum_crm_contacts_jurisdiction";
  CREATE TYPE "public"."enum_crm_contacts_jurisdiction" AS ENUM('VERIFIED_US', 'VERIFIED_JAPAN', 'VERIFIED_MALAYSIA', 'VERIFIED_VIETNAM', 'VERIFIED_OTHER', 'COUNTRY_UNKNOWN', 'LEGAL_REVIEW_REQUIRED');
  ALTER TABLE "crm_contacts" ALTER COLUMN "jurisdiction" SET DEFAULT 'COUNTRY_UNKNOWN'::"public"."enum_crm_contacts_jurisdiction";
  ALTER TABLE "crm_contacts" ALTER COLUMN "jurisdiction" SET DATA TYPE "public"."enum_crm_contacts_jurisdiction" USING "jurisdiction"::"public"."enum_crm_contacts_jurisdiction";
  ALTER TABLE "crm_activities" ALTER COLUMN "type" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_activities_type";
  CREATE TYPE "public"."enum_crm_activities_type" AS ENUM('NOTE_ADDED', 'CALL', 'MEETING', 'EMAIL_REFERENCE', 'REPLY_REFERENCE', 'DOCUMENT_REFERENCE', 'PROJECT_INTERACTION', 'INTAKE_RECEIVED', 'RFQ_CREATED', 'RFQ_STATUS_CHANGED', 'RFQ_ASSIGNED', 'OPPORTUNITY_CREATED', 'OPPORTUNITY_STAGE_CHANGED', 'OPPORTUNITY_OWNER_CHANGED', 'TASK_CREATED', 'TASK_COMPLETED', 'TASK_REASSIGNED', 'SUPPRESSION_RECORDED', 'SUPPRESSION_CLEARED', 'IDENTITY_REVIEW_OPENED', 'EMAIL_NOTIFICATION', 'EMAIL_REPLY', 'EMAIL_RECEIVED');
  ALTER TABLE "crm_activities" ALTER COLUMN "type" SET DATA TYPE "public"."enum_crm_activities_type" USING "type"::"public"."enum_crm_activities_type";
  ALTER TABLE "crm_tasks" ALTER COLUMN "kind" SET DATA TYPE text;
  ALTER TABLE "crm_tasks" ALTER COLUMN "kind" SET DEFAULT 'GENERAL'::text;
  DROP TYPE "public"."enum_crm_tasks_kind";
  CREATE TYPE "public"."enum_crm_tasks_kind" AS ENUM('RFQ_FIRST_RESPONSE', 'FOLLOW_UP', 'MISSING_INFORMATION', 'IDENTITY_REVIEW', 'INTAKE_REVIEW', 'GENERAL');
  ALTER TABLE "crm_tasks" ALTER COLUMN "kind" SET DEFAULT 'GENERAL'::"public"."enum_crm_tasks_kind";
  ALTER TABLE "crm_tasks" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_crm_tasks_kind" USING "kind"::"public"."enum_crm_tasks_kind";
  ALTER TABLE "crm_email_outbox" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_email_outbox_kind";
  CREATE TYPE "public"."enum_crm_email_outbox_kind" AS ENUM('RFQ_SALES_ALERT', 'RFQ_CUSTOMER_ACK', 'RFQ_REPLY');
  ALTER TABLE "crm_email_outbox" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_crm_email_outbox_kind" USING "kind"::"public"."enum_crm_email_outbox_kind";
  ALTER TABLE "crm_email_templates" ALTER COLUMN "purpose" SET DATA TYPE text;
  ALTER TABLE "crm_email_templates" ALTER COLUMN "purpose" SET DEFAULT 'TRANSACTIONAL'::text;
  DROP TYPE "public"."enum_crm_email_templates_purpose";
  CREATE TYPE "public"."enum_crm_email_templates_purpose" AS ENUM('TRANSACTIONAL', 'MARKETING');
  ALTER TABLE "crm_email_templates" ALTER COLUMN "purpose" SET DEFAULT 'TRANSACTIONAL'::"public"."enum_crm_email_templates_purpose";
  ALTER TABLE "crm_email_templates" ALTER COLUMN "purpose" SET DATA TYPE "public"."enum_crm_email_templates_purpose" USING "purpose"::"public"."enum_crm_email_templates_purpose";
  DROP INDEX "crm_email_outbox_sent_at_idx";
  DROP INDEX "crm_email_outbox_enrollment_idx";
  DROP INDEX "crm_email_outbox_recipient_domain_idx";
  DROP INDEX "crm_email_outbox_bounced_at_idx";
  DROP INDEX "payload_locked_documents_rels_crm_sequences_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_sequence_versions_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_enrollments_id_idx";
  ALTER TABLE "crm_email_outbox" DROP COLUMN "enrollment_id";
  ALTER TABLE "crm_email_outbox" DROP COLUMN "step_key";
  ALTER TABLE "crm_email_outbox" DROP COLUMN "recipient_domain";
  ALTER TABLE "crm_email_outbox" DROP COLUMN "lint";
  ALTER TABLE "crm_email_outbox" DROP COLUMN "approval_decision";
  ALTER TABLE "crm_email_outbox" DROP COLUMN "bounced_at";
  ALTER TABLE "crm_email_outbox" DROP COLUMN "reply_to";
  ALTER TABLE "crm_email_outbox" DROP COLUMN "list_unsubscribe";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_sequences_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_sequence_versions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_enrollments_id";
  DROP TYPE "public"."enum_crm_email_outbox_approval_decision";
  DROP TYPE "public"."enum_crm_sequences_language";
  DROP TYPE "public"."enum_crm_sequences_message_purpose";
  DROP TYPE "public"."enum_crm_sequences_run_state";
  DROP TYPE "public"."enum_crm_sequences_approval_mode";
  DROP TYPE "public"."enum_crm_sequences_compliance_address_footer";
  DROP TYPE "public"."enum_crm_sequences_compliance_business_hours";
  DROP TYPE "public"."enum_crm_sequences_compliance_warmup";
  DROP TYPE "public"."enum_crm_sequence_versions_steps_type";
  DROP TYPE "public"."enum_crm_sequence_versions_state";
  DROP TYPE "public"."enum_crm_enrollments_missing_items";
  DROP TYPE "public"."enum_crm_enrollments_enrolled_via";
  DROP TYPE "public"."enum_crm_enrollments_status";
  DROP TYPE "public"."enum_crm_enrollments_pause_reason";
  DROP TYPE "public"."enum_crm_enrollments_exit_reason";
  DROP TYPE "public"."enum_crm_ers_settings_health_state";`)
}
