import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_historical_inquiries_source" AS ENUM('TYPEFORM_LEGACY');
  CREATE TYPE "public"."enum_crm_historical_inquiries_state" AS ENUM('HISTORICAL_CLOSED_UNKNOWN');
  CREATE TYPE "public"."enum_crm_historical_inquiries_record_state" AS ENUM('ACTIVE', 'ARCHIVED', 'MERGED');
  CREATE TYPE "public"."enum_crm_historical_inquiries_urgent" AS ENUM('YES', 'NO', 'UNKNOWN');
  CREATE TABLE "crm_historical_inquiries" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"contact_id" uuid NOT NULL,
  	"account_id" uuid,
  	"source" "enum_crm_historical_inquiries_source" DEFAULT 'TYPEFORM_LEGACY' NOT NULL,
  	"state" "enum_crm_historical_inquiries_state" DEFAULT 'HISTORICAL_CLOSED_UNKNOWN' NOT NULL,
  	"record_state" "enum_crm_historical_inquiries_record_state" DEFAULT 'ACTIVE' NOT NULL,
  	"typeform_token" varchar NOT NULL,
  	"content_sha256" varchar NOT NULL,
  	"submitted_at" timestamp(3) with time zone NOT NULL,
  	"submitted_zone" varchar NOT NULL,
  	"interest" varchar,
  	"part" varchar,
  	"details" varchar,
  	"urgent" "enum_crm_historical_inquiries_urgent" DEFAULT 'UNKNOWN',
  	"destination_country" varchar,
  	"notes" varchar,
  	"upload_url" varchar,
  	"cut_fields" jsonb,
  	"file_sha256" varchar NOT NULL,
  	"import_batch_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_historical_inquiries_id" uuid;
  ALTER TABLE "crm_historical_inquiries" ADD CONSTRAINT "crm_historical_inquiries_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_historical_inquiries" ADD CONSTRAINT "crm_historical_inquiries_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_historical_inquiries" ADD CONSTRAINT "crm_historical_inquiries_import_batch_id_crm_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."crm_import_batches"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "crm_historical_inquiries_canonical_id_idx" ON "crm_historical_inquiries" USING btree ("canonical_id");
  CREATE INDEX "crm_historical_inquiries_contact_idx" ON "crm_historical_inquiries" USING btree ("contact_id");
  CREATE INDEX "crm_historical_inquiries_account_idx" ON "crm_historical_inquiries" USING btree ("account_id");
  CREATE INDEX "crm_historical_inquiries_record_state_idx" ON "crm_historical_inquiries" USING btree ("record_state");
  CREATE UNIQUE INDEX "crm_historical_inquiries_typeform_token_idx" ON "crm_historical_inquiries" USING btree ("typeform_token");
  CREATE INDEX "crm_historical_inquiries_submitted_at_idx" ON "crm_historical_inquiries" USING btree ("submitted_at");
  CREATE INDEX "crm_historical_inquiries_file_sha256_idx" ON "crm_historical_inquiries" USING btree ("file_sha256");
  CREATE INDEX "crm_historical_inquiries_import_batch_idx" ON "crm_historical_inquiries" USING btree ("import_batch_id");
  CREATE INDEX "crm_historical_inquiries_updated_at_idx" ON "crm_historical_inquiries" USING btree ("updated_at");
  CREATE INDEX "crm_historical_inquiries_created_at_idx" ON "crm_historical_inquiries" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_historical_inquiries_fk" FOREIGN KEY ("crm_historical_inquiries_id") REFERENCES "public"."crm_historical_inquiries"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_crm_historical_inquiries_i_idx" ON "payload_locked_documents_rels" USING btree ("crm_historical_inquiries_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE IF EXISTS "crm_historical_inquiries" DISABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS "crm_historical_inquiries" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_crm_historical_inquiries_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_crm_historical_inquiries_i_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "crm_historical_inquiries_id";
  DROP TYPE IF EXISTS "public"."enum_crm_historical_inquiries_source";
  DROP TYPE IF EXISTS "public"."enum_crm_historical_inquiries_state";
  DROP TYPE IF EXISTS "public"."enum_crm_historical_inquiries_record_state";
  DROP TYPE IF EXISTS "public"."enum_crm_historical_inquiries_urgent";`)
}
