import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_import_batches_entity" AS ENUM('CONTACTS');
  CREATE TYPE "public"."enum_crm_import_batches_status" AS ENUM('APPLIED', 'UNDONE');
  CREATE TABLE "crm_import_batches" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"entity" "enum_crm_import_batches_entity" DEFAULT 'CONTACTS' NOT NULL,
  	"status" "enum_crm_import_batches_status" DEFAULT 'APPLIED' NOT NULL,
  	"file_sha256" varchar NOT NULL,
  	"row_count" numeric NOT NULL,
  	"mapping" jsonb NOT NULL,
  	"options" jsonb,
  	"source_label" varchar,
  	"basis" varchar,
  	"counts" jsonb NOT NULL,
  	"fills" jsonb,
  	"applied_by_id" uuid,
  	"applied_at" timestamp(3) with time zone,
  	"undone_by_id" uuid,
  	"undone_at" timestamp(3) with time zone,
  	"undo_counts" jsonb,
  	"undo_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "crm_accounts" ADD COLUMN "name_from_domain" boolean DEFAULT false;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_import_batches_id" uuid;
  ALTER TABLE "crm_import_batches" ADD CONSTRAINT "crm_import_batches_applied_by_id_users_id_fk" FOREIGN KEY ("applied_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_import_batches" ADD CONSTRAINT "crm_import_batches_undone_by_id_users_id_fk" FOREIGN KEY ("undone_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "crm_import_batches_canonical_id_idx" ON "crm_import_batches" USING btree ("canonical_id");
  CREATE INDEX "crm_import_batches_entity_idx" ON "crm_import_batches" USING btree ("entity");
  CREATE INDEX "crm_import_batches_status_idx" ON "crm_import_batches" USING btree ("status");
  CREATE INDEX "crm_import_batches_file_sha256_idx" ON "crm_import_batches" USING btree ("file_sha256");
  CREATE INDEX "crm_import_batches_applied_by_idx" ON "crm_import_batches" USING btree ("applied_by_id");
  CREATE INDEX "crm_import_batches_undone_by_idx" ON "crm_import_batches" USING btree ("undone_by_id");
  CREATE INDEX "crm_import_batches_updated_at_idx" ON "crm_import_batches" USING btree ("updated_at");
  CREATE INDEX "crm_import_batches_created_at_idx" ON "crm_import_batches" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_import_batches_fk" FOREIGN KEY ("crm_import_batches_id") REFERENCES "public"."crm_import_batches"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "crm_accounts_name_from_domain_idx" ON "crm_accounts" USING btree ("name_from_domain");
  CREATE INDEX "payload_locked_documents_rels_crm_import_batches_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_import_batches_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_import_batches" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "crm_import_batches" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_import_batches_fk";
  
  DROP INDEX "crm_accounts_name_from_domain_idx";
  DROP INDEX "payload_locked_documents_rels_crm_import_batches_id_idx";
  ALTER TABLE "crm_accounts" DROP COLUMN "name_from_domain";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_import_batches_id";
  DROP TYPE "public"."enum_crm_import_batches_entity";
  DROP TYPE "public"."enum_crm_import_batches_status";`)
}
