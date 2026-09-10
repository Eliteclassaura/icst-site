import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_blocks_data_table_variant" AS ENUM('plain', 'compare', 'price');
  CREATE TYPE "public"."enum_pages_blocks_steps_layout" AS ENUM('split', 'stack');
  CREATE TYPE "public"."enum__pages_v_blocks_data_table_variant" AS ENUM('plain', 'compare', 'price');
  CREATE TYPE "public"."enum__pages_v_blocks_steps_layout" AS ENUM('split', 'stack');
  ALTER TYPE "public"."enum_pages_page_type" ADD VALUE 'case-study';
  ALTER TYPE "public"."enum_pages_page_type" ADD VALUE 'build';
  ALTER TYPE "public"."enum__pages_v_version_page_type" ADD VALUE 'case-study';
  ALTER TYPE "public"."enum__pages_v_version_page_type" ADD VALUE 'build';
  CREATE TABLE "pages_blocks_glossary_list_terms_notes" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"text" varchar
  );
  
  CREATE TABLE "pages_blocks_data_table_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar
  );
  
  CREATE TABLE "pages_blocks_data_table_rows_cells" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "pages_blocks_data_table_rows" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar
  );
  
  CREATE TABLE "pages_blocks_data_table" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"eyebrow" varchar,
  	"title" varchar,
  	"lede" varchar,
  	"caption" varchar,
  	"row_header" varchar DEFAULT '',
  	"variant" "enum_pages_blocks_data_table_variant" DEFAULT 'plain',
  	"footnote" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_steps_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"text" varchar
  );
  
  CREATE TABLE "pages_blocks_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"eyebrow" varchar,
  	"title" varchar,
  	"lede" varchar,
  	"ordered" boolean DEFAULT true,
  	"how_to" boolean DEFAULT false,
  	"layout" "enum_pages_blocks_steps_layout" DEFAULT 'split',
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_related_links_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"href" varchar,
  	"description" varchar
  );
  
  CREATE TABLE "pages_blocks_related_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar DEFAULT 'Related',
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_breadcrumb_trail" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"href" varchar
  );
  
  CREATE TABLE "pages_blocks_breadcrumb" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"current" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_sub_nav_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"href" varchar
  );
  
  CREATE TABLE "pages_blocks_sub_nav" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar DEFAULT 'On this page',
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_offices" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"eyebrow" varchar,
  	"title" varchar,
  	"lede" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_glossary_list_terms_notes" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"text" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_data_table_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_data_table_rows_cells" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"text" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_data_table_rows" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_data_table" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"eyebrow" varchar,
  	"title" varchar,
  	"lede" varchar,
  	"caption" varchar,
  	"row_header" varchar DEFAULT '',
  	"variant" "enum__pages_v_blocks_data_table_variant" DEFAULT 'plain',
  	"footnote" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_steps_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar,
  	"text" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"eyebrow" varchar,
  	"title" varchar,
  	"lede" varchar,
  	"ordered" boolean DEFAULT true,
  	"how_to" boolean DEFAULT false,
  	"layout" "enum__pages_v_blocks_steps_layout" DEFAULT 'split',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_related_links_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"href" varchar,
  	"description" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_related_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar DEFAULT 'Related',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_breadcrumb_trail" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"href" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_breadcrumb" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"current" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_sub_nav_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"href" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_sub_nav" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar DEFAULT 'On this page',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_offices" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"eyebrow" varchar,
  	"title" varchar,
  	"lede" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "pages_blocks_hero" ADD COLUMN "eyebrow" varchar;
  ALTER TABLE "pages" ADD COLUMN "seo_og_title" varchar;
  ALTER TABLE "pages" ADD COLUMN "seo_og_description" varchar;
  ALTER TABLE "_pages_v_blocks_hero" ADD COLUMN "eyebrow" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_seo_og_title" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_seo_og_description" varchar;
  ALTER TABLE "posts" ADD COLUMN "seo_og_title" varchar;
  ALTER TABLE "posts" ADD COLUMN "seo_og_description" varchar;
  ALTER TABLE "_posts_v" ADD COLUMN "version_seo_og_title" varchar;
  ALTER TABLE "_posts_v" ADD COLUMN "version_seo_og_description" varchar;
  ALTER TABLE "categories" ADD COLUMN "seo_og_title" varchar;
  ALTER TABLE "categories" ADD COLUMN "seo_og_description" varchar;
  ALTER TABLE "tags" ADD COLUMN "seo_og_title" varchar;
  ALTER TABLE "tags" ADD COLUMN "seo_og_description" varchar;
  ALTER TABLE "topics" ADD COLUMN "seo_og_title" varchar;
  ALTER TABLE "topics" ADD COLUMN "seo_og_description" varchar;
  ALTER TABLE "industries" ADD COLUMN "seo_og_title" varchar;
  ALTER TABLE "industries" ADD COLUMN "seo_og_description" varchar;
  ALTER TABLE "locations" ADD COLUMN "seo_og_title" varchar;
  ALTER TABLE "locations" ADD COLUMN "seo_og_description" varchar;
  ALTER TABLE "people" ADD COLUMN "seo_og_title" varchar;
  ALTER TABLE "people" ADD COLUMN "seo_og_description" varchar;
  ALTER TABLE "_people_v" ADD COLUMN "version_seo_og_title" varchar;
  ALTER TABLE "_people_v" ADD COLUMN "version_seo_og_description" varchar;
  ALTER TABLE "services" ADD COLUMN "seo_og_title" varchar;
  ALTER TABLE "services" ADD COLUMN "seo_og_description" varchar;
  ALTER TABLE "_services_v" ADD COLUMN "version_seo_og_title" varchar;
  ALTER TABLE "_services_v" ADD COLUMN "version_seo_og_description" varchar;
  ALTER TABLE "case_studies" ADD COLUMN "seo_og_title" varchar;
  ALTER TABLE "case_studies" ADD COLUMN "seo_og_description" varchar;
  ALTER TABLE "_case_studies_v" ADD COLUMN "version_seo_og_title" varchar;
  ALTER TABLE "_case_studies_v" ADD COLUMN "version_seo_og_description" varchar;
  ALTER TABLE "ventures" ADD COLUMN "seo_og_title" varchar;
  ALTER TABLE "ventures" ADD COLUMN "seo_og_description" varchar;
  ALTER TABLE "_ventures_v" ADD COLUMN "version_seo_og_title" varchar;
  ALTER TABLE "_ventures_v" ADD COLUMN "version_seo_og_description" varchar;
  ALTER TABLE "pages_blocks_glossary_list_terms_notes" ADD CONSTRAINT "pages_blocks_glossary_list_terms_notes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_glossary_list_terms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_data_table_columns" ADD CONSTRAINT "pages_blocks_data_table_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_data_table"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_data_table_rows_cells" ADD CONSTRAINT "pages_blocks_data_table_rows_cells_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_data_table_rows"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_data_table_rows" ADD CONSTRAINT "pages_blocks_data_table_rows_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_data_table"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_data_table" ADD CONSTRAINT "pages_blocks_data_table_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_steps_items" ADD CONSTRAINT "pages_blocks_steps_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_steps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_steps" ADD CONSTRAINT "pages_blocks_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_related_links_links" ADD CONSTRAINT "pages_blocks_related_links_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_related_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_related_links" ADD CONSTRAINT "pages_blocks_related_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_breadcrumb_trail" ADD CONSTRAINT "pages_blocks_breadcrumb_trail_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_breadcrumb"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_breadcrumb" ADD CONSTRAINT "pages_blocks_breadcrumb_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_sub_nav_links" ADD CONSTRAINT "pages_blocks_sub_nav_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_sub_nav"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_sub_nav" ADD CONSTRAINT "pages_blocks_sub_nav_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_offices" ADD CONSTRAINT "pages_blocks_offices_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_glossary_list_terms_notes" ADD CONSTRAINT "_pages_v_blocks_glossary_list_terms_notes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_glossary_list_terms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_data_table_columns" ADD CONSTRAINT "_pages_v_blocks_data_table_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_data_table"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_data_table_rows_cells" ADD CONSTRAINT "_pages_v_blocks_data_table_rows_cells_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_data_table_rows"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_data_table_rows" ADD CONSTRAINT "_pages_v_blocks_data_table_rows_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_data_table"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_data_table" ADD CONSTRAINT "_pages_v_blocks_data_table_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_steps_items" ADD CONSTRAINT "_pages_v_blocks_steps_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_steps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_steps" ADD CONSTRAINT "_pages_v_blocks_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_related_links_links" ADD CONSTRAINT "_pages_v_blocks_related_links_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_related_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_related_links" ADD CONSTRAINT "_pages_v_blocks_related_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_breadcrumb_trail" ADD CONSTRAINT "_pages_v_blocks_breadcrumb_trail_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_breadcrumb"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_breadcrumb" ADD CONSTRAINT "_pages_v_blocks_breadcrumb_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_sub_nav_links" ADD CONSTRAINT "_pages_v_blocks_sub_nav_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_sub_nav"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_sub_nav" ADD CONSTRAINT "_pages_v_blocks_sub_nav_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_offices" ADD CONSTRAINT "_pages_v_blocks_offices_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_glossary_list_terms_notes_order_idx" ON "pages_blocks_glossary_list_terms_notes" USING btree ("_order");
  CREATE INDEX "pages_blocks_glossary_list_terms_notes_parent_id_idx" ON "pages_blocks_glossary_list_terms_notes" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_data_table_columns_order_idx" ON "pages_blocks_data_table_columns" USING btree ("_order");
  CREATE INDEX "pages_blocks_data_table_columns_parent_id_idx" ON "pages_blocks_data_table_columns" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_data_table_rows_cells_order_idx" ON "pages_blocks_data_table_rows_cells" USING btree ("_order");
  CREATE INDEX "pages_blocks_data_table_rows_cells_parent_id_idx" ON "pages_blocks_data_table_rows_cells" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_data_table_rows_order_idx" ON "pages_blocks_data_table_rows" USING btree ("_order");
  CREATE INDEX "pages_blocks_data_table_rows_parent_id_idx" ON "pages_blocks_data_table_rows" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_data_table_order_idx" ON "pages_blocks_data_table" USING btree ("_order");
  CREATE INDEX "pages_blocks_data_table_parent_id_idx" ON "pages_blocks_data_table" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_data_table_path_idx" ON "pages_blocks_data_table" USING btree ("_path");
  CREATE INDEX "pages_blocks_steps_items_order_idx" ON "pages_blocks_steps_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_steps_items_parent_id_idx" ON "pages_blocks_steps_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_steps_order_idx" ON "pages_blocks_steps" USING btree ("_order");
  CREATE INDEX "pages_blocks_steps_parent_id_idx" ON "pages_blocks_steps" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_steps_path_idx" ON "pages_blocks_steps" USING btree ("_path");
  CREATE INDEX "pages_blocks_related_links_links_order_idx" ON "pages_blocks_related_links_links" USING btree ("_order");
  CREATE INDEX "pages_blocks_related_links_links_parent_id_idx" ON "pages_blocks_related_links_links" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_related_links_order_idx" ON "pages_blocks_related_links" USING btree ("_order");
  CREATE INDEX "pages_blocks_related_links_parent_id_idx" ON "pages_blocks_related_links" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_related_links_path_idx" ON "pages_blocks_related_links" USING btree ("_path");
  CREATE INDEX "pages_blocks_breadcrumb_trail_order_idx" ON "pages_blocks_breadcrumb_trail" USING btree ("_order");
  CREATE INDEX "pages_blocks_breadcrumb_trail_parent_id_idx" ON "pages_blocks_breadcrumb_trail" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_breadcrumb_order_idx" ON "pages_blocks_breadcrumb" USING btree ("_order");
  CREATE INDEX "pages_blocks_breadcrumb_parent_id_idx" ON "pages_blocks_breadcrumb" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_breadcrumb_path_idx" ON "pages_blocks_breadcrumb" USING btree ("_path");
  CREATE INDEX "pages_blocks_sub_nav_links_order_idx" ON "pages_blocks_sub_nav_links" USING btree ("_order");
  CREATE INDEX "pages_blocks_sub_nav_links_parent_id_idx" ON "pages_blocks_sub_nav_links" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_sub_nav_order_idx" ON "pages_blocks_sub_nav" USING btree ("_order");
  CREATE INDEX "pages_blocks_sub_nav_parent_id_idx" ON "pages_blocks_sub_nav" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_sub_nav_path_idx" ON "pages_blocks_sub_nav" USING btree ("_path");
  CREATE INDEX "pages_blocks_offices_order_idx" ON "pages_blocks_offices" USING btree ("_order");
  CREATE INDEX "pages_blocks_offices_parent_id_idx" ON "pages_blocks_offices" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_offices_path_idx" ON "pages_blocks_offices" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_glossary_list_terms_notes_order_idx" ON "_pages_v_blocks_glossary_list_terms_notes" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_glossary_list_terms_notes_parent_id_idx" ON "_pages_v_blocks_glossary_list_terms_notes" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_data_table_columns_order_idx" ON "_pages_v_blocks_data_table_columns" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_data_table_columns_parent_id_idx" ON "_pages_v_blocks_data_table_columns" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_data_table_rows_cells_order_idx" ON "_pages_v_blocks_data_table_rows_cells" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_data_table_rows_cells_parent_id_idx" ON "_pages_v_blocks_data_table_rows_cells" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_data_table_rows_order_idx" ON "_pages_v_blocks_data_table_rows" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_data_table_rows_parent_id_idx" ON "_pages_v_blocks_data_table_rows" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_data_table_order_idx" ON "_pages_v_blocks_data_table" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_data_table_parent_id_idx" ON "_pages_v_blocks_data_table" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_data_table_path_idx" ON "_pages_v_blocks_data_table" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_steps_items_order_idx" ON "_pages_v_blocks_steps_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_steps_items_parent_id_idx" ON "_pages_v_blocks_steps_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_steps_order_idx" ON "_pages_v_blocks_steps" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_steps_parent_id_idx" ON "_pages_v_blocks_steps" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_steps_path_idx" ON "_pages_v_blocks_steps" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_related_links_links_order_idx" ON "_pages_v_blocks_related_links_links" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_related_links_links_parent_id_idx" ON "_pages_v_blocks_related_links_links" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_related_links_order_idx" ON "_pages_v_blocks_related_links" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_related_links_parent_id_idx" ON "_pages_v_blocks_related_links" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_related_links_path_idx" ON "_pages_v_blocks_related_links" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_breadcrumb_trail_order_idx" ON "_pages_v_blocks_breadcrumb_trail" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_breadcrumb_trail_parent_id_idx" ON "_pages_v_blocks_breadcrumb_trail" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_breadcrumb_order_idx" ON "_pages_v_blocks_breadcrumb" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_breadcrumb_parent_id_idx" ON "_pages_v_blocks_breadcrumb" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_breadcrumb_path_idx" ON "_pages_v_blocks_breadcrumb" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_sub_nav_links_order_idx" ON "_pages_v_blocks_sub_nav_links" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_sub_nav_links_parent_id_idx" ON "_pages_v_blocks_sub_nav_links" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_sub_nav_order_idx" ON "_pages_v_blocks_sub_nav" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_sub_nav_parent_id_idx" ON "_pages_v_blocks_sub_nav" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_sub_nav_path_idx" ON "_pages_v_blocks_sub_nav" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_offices_order_idx" ON "_pages_v_blocks_offices" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_offices_parent_id_idx" ON "_pages_v_blocks_offices" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_offices_path_idx" ON "_pages_v_blocks_offices" USING btree ("_path");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "pages_blocks_glossary_list_terms_notes" CASCADE;
  DROP TABLE "pages_blocks_data_table_columns" CASCADE;
  DROP TABLE "pages_blocks_data_table_rows_cells" CASCADE;
  DROP TABLE "pages_blocks_data_table_rows" CASCADE;
  DROP TABLE "pages_blocks_data_table" CASCADE;
  DROP TABLE "pages_blocks_steps_items" CASCADE;
  DROP TABLE "pages_blocks_steps" CASCADE;
  DROP TABLE "pages_blocks_related_links_links" CASCADE;
  DROP TABLE "pages_blocks_related_links" CASCADE;
  DROP TABLE "pages_blocks_breadcrumb_trail" CASCADE;
  DROP TABLE "pages_blocks_breadcrumb" CASCADE;
  DROP TABLE "pages_blocks_sub_nav_links" CASCADE;
  DROP TABLE "pages_blocks_sub_nav" CASCADE;
  DROP TABLE "pages_blocks_offices" CASCADE;
  DROP TABLE "_pages_v_blocks_glossary_list_terms_notes" CASCADE;
  DROP TABLE "_pages_v_blocks_data_table_columns" CASCADE;
  DROP TABLE "_pages_v_blocks_data_table_rows_cells" CASCADE;
  DROP TABLE "_pages_v_blocks_data_table_rows" CASCADE;
  DROP TABLE "_pages_v_blocks_data_table" CASCADE;
  DROP TABLE "_pages_v_blocks_steps_items" CASCADE;
  DROP TABLE "_pages_v_blocks_steps" CASCADE;
  DROP TABLE "_pages_v_blocks_related_links_links" CASCADE;
  DROP TABLE "_pages_v_blocks_related_links" CASCADE;
  DROP TABLE "_pages_v_blocks_breadcrumb_trail" CASCADE;
  DROP TABLE "_pages_v_blocks_breadcrumb" CASCADE;
  DROP TABLE "_pages_v_blocks_sub_nav_links" CASCADE;
  DROP TABLE "_pages_v_blocks_sub_nav" CASCADE;
  DROP TABLE "_pages_v_blocks_offices" CASCADE;
  ALTER TABLE "pages" ALTER COLUMN "page_type" SET DATA TYPE text;
  ALTER TABLE "pages" ALTER COLUMN "page_type" SET DEFAULT 'standard'::text;
  DROP TYPE "public"."enum_pages_page_type";
  CREATE TYPE "public"."enum_pages_page_type" AS ENUM('standard', 'home', 'service', 'industry', 'location', 'about', 'article', 'category', 'pricing', 'comparison', 'faq', 'glossary', 'contact', 'legal', 'campaign', 'tool');
  ALTER TABLE "pages" ALTER COLUMN "page_type" SET DEFAULT 'standard'::"public"."enum_pages_page_type";
  ALTER TABLE "pages" ALTER COLUMN "page_type" SET DATA TYPE "public"."enum_pages_page_type" USING "page_type"::"public"."enum_pages_page_type";
  ALTER TABLE "_pages_v" ALTER COLUMN "version_page_type" SET DATA TYPE text;
  ALTER TABLE "_pages_v" ALTER COLUMN "version_page_type" SET DEFAULT 'standard'::text;
  DROP TYPE "public"."enum__pages_v_version_page_type";
  CREATE TYPE "public"."enum__pages_v_version_page_type" AS ENUM('standard', 'home', 'service', 'industry', 'location', 'about', 'article', 'category', 'pricing', 'comparison', 'faq', 'glossary', 'contact', 'legal', 'campaign', 'tool');
  ALTER TABLE "_pages_v" ALTER COLUMN "version_page_type" SET DEFAULT 'standard'::"public"."enum__pages_v_version_page_type";
  ALTER TABLE "_pages_v" ALTER COLUMN "version_page_type" SET DATA TYPE "public"."enum__pages_v_version_page_type" USING "version_page_type"::"public"."enum__pages_v_version_page_type";
  ALTER TABLE "pages_blocks_hero" DROP COLUMN "eyebrow";
  ALTER TABLE "pages" DROP COLUMN "seo_og_title";
  ALTER TABLE "pages" DROP COLUMN "seo_og_description";
  ALTER TABLE "_pages_v_blocks_hero" DROP COLUMN "eyebrow";
  ALTER TABLE "_pages_v" DROP COLUMN "version_seo_og_title";
  ALTER TABLE "_pages_v" DROP COLUMN "version_seo_og_description";
  ALTER TABLE "posts" DROP COLUMN "seo_og_title";
  ALTER TABLE "posts" DROP COLUMN "seo_og_description";
  ALTER TABLE "_posts_v" DROP COLUMN "version_seo_og_title";
  ALTER TABLE "_posts_v" DROP COLUMN "version_seo_og_description";
  ALTER TABLE "categories" DROP COLUMN "seo_og_title";
  ALTER TABLE "categories" DROP COLUMN "seo_og_description";
  ALTER TABLE "tags" DROP COLUMN "seo_og_title";
  ALTER TABLE "tags" DROP COLUMN "seo_og_description";
  ALTER TABLE "topics" DROP COLUMN "seo_og_title";
  ALTER TABLE "topics" DROP COLUMN "seo_og_description";
  ALTER TABLE "industries" DROP COLUMN "seo_og_title";
  ALTER TABLE "industries" DROP COLUMN "seo_og_description";
  ALTER TABLE "locations" DROP COLUMN "seo_og_title";
  ALTER TABLE "locations" DROP COLUMN "seo_og_description";
  ALTER TABLE "people" DROP COLUMN "seo_og_title";
  ALTER TABLE "people" DROP COLUMN "seo_og_description";
  ALTER TABLE "_people_v" DROP COLUMN "version_seo_og_title";
  ALTER TABLE "_people_v" DROP COLUMN "version_seo_og_description";
  ALTER TABLE "services" DROP COLUMN "seo_og_title";
  ALTER TABLE "services" DROP COLUMN "seo_og_description";
  ALTER TABLE "_services_v" DROP COLUMN "version_seo_og_title";
  ALTER TABLE "_services_v" DROP COLUMN "version_seo_og_description";
  ALTER TABLE "case_studies" DROP COLUMN "seo_og_title";
  ALTER TABLE "case_studies" DROP COLUMN "seo_og_description";
  ALTER TABLE "_case_studies_v" DROP COLUMN "version_seo_og_title";
  ALTER TABLE "_case_studies_v" DROP COLUMN "version_seo_og_description";
  ALTER TABLE "ventures" DROP COLUMN "seo_og_title";
  ALTER TABLE "ventures" DROP COLUMN "seo_og_description";
  ALTER TABLE "_ventures_v" DROP COLUMN "version_seo_og_title";
  ALTER TABLE "_ventures_v" DROP COLUMN "version_seo_og_description";
  DROP TYPE "public"."enum_pages_blocks_data_table_variant";
  DROP TYPE "public"."enum_pages_blocks_steps_layout";
  DROP TYPE "public"."enum__pages_v_blocks_data_table_variant";
  DROP TYPE "public"."enum__pages_v_blocks_steps_layout";`)
}
