import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_attachments_record_kind" AS ENUM('CONTACT', 'ACCOUNT', 'OPPORTUNITY', 'RFQ');
  CREATE TABLE "crm_attachments" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"record_kind" "enum_crm_attachments_record_kind" NOT NULL,
  	"contact_id" uuid,
  	"account_id" uuid,
  	"opportunity_id" uuid,
  	"rfq_id" uuid,
  	"original_name" varchar NOT NULL,
  	"extension" varchar NOT NULL,
  	"mime" varchar NOT NULL,
  	"size_bytes" numeric NOT NULL,
  	"sha256" varchar NOT NULL,
  	"storage_key" varchar NOT NULL,
  	"note" varchar,
  	"uploaded_by_id" uuid,
  	"deleted_at" timestamp(3) with time zone,
  	"deleted_by_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_attachments_id" uuid;
  ALTER TABLE "crm_attachments" ADD CONSTRAINT "crm_attachments_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_attachments" ADD CONSTRAINT "crm_attachments_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_attachments" ADD CONSTRAINT "crm_attachments_opportunity_id_crm_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."crm_opportunities"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_attachments" ADD CONSTRAINT "crm_attachments_rfq_id_crm_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."crm_rfqs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_attachments" ADD CONSTRAINT "crm_attachments_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_attachments" ADD CONSTRAINT "crm_attachments_deleted_by_id_users_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "crm_attachments_canonical_id_idx" ON "crm_attachments" USING btree ("canonical_id");
  CREATE INDEX "crm_attachments_record_kind_idx" ON "crm_attachments" USING btree ("record_kind");
  CREATE INDEX "crm_attachments_contact_idx" ON "crm_attachments" USING btree ("contact_id");
  CREATE INDEX "crm_attachments_account_idx" ON "crm_attachments" USING btree ("account_id");
  CREATE INDEX "crm_attachments_opportunity_idx" ON "crm_attachments" USING btree ("opportunity_id");
  CREATE INDEX "crm_attachments_rfq_idx" ON "crm_attachments" USING btree ("rfq_id");
  CREATE INDEX "crm_attachments_uploaded_by_idx" ON "crm_attachments" USING btree ("uploaded_by_id");
  CREATE INDEX "crm_attachments_deleted_at_idx" ON "crm_attachments" USING btree ("deleted_at");
  CREATE INDEX "crm_attachments_deleted_by_idx" ON "crm_attachments" USING btree ("deleted_by_id");
  CREATE INDEX "crm_attachments_updated_at_idx" ON "crm_attachments" USING btree ("updated_at");
  CREATE INDEX "crm_attachments_created_at_idx" ON "crm_attachments" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_attachments_fk" FOREIGN KEY ("crm_attachments_id") REFERENCES "public"."crm_attachments"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_crm_attachments_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_attachments_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // CRM-ATTACH-1: a refusing down. It does not remove a file row (each row points at stored bytes); remove the files
  // through the attachments service first. Dependent objects go before the table, and every step is IF EXISTS.
  await db.execute(sql`
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM "crm_attachments") THEN
      RAISE EXCEPTION 'crm_attachments has rows: remove the files before rolling this back';
    END IF;
  END
  $$;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_crm_attachments_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_crm_attachments_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "crm_attachments_id";
  DROP TABLE IF EXISTS "crm_attachments" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_crm_attachments_record_kind";`)
}
