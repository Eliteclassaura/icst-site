import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_blocks_hero_variant" AS ENUM('media', 'plain');
  CREATE TYPE "public"."enum_pages_blocks_hero_as" AS ENUM('h1', 'h2');
  CREATE TYPE "public"."enum__pages_v_blocks_hero_variant" AS ENUM('media', 'plain');
  CREATE TYPE "public"."enum__pages_v_blocks_hero_as" AS ENUM('h1', 'h2');
  CREATE TABLE "pages_blocks_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"lede" varchar,
  	"status" varchar,
  	"variant" "enum_pages_blocks_hero_variant" DEFAULT 'media',
  	"image_id" uuid,
  	"cta_primary_label" varchar,
  	"cta_primary_href" varchar,
  	"cta_primary_external" boolean DEFAULT false,
  	"cta_secondary_label" varchar,
  	"cta_secondary_href" varchar,
  	"cta_secondary_external" boolean DEFAULT false,
  	"as" "enum_pages_blocks_hero_as" DEFAULT 'h1',
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_takeaway_list_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"lead" varchar,
  	"text" varchar
  );
  
  CREATE TABLE "pages_blocks_takeaway_list" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar DEFAULT 'The short version',
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_evidence_grid_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"figure" varchar,
  	"claim" varchar,
  	"detail" varchar,
  	"source_publisher" varchar,
  	"source_title" varchar,
  	"source_href" varchar,
  	"source_date" varchar
  );
  
  CREATE TABLE "pages_blocks_evidence_grid" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"eyebrow" varchar,
  	"title" varchar,
  	"lede" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_faq_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" varchar,
  	"anchor" varchar
  );
  
  CREATE TABLE "pages_blocks_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"eyebrow" varchar,
  	"title" varchar,
  	"lede" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_glossary_list_terms" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"term" varchar,
  	"definition" varchar,
  	"aside" varchar
  );
  
  CREATE TABLE "pages_blocks_glossary_list" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"eyebrow" varchar,
  	"title" varchar,
  	"lede" varchar,
  	"more_label" varchar,
  	"more_href" varchar,
  	"more_external" boolean DEFAULT false,
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"eyebrow" varchar,
  	"title" varchar,
  	"text" varchar,
  	"cta_primary_label" varchar,
  	"cta_primary_href" varchar,
  	"cta_primary_external" boolean DEFAULT false,
  	"cta_secondary_label" varchar,
  	"cta_secondary_href" varchar,
  	"cta_secondary_external" boolean DEFAULT false,
  	"image_id" uuid,
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_brief_form" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"eyebrow" varchar,
  	"title" varchar,
  	"lede" varchar,
  	"submit_label" varchar DEFAULT 'Send the brief',
  	"brief_placeholder" varchar,
  	"opt_in_enabled" boolean DEFAULT true,
  	"opt_in_label" varchar,
  	"opt_in_text" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar,
  	"lede" varchar,
  	"status" varchar,
  	"variant" "enum__pages_v_blocks_hero_variant" DEFAULT 'media',
  	"image_id" uuid,
  	"cta_primary_label" varchar,
  	"cta_primary_href" varchar,
  	"cta_primary_external" boolean DEFAULT false,
  	"cta_secondary_label" varchar,
  	"cta_secondary_href" varchar,
  	"cta_secondary_external" boolean DEFAULT false,
  	"as" "enum__pages_v_blocks_hero_as" DEFAULT 'h1',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_takeaway_list_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"lead" varchar,
  	"text" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_takeaway_list" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar DEFAULT 'The short version',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_evidence_grid_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"figure" varchar,
  	"claim" varchar,
  	"detail" varchar,
  	"source_publisher" varchar,
  	"source_title" varchar,
  	"source_href" varchar,
  	"source_date" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_evidence_grid" (
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
  
  CREATE TABLE "_pages_v_blocks_faq_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"question" varchar,
  	"answer" varchar,
  	"anchor" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_faq" (
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
  
  CREATE TABLE "_pages_v_blocks_glossary_list_terms" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"anchor" varchar,
  	"term" varchar,
  	"definition" varchar,
  	"aside" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_glossary_list" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"eyebrow" varchar,
  	"title" varchar,
  	"lede" varchar,
  	"more_label" varchar,
  	"more_href" varchar,
  	"more_external" boolean DEFAULT false,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"eyebrow" varchar,
  	"title" varchar,
  	"text" varchar,
  	"cta_primary_label" varchar,
  	"cta_primary_href" varchar,
  	"cta_primary_external" boolean DEFAULT false,
  	"cta_secondary_label" varchar,
  	"cta_secondary_href" varchar,
  	"cta_secondary_external" boolean DEFAULT false,
  	"image_id" uuid,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_brief_form" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"eyebrow" varchar,
  	"title" varchar,
  	"lede" varchar,
  	"submit_label" varchar DEFAULT 'Send the brief',
  	"brief_placeholder" varchar,
  	"opt_in_enabled" boolean DEFAULT true,
  	"opt_in_label" varchar,
  	"opt_in_text" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "offices" ADD COLUMN "hours_display" varchar;
  ALTER TABLE "offices" ADD COLUMN "footer_role" varchar;
  ALTER TABLE "_offices_v" ADD COLUMN "version_hours_display" varchar;
  ALTER TABLE "_offices_v" ADD COLUMN "version_footer_role" varchar;
  ALTER TABLE "form_config_selects" ADD COLUMN "label" varchar;
  UPDATE "form_config_selects" SET "label" = "key" WHERE "label" IS NULL;
  ALTER TABLE "form_config_selects" ALTER COLUMN "label" SET NOT NULL;
  ALTER TABLE "pages_blocks_hero" ADD CONSTRAINT "pages_blocks_hero_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_hero" ADD CONSTRAINT "pages_blocks_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_takeaway_list_items" ADD CONSTRAINT "pages_blocks_takeaway_list_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_takeaway_list"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_takeaway_list" ADD CONSTRAINT "pages_blocks_takeaway_list_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_evidence_grid_items" ADD CONSTRAINT "pages_blocks_evidence_grid_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_evidence_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_evidence_grid" ADD CONSTRAINT "pages_blocks_evidence_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_faq_items" ADD CONSTRAINT "pages_blocks_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_faq" ADD CONSTRAINT "pages_blocks_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_glossary_list_terms" ADD CONSTRAINT "pages_blocks_glossary_list_terms_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_glossary_list"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_glossary_list" ADD CONSTRAINT "pages_blocks_glossary_list_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_cta" ADD CONSTRAINT "pages_blocks_cta_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_cta" ADD CONSTRAINT "pages_blocks_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_brief_form" ADD CONSTRAINT "pages_blocks_brief_form_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_hero" ADD CONSTRAINT "_pages_v_blocks_hero_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_hero" ADD CONSTRAINT "_pages_v_blocks_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_takeaway_list_items" ADD CONSTRAINT "_pages_v_blocks_takeaway_list_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_takeaway_list"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_takeaway_list" ADD CONSTRAINT "_pages_v_blocks_takeaway_list_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_evidence_grid_items" ADD CONSTRAINT "_pages_v_blocks_evidence_grid_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_evidence_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_evidence_grid" ADD CONSTRAINT "_pages_v_blocks_evidence_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_faq_items" ADD CONSTRAINT "_pages_v_blocks_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_faq" ADD CONSTRAINT "_pages_v_blocks_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_glossary_list_terms" ADD CONSTRAINT "_pages_v_blocks_glossary_list_terms_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_glossary_list"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_glossary_list" ADD CONSTRAINT "_pages_v_blocks_glossary_list_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_cta" ADD CONSTRAINT "_pages_v_blocks_cta_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_cta" ADD CONSTRAINT "_pages_v_blocks_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_brief_form" ADD CONSTRAINT "_pages_v_blocks_brief_form_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_hero_order_idx" ON "pages_blocks_hero" USING btree ("_order");
  CREATE INDEX "pages_blocks_hero_parent_id_idx" ON "pages_blocks_hero" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_hero_path_idx" ON "pages_blocks_hero" USING btree ("_path");
  CREATE INDEX "pages_blocks_hero_image_idx" ON "pages_blocks_hero" USING btree ("image_id");
  CREATE INDEX "pages_blocks_takeaway_list_items_order_idx" ON "pages_blocks_takeaway_list_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_takeaway_list_items_parent_id_idx" ON "pages_blocks_takeaway_list_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_takeaway_list_order_idx" ON "pages_blocks_takeaway_list" USING btree ("_order");
  CREATE INDEX "pages_blocks_takeaway_list_parent_id_idx" ON "pages_blocks_takeaway_list" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_takeaway_list_path_idx" ON "pages_blocks_takeaway_list" USING btree ("_path");
  CREATE INDEX "pages_blocks_evidence_grid_items_order_idx" ON "pages_blocks_evidence_grid_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_evidence_grid_items_parent_id_idx" ON "pages_blocks_evidence_grid_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_evidence_grid_order_idx" ON "pages_blocks_evidence_grid" USING btree ("_order");
  CREATE INDEX "pages_blocks_evidence_grid_parent_id_idx" ON "pages_blocks_evidence_grid" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_evidence_grid_path_idx" ON "pages_blocks_evidence_grid" USING btree ("_path");
  CREATE INDEX "pages_blocks_faq_items_order_idx" ON "pages_blocks_faq_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_faq_items_parent_id_idx" ON "pages_blocks_faq_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_faq_order_idx" ON "pages_blocks_faq" USING btree ("_order");
  CREATE INDEX "pages_blocks_faq_parent_id_idx" ON "pages_blocks_faq" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_faq_path_idx" ON "pages_blocks_faq" USING btree ("_path");
  CREATE INDEX "pages_blocks_glossary_list_terms_order_idx" ON "pages_blocks_glossary_list_terms" USING btree ("_order");
  CREATE INDEX "pages_blocks_glossary_list_terms_parent_id_idx" ON "pages_blocks_glossary_list_terms" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_glossary_list_order_idx" ON "pages_blocks_glossary_list" USING btree ("_order");
  CREATE INDEX "pages_blocks_glossary_list_parent_id_idx" ON "pages_blocks_glossary_list" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_glossary_list_path_idx" ON "pages_blocks_glossary_list" USING btree ("_path");
  CREATE INDEX "pages_blocks_cta_order_idx" ON "pages_blocks_cta" USING btree ("_order");
  CREATE INDEX "pages_blocks_cta_parent_id_idx" ON "pages_blocks_cta" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_cta_path_idx" ON "pages_blocks_cta" USING btree ("_path");
  CREATE INDEX "pages_blocks_cta_image_idx" ON "pages_blocks_cta" USING btree ("image_id");
  CREATE INDEX "pages_blocks_brief_form_order_idx" ON "pages_blocks_brief_form" USING btree ("_order");
  CREATE INDEX "pages_blocks_brief_form_parent_id_idx" ON "pages_blocks_brief_form" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_brief_form_path_idx" ON "pages_blocks_brief_form" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_hero_order_idx" ON "_pages_v_blocks_hero" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_hero_parent_id_idx" ON "_pages_v_blocks_hero" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_hero_path_idx" ON "_pages_v_blocks_hero" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_hero_image_idx" ON "_pages_v_blocks_hero" USING btree ("image_id");
  CREATE INDEX "_pages_v_blocks_takeaway_list_items_order_idx" ON "_pages_v_blocks_takeaway_list_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_takeaway_list_items_parent_id_idx" ON "_pages_v_blocks_takeaway_list_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_takeaway_list_order_idx" ON "_pages_v_blocks_takeaway_list" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_takeaway_list_parent_id_idx" ON "_pages_v_blocks_takeaway_list" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_takeaway_list_path_idx" ON "_pages_v_blocks_takeaway_list" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_evidence_grid_items_order_idx" ON "_pages_v_blocks_evidence_grid_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_evidence_grid_items_parent_id_idx" ON "_pages_v_blocks_evidence_grid_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_evidence_grid_order_idx" ON "_pages_v_blocks_evidence_grid" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_evidence_grid_parent_id_idx" ON "_pages_v_blocks_evidence_grid" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_evidence_grid_path_idx" ON "_pages_v_blocks_evidence_grid" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_faq_items_order_idx" ON "_pages_v_blocks_faq_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_faq_items_parent_id_idx" ON "_pages_v_blocks_faq_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_faq_order_idx" ON "_pages_v_blocks_faq" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_faq_parent_id_idx" ON "_pages_v_blocks_faq" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_faq_path_idx" ON "_pages_v_blocks_faq" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_glossary_list_terms_order_idx" ON "_pages_v_blocks_glossary_list_terms" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_glossary_list_terms_parent_id_idx" ON "_pages_v_blocks_glossary_list_terms" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_glossary_list_order_idx" ON "_pages_v_blocks_glossary_list" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_glossary_list_parent_id_idx" ON "_pages_v_blocks_glossary_list" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_glossary_list_path_idx" ON "_pages_v_blocks_glossary_list" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_cta_order_idx" ON "_pages_v_blocks_cta" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_cta_parent_id_idx" ON "_pages_v_blocks_cta" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_cta_path_idx" ON "_pages_v_blocks_cta" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_cta_image_idx" ON "_pages_v_blocks_cta" USING btree ("image_id");
  CREATE INDEX "_pages_v_blocks_brief_form_order_idx" ON "_pages_v_blocks_brief_form" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_brief_form_parent_id_idx" ON "_pages_v_blocks_brief_form" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_brief_form_path_idx" ON "_pages_v_blocks_brief_form" USING btree ("_path");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "pages_blocks_hero" CASCADE;
  DROP TABLE "pages_blocks_takeaway_list_items" CASCADE;
  DROP TABLE "pages_blocks_takeaway_list" CASCADE;
  DROP TABLE "pages_blocks_evidence_grid_items" CASCADE;
  DROP TABLE "pages_blocks_evidence_grid" CASCADE;
  DROP TABLE "pages_blocks_faq_items" CASCADE;
  DROP TABLE "pages_blocks_faq" CASCADE;
  DROP TABLE "pages_blocks_glossary_list_terms" CASCADE;
  DROP TABLE "pages_blocks_glossary_list" CASCADE;
  DROP TABLE "pages_blocks_cta" CASCADE;
  DROP TABLE "pages_blocks_brief_form" CASCADE;
  DROP TABLE "_pages_v_blocks_hero" CASCADE;
  DROP TABLE "_pages_v_blocks_takeaway_list_items" CASCADE;
  DROP TABLE "_pages_v_blocks_takeaway_list" CASCADE;
  DROP TABLE "_pages_v_blocks_evidence_grid_items" CASCADE;
  DROP TABLE "_pages_v_blocks_evidence_grid" CASCADE;
  DROP TABLE "_pages_v_blocks_faq_items" CASCADE;
  DROP TABLE "_pages_v_blocks_faq" CASCADE;
  DROP TABLE "_pages_v_blocks_glossary_list_terms" CASCADE;
  DROP TABLE "_pages_v_blocks_glossary_list" CASCADE;
  DROP TABLE "_pages_v_blocks_cta" CASCADE;
  DROP TABLE "_pages_v_blocks_brief_form" CASCADE;
  ALTER TABLE "offices" DROP COLUMN "hours_display";
  ALTER TABLE "offices" DROP COLUMN "footer_role";
  ALTER TABLE "_offices_v" DROP COLUMN "version_hours_display";
  ALTER TABLE "_offices_v" DROP COLUMN "version_footer_role";
  ALTER TABLE "form_config_selects" DROP COLUMN "label";
  DROP TYPE "public"."enum_pages_blocks_hero_variant";
  DROP TYPE "public"."enum_pages_blocks_hero_as";
  DROP TYPE "public"."enum__pages_v_blocks_hero_variant";
  DROP TYPE "public"."enum__pages_v_blocks_hero_as";`)
}
