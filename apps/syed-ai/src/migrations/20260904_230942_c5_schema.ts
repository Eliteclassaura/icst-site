import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_schema_entities_emit_on" AS ENUM('all', 'home', 'none');
  CREATE TABLE "seo_defaults_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"schema_entities_id" uuid
  );
  
  ALTER TABLE "pages_blocks_glossary_list_terms" ADD COLUMN "schema_id" varchar;
  ALTER TABLE "pages_blocks_glossary_list" ADD COLUMN "schema_set_id" varchar;
  ALTER TABLE "pages_blocks_data_table" ADD COLUMN "schema_extra" jsonb;
  ALTER TABLE "pages_blocks_steps" ADD COLUMN "schema_extra" jsonb;
  ALTER TABLE "pages" ADD COLUMN "seo_schema_extra" jsonb;
  ALTER TABLE "_pages_v_blocks_glossary_list_terms" ADD COLUMN "schema_id" varchar;
  ALTER TABLE "_pages_v_blocks_glossary_list" ADD COLUMN "schema_set_id" varchar;
  ALTER TABLE "_pages_v_blocks_data_table" ADD COLUMN "schema_extra" jsonb;
  ALTER TABLE "_pages_v_blocks_steps" ADD COLUMN "schema_extra" jsonb;
  ALTER TABLE "_pages_v" ADD COLUMN "version_seo_schema_extra" jsonb;
  ALTER TABLE "posts" ADD COLUMN "seo_schema_extra" jsonb;
  ALTER TABLE "_posts_v" ADD COLUMN "version_seo_schema_extra" jsonb;
  ALTER TABLE "categories" ADD COLUMN "seo_schema_extra" jsonb;
  ALTER TABLE "tags" ADD COLUMN "seo_schema_extra" jsonb;
  ALTER TABLE "topics" ADD COLUMN "seo_schema_extra" jsonb;
  ALTER TABLE "industries" ADD COLUMN "seo_schema_extra" jsonb;
  ALTER TABLE "locations" ADD COLUMN "seo_schema_extra" jsonb;
  ALTER TABLE "people" ADD COLUMN "seo_schema_extra" jsonb;
  ALTER TABLE "_people_v" ADD COLUMN "version_seo_schema_extra" jsonb;
  ALTER TABLE "services" ADD COLUMN "seo_schema_extra" jsonb;
  ALTER TABLE "_services_v" ADD COLUMN "version_seo_schema_extra" jsonb;
  ALTER TABLE "case_studies" ADD COLUMN "seo_schema_extra" jsonb;
  ALTER TABLE "_case_studies_v" ADD COLUMN "version_seo_schema_extra" jsonb;
  ALTER TABLE "ventures" ADD COLUMN "seo_schema_extra" jsonb;
  ALTER TABLE "_ventures_v" ADD COLUMN "version_seo_schema_extra" jsonb;
  ALTER TABLE "schema_entities" ADD COLUMN "emit_on" "enum_schema_entities_emit_on" DEFAULT 'all';
  ALTER TABLE "seo_defaults_rels" ADD CONSTRAINT "seo_defaults_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."seo_defaults"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "seo_defaults_rels" ADD CONSTRAINT "seo_defaults_rels_schema_entities_fk" FOREIGN KEY ("schema_entities_id") REFERENCES "public"."schema_entities"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "seo_defaults_rels_order_idx" ON "seo_defaults_rels" USING btree ("order");
  CREATE INDEX "seo_defaults_rels_parent_idx" ON "seo_defaults_rels" USING btree ("parent_id");
  CREATE INDEX "seo_defaults_rels_path_idx" ON "seo_defaults_rels" USING btree ("path");
  CREATE INDEX "seo_defaults_rels_schema_entities_id_idx" ON "seo_defaults_rels" USING btree ("schema_entities_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "seo_defaults_rels" CASCADE;
  ALTER TABLE "pages_blocks_glossary_list_terms" DROP COLUMN "schema_id";
  ALTER TABLE "pages_blocks_glossary_list" DROP COLUMN "schema_set_id";
  ALTER TABLE "pages_blocks_data_table" DROP COLUMN "schema_extra";
  ALTER TABLE "pages_blocks_steps" DROP COLUMN "schema_extra";
  ALTER TABLE "pages" DROP COLUMN "seo_schema_extra";
  ALTER TABLE "_pages_v_blocks_glossary_list_terms" DROP COLUMN "schema_id";
  ALTER TABLE "_pages_v_blocks_glossary_list" DROP COLUMN "schema_set_id";
  ALTER TABLE "_pages_v_blocks_data_table" DROP COLUMN "schema_extra";
  ALTER TABLE "_pages_v_blocks_steps" DROP COLUMN "schema_extra";
  ALTER TABLE "_pages_v" DROP COLUMN "version_seo_schema_extra";
  ALTER TABLE "posts" DROP COLUMN "seo_schema_extra";
  ALTER TABLE "_posts_v" DROP COLUMN "version_seo_schema_extra";
  ALTER TABLE "categories" DROP COLUMN "seo_schema_extra";
  ALTER TABLE "tags" DROP COLUMN "seo_schema_extra";
  ALTER TABLE "topics" DROP COLUMN "seo_schema_extra";
  ALTER TABLE "industries" DROP COLUMN "seo_schema_extra";
  ALTER TABLE "locations" DROP COLUMN "seo_schema_extra";
  ALTER TABLE "people" DROP COLUMN "seo_schema_extra";
  ALTER TABLE "_people_v" DROP COLUMN "version_seo_schema_extra";
  ALTER TABLE "services" DROP COLUMN "seo_schema_extra";
  ALTER TABLE "_services_v" DROP COLUMN "version_seo_schema_extra";
  ALTER TABLE "case_studies" DROP COLUMN "seo_schema_extra";
  ALTER TABLE "_case_studies_v" DROP COLUMN "version_seo_schema_extra";
  ALTER TABLE "ventures" DROP COLUMN "seo_schema_extra";
  ALTER TABLE "_ventures_v" DROP COLUMN "version_seo_schema_extra";
  ALTER TABLE "schema_entities" DROP COLUMN "emit_on";
  DROP TYPE "public"."enum_schema_entities_emit_on";`)
}
