import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_saved_views_list" AS ENUM('inbox', 'accounts', 'contacts', 'followups');
  CREATE TABLE "crm_saved_views" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"list" "enum_crm_saved_views_list" NOT NULL,
  	"query" varchar,
  	"owner_id" uuid,
  	"shared" boolean DEFAULT false,
  	"pinned" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_saved_views_id" uuid;
  ALTER TABLE "crm_saved_views" ADD CONSTRAINT "crm_saved_views_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "crm_saved_views_canonical_id_idx" ON "crm_saved_views" USING btree ("canonical_id");
  CREATE INDEX "crm_saved_views_list_idx" ON "crm_saved_views" USING btree ("list");
  CREATE INDEX "crm_saved_views_owner_idx" ON "crm_saved_views" USING btree ("owner_id");
  CREATE INDEX "crm_saved_views_shared_idx" ON "crm_saved_views" USING btree ("shared");
  CREATE INDEX "crm_saved_views_updated_at_idx" ON "crm_saved_views" USING btree ("updated_at");
  CREATE INDEX "crm_saved_views_created_at_idx" ON "crm_saved_views" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_saved_views_fk" FOREIGN KEY ("crm_saved_views_id") REFERENCES "public"."crm_saved_views"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_crm_saved_views_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_saved_views_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_saved_views" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "crm_saved_views" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_saved_views_fk";
  
  DROP INDEX "payload_locked_documents_rels_crm_saved_views_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_saved_views_id";
  DROP TYPE "public"."enum_crm_saved_views_list";`)
}
