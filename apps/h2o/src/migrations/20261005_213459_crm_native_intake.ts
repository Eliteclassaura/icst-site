import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Native RFQ intake (owner decision 2026-10-05: our own form and corner chat replace Typeform at launch). Additive only:
 *   - the source enums (RFQs, intake events, and every provenance.source_system) gain NATIVE_FORM and NATIVE_CHAT;
 *   - intake events gain the signature state FORM_TOKEN_VERIFIED (the native signed timing token);
 *   - `crm_intake_rate`: rate-limit counts keyed by HMAC buckets (no IP or email address is ever stored).
 * No data step.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_crm_accounts_provenance_source_system" ADD VALUE 'NATIVE_FORM' BEFORE 'MANUAL_ENTRY';
  ALTER TYPE "public"."enum_crm_accounts_provenance_source_system" ADD VALUE 'NATIVE_CHAT' BEFORE 'MANUAL_ENTRY';
  ALTER TYPE "public"."enum_crm_contacts_provenance_source_system" ADD VALUE 'NATIVE_FORM' BEFORE 'MANUAL_ENTRY';
  ALTER TYPE "public"."enum_crm_contacts_provenance_source_system" ADD VALUE 'NATIVE_CHAT' BEFORE 'MANUAL_ENTRY';
  ALTER TYPE "public"."enum_crm_sites_provenance_source_system" ADD VALUE 'NATIVE_FORM' BEFORE 'MANUAL_ENTRY';
  ALTER TYPE "public"."enum_crm_sites_provenance_source_system" ADD VALUE 'NATIVE_CHAT' BEFORE 'MANUAL_ENTRY';
  ALTER TYPE "public"."enum_crm_assets_provenance_source_system" ADD VALUE 'NATIVE_FORM' BEFORE 'MANUAL_ENTRY';
  ALTER TYPE "public"."enum_crm_assets_provenance_source_system" ADD VALUE 'NATIVE_CHAT' BEFORE 'MANUAL_ENTRY';
  ALTER TYPE "public"."enum_crm_opportunities_provenance_source_system" ADD VALUE 'NATIVE_FORM' BEFORE 'MANUAL_ENTRY';
  ALTER TYPE "public"."enum_crm_opportunities_provenance_source_system" ADD VALUE 'NATIVE_CHAT' BEFORE 'MANUAL_ENTRY';
  ALTER TYPE "public"."enum_crm_buying_group_members_provenance_source_system" ADD VALUE 'NATIVE_FORM' BEFORE 'MANUAL_ENTRY';
  ALTER TYPE "public"."enum_crm_buying_group_members_provenance_source_system" ADD VALUE 'NATIVE_CHAT' BEFORE 'MANUAL_ENTRY';
  ALTER TYPE "public"."enum_crm_rfqs_source_system" ADD VALUE 'NATIVE_FORM' BEFORE 'MANUAL_ENTRY';
  ALTER TYPE "public"."enum_crm_rfqs_source_system" ADD VALUE 'NATIVE_CHAT' BEFORE 'MANUAL_ENTRY';
  ALTER TYPE "public"."enum_crm_rfq_items_provenance_source_system" ADD VALUE 'NATIVE_FORM' BEFORE 'MANUAL_ENTRY';
  ALTER TYPE "public"."enum_crm_rfq_items_provenance_source_system" ADD VALUE 'NATIVE_CHAT' BEFORE 'MANUAL_ENTRY';
  ALTER TYPE "public"."enum_crm_activities_provenance_source_system" ADD VALUE 'NATIVE_FORM' BEFORE 'MANUAL_ENTRY';
  ALTER TYPE "public"."enum_crm_activities_provenance_source_system" ADD VALUE 'NATIVE_CHAT' BEFORE 'MANUAL_ENTRY';
  ALTER TYPE "public"."enum_crm_intake_events_source_system" ADD VALUE 'NATIVE_FORM';
  ALTER TYPE "public"."enum_crm_intake_events_source_system" ADD VALUE 'NATIVE_CHAT';
  ALTER TYPE "public"."enum_crm_intake_events_signature_state" ADD VALUE 'FORM_TOKEN_VERIFIED';
  CREATE TABLE "crm_intake_rate" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"bucket" varchar NOT NULL,
  	"at" timestamp(3) with time zone NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_intake_rate_id" uuid;
  CREATE INDEX "crm_intake_rate_bucket_idx" ON "crm_intake_rate" USING btree ("bucket");
  CREATE INDEX "crm_intake_rate_at_idx" ON "crm_intake_rate" USING btree ("at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_intake_rate_fk" FOREIGN KEY ("crm_intake_rate_id") REFERENCES "public"."crm_intake_rate"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_crm_intake_rate_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_intake_rate_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_intake_rate" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "crm_intake_rate" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_intake_rate_fk";
  
  ALTER TABLE "crm_accounts" ALTER COLUMN "provenance_source_system" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_accounts_provenance_source_system";
  CREATE TYPE "public"."enum_crm_accounts_provenance_source_system" AS ENUM('TYPEFORM', 'MANUAL_ENTRY', 'LEGACY_IMPORT', 'SYSTEM_DERIVED', 'SYNTHETIC_FIXTURE', 'UNKNOWN');
  ALTER TABLE "crm_accounts" ALTER COLUMN "provenance_source_system" SET DATA TYPE "public"."enum_crm_accounts_provenance_source_system" USING "provenance_source_system"::"public"."enum_crm_accounts_provenance_source_system";
  ALTER TABLE "crm_contacts" ALTER COLUMN "provenance_source_system" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_contacts_provenance_source_system";
  CREATE TYPE "public"."enum_crm_contacts_provenance_source_system" AS ENUM('TYPEFORM', 'MANUAL_ENTRY', 'LEGACY_IMPORT', 'SYSTEM_DERIVED', 'SYNTHETIC_FIXTURE', 'UNKNOWN');
  ALTER TABLE "crm_contacts" ALTER COLUMN "provenance_source_system" SET DATA TYPE "public"."enum_crm_contacts_provenance_source_system" USING "provenance_source_system"::"public"."enum_crm_contacts_provenance_source_system";
  ALTER TABLE "crm_sites" ALTER COLUMN "provenance_source_system" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_sites_provenance_source_system";
  CREATE TYPE "public"."enum_crm_sites_provenance_source_system" AS ENUM('TYPEFORM', 'MANUAL_ENTRY', 'LEGACY_IMPORT', 'SYSTEM_DERIVED', 'SYNTHETIC_FIXTURE', 'UNKNOWN');
  ALTER TABLE "crm_sites" ALTER COLUMN "provenance_source_system" SET DATA TYPE "public"."enum_crm_sites_provenance_source_system" USING "provenance_source_system"::"public"."enum_crm_sites_provenance_source_system";
  ALTER TABLE "crm_assets" ALTER COLUMN "provenance_source_system" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_assets_provenance_source_system";
  CREATE TYPE "public"."enum_crm_assets_provenance_source_system" AS ENUM('TYPEFORM', 'MANUAL_ENTRY', 'LEGACY_IMPORT', 'SYSTEM_DERIVED', 'SYNTHETIC_FIXTURE', 'UNKNOWN');
  ALTER TABLE "crm_assets" ALTER COLUMN "provenance_source_system" SET DATA TYPE "public"."enum_crm_assets_provenance_source_system" USING "provenance_source_system"::"public"."enum_crm_assets_provenance_source_system";
  ALTER TABLE "crm_opportunities" ALTER COLUMN "provenance_source_system" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_opportunities_provenance_source_system";
  CREATE TYPE "public"."enum_crm_opportunities_provenance_source_system" AS ENUM('TYPEFORM', 'MANUAL_ENTRY', 'LEGACY_IMPORT', 'SYSTEM_DERIVED', 'SYNTHETIC_FIXTURE', 'UNKNOWN');
  ALTER TABLE "crm_opportunities" ALTER COLUMN "provenance_source_system" SET DATA TYPE "public"."enum_crm_opportunities_provenance_source_system" USING "provenance_source_system"::"public"."enum_crm_opportunities_provenance_source_system";
  ALTER TABLE "crm_buying_group_members" ALTER COLUMN "provenance_source_system" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_buying_group_members_provenance_source_system";
  CREATE TYPE "public"."enum_crm_buying_group_members_provenance_source_system" AS ENUM('TYPEFORM', 'MANUAL_ENTRY', 'LEGACY_IMPORT', 'SYSTEM_DERIVED', 'SYNTHETIC_FIXTURE', 'UNKNOWN');
  ALTER TABLE "crm_buying_group_members" ALTER COLUMN "provenance_source_system" SET DATA TYPE "public"."enum_crm_buying_group_members_provenance_source_system" USING "provenance_source_system"::"public"."enum_crm_buying_group_members_provenance_source_system";
  ALTER TABLE "crm_rfqs" ALTER COLUMN "source_system" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_rfqs_source_system";
  CREATE TYPE "public"."enum_crm_rfqs_source_system" AS ENUM('TYPEFORM', 'MANUAL_ENTRY', 'LEGACY_IMPORT', 'SYSTEM_DERIVED', 'SYNTHETIC_FIXTURE', 'UNKNOWN');
  ALTER TABLE "crm_rfqs" ALTER COLUMN "source_system" SET DATA TYPE "public"."enum_crm_rfqs_source_system" USING "source_system"::"public"."enum_crm_rfqs_source_system";
  ALTER TABLE "crm_rfq_items" ALTER COLUMN "provenance_source_system" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_rfq_items_provenance_source_system";
  CREATE TYPE "public"."enum_crm_rfq_items_provenance_source_system" AS ENUM('TYPEFORM', 'MANUAL_ENTRY', 'LEGACY_IMPORT', 'SYSTEM_DERIVED', 'SYNTHETIC_FIXTURE', 'UNKNOWN');
  ALTER TABLE "crm_rfq_items" ALTER COLUMN "provenance_source_system" SET DATA TYPE "public"."enum_crm_rfq_items_provenance_source_system" USING "provenance_source_system"::"public"."enum_crm_rfq_items_provenance_source_system";
  ALTER TABLE "crm_activities" ALTER COLUMN "provenance_source_system" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_activities_provenance_source_system";
  CREATE TYPE "public"."enum_crm_activities_provenance_source_system" AS ENUM('TYPEFORM', 'MANUAL_ENTRY', 'LEGACY_IMPORT', 'SYSTEM_DERIVED', 'SYNTHETIC_FIXTURE', 'UNKNOWN');
  ALTER TABLE "crm_activities" ALTER COLUMN "provenance_source_system" SET DATA TYPE "public"."enum_crm_activities_provenance_source_system" USING "provenance_source_system"::"public"."enum_crm_activities_provenance_source_system";
  ALTER TABLE "crm_intake_events" ALTER COLUMN "source_system" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_intake_events_source_system";
  CREATE TYPE "public"."enum_crm_intake_events_source_system" AS ENUM('TYPEFORM');
  ALTER TABLE "crm_intake_events" ALTER COLUMN "source_system" SET DATA TYPE "public"."enum_crm_intake_events_source_system" USING "source_system"::"public"."enum_crm_intake_events_source_system";
  ALTER TABLE "crm_intake_events" ALTER COLUMN "signature_state" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_intake_events_signature_state";
  CREATE TYPE "public"."enum_crm_intake_events_signature_state" AS ENUM('VERIFIED');
  ALTER TABLE "crm_intake_events" ALTER COLUMN "signature_state" SET DATA TYPE "public"."enum_crm_intake_events_signature_state" USING "signature_state"::"public"."enum_crm_intake_events_signature_state";
  DROP INDEX "payload_locked_documents_rels_crm_intake_rate_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_intake_rate_id";`)
}
