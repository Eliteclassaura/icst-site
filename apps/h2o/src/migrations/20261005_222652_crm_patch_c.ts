/**
 * Patch C (additive; no data step):
 *   - crm_sending_profiles: email sending profiles (admin settings; the password column holds an AES-256-GCM sealed
 *     value under H2O_SETTINGS_KEY, never plain text);
 *   - crm_email_templates: T1–T6 templates (seeded unapproved by the app on first use, not by this migration);
 *   - crm_mail_cursor: the IMAP read position (hashed mailbox key);
 *   - users.crm_title (signature job title), users.mfa_stepup (step-up confirmation: session id + time);
 *   - crm_office_settings.phones_us / phones_th (signature phone numbers);
 *   - the outbox status SUPPRESSED_TEMPLATE.
 */
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_sending_profiles_preset" AS ENUM('GMAIL', 'STALWART', 'CUSTOM');
  CREATE TYPE "public"."enum_crm_sending_profiles_use" AS ENUM('TRANSACTIONAL', 'REVENUE');
  CREATE TYPE "public"."enum_crm_sending_profiles_last_check_state" AS ENUM('OK', 'FAILED');
  CREATE TYPE "public"."enum_crm_email_templates_purpose" AS ENUM('TRANSACTIONAL', 'MARKETING');
  ALTER TYPE "public"."enum_crm_email_outbox_status" ADD VALUE 'SUPPRESSED_TEMPLATE';
  CREATE TABLE "crm_sending_profiles" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"preset" "enum_crm_sending_profiles_preset" DEFAULT 'GMAIL' NOT NULL,
  	"use" "enum_crm_sending_profiles_use" DEFAULT 'TRANSACTIONAL' NOT NULL,
  	"active" boolean DEFAULT false,
  	"host" varchar NOT NULL,
  	"port" numeric DEFAULT 587 NOT NULL,
  	"tls_servername" varchar NOT NULL,
  	"username" varchar NOT NULL,
  	"password_sealed" varchar,
  	"password_set" boolean DEFAULT false,
  	"from_address" varchar NOT NULL,
  	"from_name" varchar,
  	"last_check_state" "enum_crm_sending_profiles_last_check_state",
  	"last_check_code" varchar,
  	"last_check_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_email_templates" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"purpose" "enum_crm_email_templates_purpose" DEFAULT 'TRANSACTIONAL' NOT NULL,
  	"locale" varchar DEFAULT 'en' NOT NULL,
  	"subject" varchar NOT NULL,
  	"body" varchar NOT NULL,
  	"version" numeric DEFAULT 1 NOT NULL,
  	"approved" boolean DEFAULT false,
  	"approved_hash" varchar,
  	"approved_by_id" uuid,
  	"approved_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_mail_cursor" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"key" varchar NOT NULL,
  	"uidvalidity" numeric NOT NULL,
  	"last_uid" numeric NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users" ADD COLUMN "crm_title" varchar;
  ALTER TABLE "users" ADD COLUMN "mfa_stepup" jsonb;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_sending_profiles_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_email_templates_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_mail_cursor_id" uuid;
  ALTER TABLE "crm_office_settings" ADD COLUMN "phones_us" varchar;
  ALTER TABLE "crm_office_settings" ADD COLUMN "phones_th" varchar;
  ALTER TABLE "crm_email_templates" ADD CONSTRAINT "crm_email_templates_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "crm_sending_profiles_canonical_id_idx" ON "crm_sending_profiles" USING btree ("canonical_id");
  CREATE INDEX "crm_sending_profiles_use_idx" ON "crm_sending_profiles" USING btree ("use");
  CREATE INDEX "crm_sending_profiles_active_idx" ON "crm_sending_profiles" USING btree ("active");
  CREATE INDEX "crm_sending_profiles_updated_at_idx" ON "crm_sending_profiles" USING btree ("updated_at");
  CREATE INDEX "crm_sending_profiles_created_at_idx" ON "crm_sending_profiles" USING btree ("created_at");
  CREATE UNIQUE INDEX "crm_email_templates_canonical_id_idx" ON "crm_email_templates" USING btree ("canonical_id");
  CREATE UNIQUE INDEX "crm_email_templates_code_idx" ON "crm_email_templates" USING btree ("code");
  CREATE INDEX "crm_email_templates_approved_idx" ON "crm_email_templates" USING btree ("approved");
  CREATE INDEX "crm_email_templates_approved_by_idx" ON "crm_email_templates" USING btree ("approved_by_id");
  CREATE INDEX "crm_email_templates_updated_at_idx" ON "crm_email_templates" USING btree ("updated_at");
  CREATE INDEX "crm_email_templates_created_at_idx" ON "crm_email_templates" USING btree ("created_at");
  CREATE UNIQUE INDEX "crm_mail_cursor_key_idx" ON "crm_mail_cursor" USING btree ("key");
  CREATE INDEX "crm_mail_cursor_updated_at_idx" ON "crm_mail_cursor" USING btree ("updated_at");
  CREATE INDEX "crm_mail_cursor_created_at_idx" ON "crm_mail_cursor" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_sending_profiles_fk" FOREIGN KEY ("crm_sending_profiles_id") REFERENCES "public"."crm_sending_profiles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_email_templates_fk" FOREIGN KEY ("crm_email_templates_id") REFERENCES "public"."crm_email_templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_mail_cursor_fk" FOREIGN KEY ("crm_mail_cursor_id") REFERENCES "public"."crm_mail_cursor"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_crm_sending_profiles_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_sending_profiles_id");
  CREATE INDEX "payload_locked_documents_rels_crm_email_templates_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_email_templates_id");
  CREATE INDEX "payload_locked_documents_rels_crm_mail_cursor_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_mail_cursor_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_sending_profiles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_email_templates" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_mail_cursor" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "crm_sending_profiles" CASCADE;
  DROP TABLE "crm_email_templates" CASCADE;
  DROP TABLE "crm_mail_cursor" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_sending_profiles_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_email_templates_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_mail_cursor_fk";
  
  ALTER TABLE "crm_email_outbox" ALTER COLUMN "status" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_email_outbox_status";
  CREATE TYPE "public"."enum_crm_email_outbox_status" AS ENUM('PENDING', 'SENDING', 'RETRY', 'SENT', 'DEAD', 'SUPPRESSED_BY_MODE', 'SUPPRESSED_BY_SUPPRESSION', 'SUPPRESSED_ACK_DISABLED', 'SUPPRESSED_NO_RECIPIENT');
  ALTER TABLE "crm_email_outbox" ALTER COLUMN "status" SET DATA TYPE "public"."enum_crm_email_outbox_status" USING "status"::"public"."enum_crm_email_outbox_status";
  DROP INDEX "payload_locked_documents_rels_crm_sending_profiles_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_email_templates_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_mail_cursor_id_idx";
  ALTER TABLE "users" DROP COLUMN "crm_title";
  ALTER TABLE "users" DROP COLUMN "mfa_stepup";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_sending_profiles_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_email_templates_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_mail_cursor_id";
  ALTER TABLE "crm_office_settings" DROP COLUMN "phones_us";
  ALTER TABLE "crm_office_settings" DROP COLUMN "phones_th";
  DROP TYPE "public"."enum_crm_sending_profiles_preset";
  DROP TYPE "public"."enum_crm_sending_profiles_use";
  DROP TYPE "public"."enum_crm_sending_profiles_last_check_state";
  DROP TYPE "public"."enum_crm_email_templates_purpose";`)
}
