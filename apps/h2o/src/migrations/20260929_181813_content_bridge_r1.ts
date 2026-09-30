import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_public_routes_family" AS ENUM('salmon', 'live', 'english-service', 'alias', 'search');
  CREATE TYPE "public"."enum_public_routes_disposition_state" AS ENUM('PUBLIC', 'REVIEW_HOLD', 'PRIVATE_ARCHIVE', 'REDIRECT');
  CREATE TYPE "public"."enum_public_routes_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__public_routes_v_version_family" AS ENUM('salmon', 'live', 'english-service', 'alias', 'search');
  CREATE TYPE "public"."enum__public_routes_v_version_disposition_state" AS ENUM('PUBLIC', 'REVIEW_HOLD', 'PRIVATE_ARCHIVE', 'REDIRECT');
  CREATE TYPE "public"."enum__public_routes_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__public_routes_v_published_locale" AS ENUM('en');
  CREATE TYPE "public"."enum_public_redirects_status" AS ENUM('301', '308');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'publishingSync' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'publishingSync' BEFORE 'schedulePublish';
  CREATE TABLE "public_routes" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar,
  	"route_id" varchar,
  	"path" varchar,
  	"path_key" varchar,
  	"family" "enum_public_routes_family",
  	"route_class" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical" varchar,
  	"disposition_state" "enum_public_routes_disposition_state" DEFAULT 'REVIEW_HOLD',
  	"disposition_export" boolean DEFAULT false,
  	"disposition_indexable" boolean DEFAULT false,
  	"disposition_sitemap" boolean DEFAULT false,
  	"disposition_searchable" boolean DEFAULT false,
  	"disposition_redirect" varchar,
  	"disposition_matched_article" boolean DEFAULT false,
  	"disposition_release_override" varchar,
  	"document" jsonb,
  	"source_source_url" varchar,
  	"source_source_file" varchar,
  	"source_source_sha256" varchar,
  	"source_previous_canonical" varchar,
  	"source_source_robots" varchar,
  	"source_alias_of" varchar,
  	"source_order" numeric,
  	"content_sha256" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_public_routes_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_public_routes_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_title" varchar,
  	"version_route_id" varchar,
  	"version_path" varchar,
  	"version_path_key" varchar,
  	"version_family" "enum__public_routes_v_version_family",
  	"version_route_class" varchar,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_canonical" varchar,
  	"version_disposition_state" "enum__public_routes_v_version_disposition_state" DEFAULT 'REVIEW_HOLD',
  	"version_disposition_export" boolean DEFAULT false,
  	"version_disposition_indexable" boolean DEFAULT false,
  	"version_disposition_sitemap" boolean DEFAULT false,
  	"version_disposition_searchable" boolean DEFAULT false,
  	"version_disposition_redirect" varchar,
  	"version_disposition_matched_article" boolean DEFAULT false,
  	"version_disposition_release_override" varchar,
  	"version_document" jsonb,
  	"version_source_source_url" varchar,
  	"version_source_source_file" varchar,
  	"version_source_source_sha256" varchar,
  	"version_source_previous_canonical" varchar,
  	"version_source_source_robots" varchar,
  	"version_source_alias_of" varchar,
  	"version_source_order" numeric,
  	"version_content_sha256" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__public_routes_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__public_routes_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "public_redirects" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"source" varchar NOT NULL,
  	"destination" varchar NOT NULL,
  	"status" "enum_public_redirects_status" DEFAULT '308' NOT NULL,
  	"active" boolean DEFAULT true,
  	"authority" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "publication_state" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"snapshot_generation" varchar,
  	"snapshot_at" timestamp(3) with time zone,
  	"search_generation" varchar,
  	"search_at" timestamp(3) with time zone,
  	"search_records" numeric,
  	"last_error" varchar,
  	"last_error_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "public_routes_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "public_redirects_id" uuid;
  ALTER TABLE "_public_routes_v" ADD CONSTRAINT "_public_routes_v_parent_id_public_routes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."public_routes"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "public_routes_route_id_idx" ON "public_routes" USING btree ("route_id");
  CREATE UNIQUE INDEX "public_routes_path_idx" ON "public_routes" USING btree ("path");
  CREATE UNIQUE INDEX "public_routes_path_key_idx" ON "public_routes" USING btree ("path_key");
  CREATE INDEX "public_routes_disposition_disposition_state_idx" ON "public_routes" USING btree ("disposition_state");
  CREATE INDEX "public_routes_disposition_disposition_export_idx" ON "public_routes" USING btree ("disposition_export");
  CREATE INDEX "public_routes_source_source_order_idx" ON "public_routes" USING btree ("source_order");
  CREATE INDEX "public_routes_updated_at_idx" ON "public_routes" USING btree ("updated_at");
  CREATE INDEX "public_routes_created_at_idx" ON "public_routes" USING btree ("created_at");
  CREATE INDEX "public_routes__status_idx" ON "public_routes" USING btree ("_status");
  CREATE INDEX "_public_routes_v_parent_idx" ON "_public_routes_v" USING btree ("parent_id");
  CREATE INDEX "_public_routes_v_version_version_route_id_idx" ON "_public_routes_v" USING btree ("version_route_id");
  CREATE INDEX "_public_routes_v_version_version_path_idx" ON "_public_routes_v" USING btree ("version_path");
  CREATE INDEX "_public_routes_v_version_version_path_key_idx" ON "_public_routes_v" USING btree ("version_path_key");
  CREATE INDEX "_public_routes_v_version_disposition_version_disposition_idx" ON "_public_routes_v" USING btree ("version_disposition_state");
  CREATE INDEX "_public_routes_v_version_disposition_version_dispositi_1_idx" ON "_public_routes_v" USING btree ("version_disposition_export");
  CREATE INDEX "_public_routes_v_version_source_version_source_order_idx" ON "_public_routes_v" USING btree ("version_source_order");
  CREATE INDEX "_public_routes_v_version_version_updated_at_idx" ON "_public_routes_v" USING btree ("version_updated_at");
  CREATE INDEX "_public_routes_v_version_version_created_at_idx" ON "_public_routes_v" USING btree ("version_created_at");
  CREATE INDEX "_public_routes_v_version_version__status_idx" ON "_public_routes_v" USING btree ("version__status");
  CREATE INDEX "_public_routes_v_created_at_idx" ON "_public_routes_v" USING btree ("created_at");
  CREATE INDEX "_public_routes_v_updated_at_idx" ON "_public_routes_v" USING btree ("updated_at");
  CREATE INDEX "_public_routes_v_snapshot_idx" ON "_public_routes_v" USING btree ("snapshot");
  CREATE INDEX "_public_routes_v_published_locale_idx" ON "_public_routes_v" USING btree ("published_locale");
  CREATE INDEX "_public_routes_v_latest_idx" ON "_public_routes_v" USING btree ("latest");
  CREATE UNIQUE INDEX "public_redirects_source_idx" ON "public_redirects" USING btree ("source");
  CREATE INDEX "public_redirects_updated_at_idx" ON "public_redirects" USING btree ("updated_at");
  CREATE INDEX "public_redirects_created_at_idx" ON "public_redirects" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_public_routes_fk" FOREIGN KEY ("public_routes_id") REFERENCES "public"."public_routes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_public_redirects_fk" FOREIGN KEY ("public_redirects_id") REFERENCES "public"."public_redirects"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_public_routes_id_idx" ON "payload_locked_documents_rels" USING btree ("public_routes_id");
  CREATE INDEX "payload_locked_documents_rels_public_redirects_id_idx" ON "payload_locked_documents_rels" USING btree ("public_redirects_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "public_routes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_public_routes_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "public_redirects" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "publication_state" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "public_routes" CASCADE;
  DROP TABLE "_public_routes_v" CASCADE;
  DROP TABLE "public_redirects" CASCADE;
  DROP TABLE "publication_state" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_public_routes_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_public_redirects_fk";
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "payload_locked_documents_rels_public_routes_id_idx";
  DROP INDEX "payload_locked_documents_rels_public_redirects_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "public_routes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "public_redirects_id";
  DROP TYPE "public"."enum_public_routes_family";
  DROP TYPE "public"."enum_public_routes_disposition_state";
  DROP TYPE "public"."enum_public_routes_status";
  DROP TYPE "public"."enum__public_routes_v_version_family";
  DROP TYPE "public"."enum__public_routes_v_version_disposition_state";
  DROP TYPE "public"."enum__public_routes_v_version_status";
  DROP TYPE "public"."enum__public_routes_v_published_locale";
  DROP TYPE "public"."enum_public_redirects_status";`)
}
