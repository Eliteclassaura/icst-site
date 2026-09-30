import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_public_routes_slots_kind" AS ENUM('heading', 'text', 'action', 'image', 'copy');
  CREATE TYPE "public"."enum_public_routes_slots_intent" AS ENUM('none', 'quote');
  CREATE TYPE "public"."enum_public_routes_blocks_heading_level" AS ENUM('2', '3');
  CREATE TYPE "public"."enum_public_routes_blocks_button_intent" AS ENUM('none', 'quote');
  CREATE TYPE "public"."enum__public_routes_v_version_slots_kind" AS ENUM('heading', 'text', 'action', 'image', 'copy');
  CREATE TYPE "public"."enum__public_routes_v_version_slots_intent" AS ENUM('none', 'quote');
  CREATE TYPE "public"."enum__public_routes_v_blocks_heading_level" AS ENUM('2', '3');
  CREATE TYPE "public"."enum__public_routes_v_blocks_button_intent" AS ENUM('none', 'quote');
  CREATE TYPE "public"."enum_publication_state_state" AS ENUM('CURRENT', 'BACKLOG', 'FAILED');
  CREATE TYPE "public"."enum_site_chrome_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__site_chrome_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__site_chrome_v_published_locale" AS ENUM('en');
  ALTER TYPE "public"."enum_public_routes_family" ADD VALUE 'editorial';
  ALTER TYPE "public"."enum__public_routes_v_version_family" ADD VALUE 'editorial';
  CREATE TABLE "public_routes_slots" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"kind" "enum_public_routes_slots_kind",
  	"tag" varchar,
  	"element_id" varchar,
  	"title" varchar,
  	"source_hash" varchar,
  	"heading" varchar,
  	"copy" varchar,
  	"text" jsonb,
  	"label" varchar,
  	"href" varchar,
  	"product_route_id" varchar,
  	"intent" "enum_public_routes_slots_intent" DEFAULT 'none',
  	"image_id" uuid,
  	"alt" varchar,
  	"image_url" varchar,
  	"image_width" numeric,
  	"image_height" numeric
  );
  
  CREATE TABLE "public_routes_blocks_heading" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"level" "enum_public_routes_blocks_heading_level" DEFAULT '2',
  	"block_name" varchar
  );
  
  CREATE TABLE "public_routes_blocks_paragraph" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"content" jsonb,
  	"block_name" varchar
  );
  
  CREATE TABLE "public_routes_blocks_image" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" uuid,
  	"alt" varchar,
  	"caption" varchar,
  	"image_url" varchar,
  	"image_width" numeric,
  	"image_height" numeric,
  	"media_alt" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "public_routes_blocks_button" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"href" varchar,
  	"intent" "enum_public_routes_blocks_button_intent" DEFAULT 'none',
  	"block_name" varchar
  );
  
  CREATE TABLE "public_routes_blocks_faq_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" varchar
  );
  
  CREATE TABLE "public_routes_blocks_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "_public_routes_v_version_slots" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"key" varchar,
  	"kind" "enum__public_routes_v_version_slots_kind",
  	"tag" varchar,
  	"element_id" varchar,
  	"title" varchar,
  	"source_hash" varchar,
  	"heading" varchar,
  	"copy" varchar,
  	"text" jsonb,
  	"label" varchar,
  	"href" varchar,
  	"product_route_id" varchar,
  	"intent" "enum__public_routes_v_version_slots_intent" DEFAULT 'none',
  	"image_id" uuid,
  	"alt" varchar,
  	"image_url" varchar,
  	"image_width" numeric,
  	"image_height" numeric,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_public_routes_v_blocks_heading" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"text" varchar,
  	"level" "enum__public_routes_v_blocks_heading_level" DEFAULT '2',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_public_routes_v_blocks_paragraph" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"content" jsonb,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_public_routes_v_blocks_image" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"image_id" uuid,
  	"alt" varchar,
  	"caption" varchar,
  	"image_url" varchar,
  	"image_width" numeric,
  	"image_height" numeric,
  	"media_alt" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_public_routes_v_blocks_button" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"href" varchar,
  	"intent" "enum__public_routes_v_blocks_button_intent" DEFAULT 'none',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_public_routes_v_blocks_faq_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"question" varchar,
  	"answer" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_public_routes_v_blocks_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "site_chrome_navigation_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"href" varchar
  );
  
  CREATE TABLE "site_chrome_navigation_sections_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"href" varchar
  );
  
  CREATE TABLE "site_chrome_navigation_sections" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar
  );
  
  CREATE TABLE "site_chrome_navigation" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"href" varchar
  );
  
  CREATE TABLE "site_chrome_footer_columns_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"href" varchar
  );
  
  CREATE TABLE "site_chrome_footer_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"aria_label" varchar
  );
  
  CREATE TABLE "site_chrome" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"footer_heading" varchar,
  	"footer_contact_label" varchar,
  	"footer_description" varchar,
  	"footer_offices_title" varchar,
  	"footer_offices_contact_label" varchar,
  	"footer_copyright" varchar,
  	"footer_privacy_label" varchar,
  	"footer_privacy_href" varchar,
  	"_status" "enum_site_chrome_status" DEFAULT 'draft',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "_site_chrome_v_version_navigation_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"href" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_site_chrome_v_version_navigation_sections_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"href" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_site_chrome_v_version_navigation_sections" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_site_chrome_v_version_navigation" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"href" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_site_chrome_v_version_footer_columns_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"href" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_site_chrome_v_version_footer_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar,
  	"aria_label" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_site_chrome_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"version_footer_heading" varchar,
  	"version_footer_contact_label" varchar,
  	"version_footer_description" varchar,
  	"version_footer_offices_title" varchar,
  	"version_footer_offices_contact_label" varchar,
  	"version_footer_copyright" varchar,
  	"version_footer_privacy_label" varchar,
  	"version_footer_privacy_href" varchar,
  	"version__status" "enum__site_chrome_v_version_status" DEFAULT 'draft',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__site_chrome_v_published_locale",
  	"latest" boolean
  );
  
  ALTER TABLE "public_routes" ADD COLUMN "requested_path" varchar;
  ALTER TABLE "public_routes" ADD COLUMN "lead" varchar;
  ALTER TABLE "_public_routes_v" ADD COLUMN "version_requested_path" varchar;
  ALTER TABLE "_public_routes_v" ADD COLUMN "version_lead" varchar;
  ALTER TABLE "publication_state" ADD COLUMN "state" "enum_publication_state_state";
  ALTER TABLE "publication_state" ADD COLUMN "release_id" varchar;
  ALTER TABLE "publication_state" ADD COLUMN "release_max_event_seq" numeric;
  ALTER TABLE "publication_state" ADD COLUMN "pending_events" numeric;
  ALTER TABLE "public_routes_slots" ADD CONSTRAINT "public_routes_slots_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "public_routes_slots" ADD CONSTRAINT "public_routes_slots_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."public_routes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "public_routes_blocks_heading" ADD CONSTRAINT "public_routes_blocks_heading_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."public_routes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "public_routes_blocks_paragraph" ADD CONSTRAINT "public_routes_blocks_paragraph_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."public_routes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "public_routes_blocks_image" ADD CONSTRAINT "public_routes_blocks_image_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "public_routes_blocks_image" ADD CONSTRAINT "public_routes_blocks_image_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."public_routes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "public_routes_blocks_button" ADD CONSTRAINT "public_routes_blocks_button_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."public_routes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "public_routes_blocks_faq_items" ADD CONSTRAINT "public_routes_blocks_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."public_routes_blocks_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "public_routes_blocks_faq" ADD CONSTRAINT "public_routes_blocks_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."public_routes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_public_routes_v_version_slots" ADD CONSTRAINT "_public_routes_v_version_slots_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_public_routes_v_version_slots" ADD CONSTRAINT "_public_routes_v_version_slots_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_public_routes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_public_routes_v_blocks_heading" ADD CONSTRAINT "_public_routes_v_blocks_heading_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_public_routes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_public_routes_v_blocks_paragraph" ADD CONSTRAINT "_public_routes_v_blocks_paragraph_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_public_routes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_public_routes_v_blocks_image" ADD CONSTRAINT "_public_routes_v_blocks_image_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_public_routes_v_blocks_image" ADD CONSTRAINT "_public_routes_v_blocks_image_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_public_routes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_public_routes_v_blocks_button" ADD CONSTRAINT "_public_routes_v_blocks_button_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_public_routes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_public_routes_v_blocks_faq_items" ADD CONSTRAINT "_public_routes_v_blocks_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_public_routes_v_blocks_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_public_routes_v_blocks_faq" ADD CONSTRAINT "_public_routes_v_blocks_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_public_routes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_chrome_navigation_items" ADD CONSTRAINT "site_chrome_navigation_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_chrome_navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_chrome_navigation_sections_items" ADD CONSTRAINT "site_chrome_navigation_sections_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_chrome_navigation_sections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_chrome_navigation_sections" ADD CONSTRAINT "site_chrome_navigation_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_chrome_navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_chrome_navigation" ADD CONSTRAINT "site_chrome_navigation_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_chrome"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_chrome_footer_columns_links" ADD CONSTRAINT "site_chrome_footer_columns_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_chrome_footer_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_chrome_footer_columns" ADD CONSTRAINT "site_chrome_footer_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_chrome"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_site_chrome_v_version_navigation_items" ADD CONSTRAINT "_site_chrome_v_version_navigation_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_site_chrome_v_version_navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_site_chrome_v_version_navigation_sections_items" ADD CONSTRAINT "_site_chrome_v_version_navigation_sections_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_site_chrome_v_version_navigation_sections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_site_chrome_v_version_navigation_sections" ADD CONSTRAINT "_site_chrome_v_version_navigation_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_site_chrome_v_version_navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_site_chrome_v_version_navigation" ADD CONSTRAINT "_site_chrome_v_version_navigation_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_site_chrome_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_site_chrome_v_version_footer_columns_links" ADD CONSTRAINT "_site_chrome_v_version_footer_columns_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_site_chrome_v_version_footer_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_site_chrome_v_version_footer_columns" ADD CONSTRAINT "_site_chrome_v_version_footer_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_site_chrome_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "public_routes_slots_order_idx" ON "public_routes_slots" USING btree ("_order");
  CREATE INDEX "public_routes_slots_parent_id_idx" ON "public_routes_slots" USING btree ("_parent_id");
  CREATE INDEX "public_routes_slots_image_idx" ON "public_routes_slots" USING btree ("image_id");
  CREATE INDEX "public_routes_blocks_heading_order_idx" ON "public_routes_blocks_heading" USING btree ("_order");
  CREATE INDEX "public_routes_blocks_heading_parent_id_idx" ON "public_routes_blocks_heading" USING btree ("_parent_id");
  CREATE INDEX "public_routes_blocks_heading_path_idx" ON "public_routes_blocks_heading" USING btree ("_path");
  CREATE INDEX "public_routes_blocks_paragraph_order_idx" ON "public_routes_blocks_paragraph" USING btree ("_order");
  CREATE INDEX "public_routes_blocks_paragraph_parent_id_idx" ON "public_routes_blocks_paragraph" USING btree ("_parent_id");
  CREATE INDEX "public_routes_blocks_paragraph_path_idx" ON "public_routes_blocks_paragraph" USING btree ("_path");
  CREATE INDEX "public_routes_blocks_image_order_idx" ON "public_routes_blocks_image" USING btree ("_order");
  CREATE INDEX "public_routes_blocks_image_parent_id_idx" ON "public_routes_blocks_image" USING btree ("_parent_id");
  CREATE INDEX "public_routes_blocks_image_path_idx" ON "public_routes_blocks_image" USING btree ("_path");
  CREATE INDEX "public_routes_blocks_image_image_idx" ON "public_routes_blocks_image" USING btree ("image_id");
  CREATE INDEX "public_routes_blocks_button_order_idx" ON "public_routes_blocks_button" USING btree ("_order");
  CREATE INDEX "public_routes_blocks_button_parent_id_idx" ON "public_routes_blocks_button" USING btree ("_parent_id");
  CREATE INDEX "public_routes_blocks_button_path_idx" ON "public_routes_blocks_button" USING btree ("_path");
  CREATE INDEX "public_routes_blocks_faq_items_order_idx" ON "public_routes_blocks_faq_items" USING btree ("_order");
  CREATE INDEX "public_routes_blocks_faq_items_parent_id_idx" ON "public_routes_blocks_faq_items" USING btree ("_parent_id");
  CREATE INDEX "public_routes_blocks_faq_order_idx" ON "public_routes_blocks_faq" USING btree ("_order");
  CREATE INDEX "public_routes_blocks_faq_parent_id_idx" ON "public_routes_blocks_faq" USING btree ("_parent_id");
  CREATE INDEX "public_routes_blocks_faq_path_idx" ON "public_routes_blocks_faq" USING btree ("_path");
  CREATE INDEX "_public_routes_v_version_slots_order_idx" ON "_public_routes_v_version_slots" USING btree ("_order");
  CREATE INDEX "_public_routes_v_version_slots_parent_id_idx" ON "_public_routes_v_version_slots" USING btree ("_parent_id");
  CREATE INDEX "_public_routes_v_version_slots_image_idx" ON "_public_routes_v_version_slots" USING btree ("image_id");
  CREATE INDEX "_public_routes_v_blocks_heading_order_idx" ON "_public_routes_v_blocks_heading" USING btree ("_order");
  CREATE INDEX "_public_routes_v_blocks_heading_parent_id_idx" ON "_public_routes_v_blocks_heading" USING btree ("_parent_id");
  CREATE INDEX "_public_routes_v_blocks_heading_path_idx" ON "_public_routes_v_blocks_heading" USING btree ("_path");
  CREATE INDEX "_public_routes_v_blocks_paragraph_order_idx" ON "_public_routes_v_blocks_paragraph" USING btree ("_order");
  CREATE INDEX "_public_routes_v_blocks_paragraph_parent_id_idx" ON "_public_routes_v_blocks_paragraph" USING btree ("_parent_id");
  CREATE INDEX "_public_routes_v_blocks_paragraph_path_idx" ON "_public_routes_v_blocks_paragraph" USING btree ("_path");
  CREATE INDEX "_public_routes_v_blocks_image_order_idx" ON "_public_routes_v_blocks_image" USING btree ("_order");
  CREATE INDEX "_public_routes_v_blocks_image_parent_id_idx" ON "_public_routes_v_blocks_image" USING btree ("_parent_id");
  CREATE INDEX "_public_routes_v_blocks_image_path_idx" ON "_public_routes_v_blocks_image" USING btree ("_path");
  CREATE INDEX "_public_routes_v_blocks_image_image_idx" ON "_public_routes_v_blocks_image" USING btree ("image_id");
  CREATE INDEX "_public_routes_v_blocks_button_order_idx" ON "_public_routes_v_blocks_button" USING btree ("_order");
  CREATE INDEX "_public_routes_v_blocks_button_parent_id_idx" ON "_public_routes_v_blocks_button" USING btree ("_parent_id");
  CREATE INDEX "_public_routes_v_blocks_button_path_idx" ON "_public_routes_v_blocks_button" USING btree ("_path");
  CREATE INDEX "_public_routes_v_blocks_faq_items_order_idx" ON "_public_routes_v_blocks_faq_items" USING btree ("_order");
  CREATE INDEX "_public_routes_v_blocks_faq_items_parent_id_idx" ON "_public_routes_v_blocks_faq_items" USING btree ("_parent_id");
  CREATE INDEX "_public_routes_v_blocks_faq_order_idx" ON "_public_routes_v_blocks_faq" USING btree ("_order");
  CREATE INDEX "_public_routes_v_blocks_faq_parent_id_idx" ON "_public_routes_v_blocks_faq" USING btree ("_parent_id");
  CREATE INDEX "_public_routes_v_blocks_faq_path_idx" ON "_public_routes_v_blocks_faq" USING btree ("_path");
  CREATE INDEX "site_chrome_navigation_items_order_idx" ON "site_chrome_navigation_items" USING btree ("_order");
  CREATE INDEX "site_chrome_navigation_items_parent_id_idx" ON "site_chrome_navigation_items" USING btree ("_parent_id");
  CREATE INDEX "site_chrome_navigation_sections_items_order_idx" ON "site_chrome_navigation_sections_items" USING btree ("_order");
  CREATE INDEX "site_chrome_navigation_sections_items_parent_id_idx" ON "site_chrome_navigation_sections_items" USING btree ("_parent_id");
  CREATE INDEX "site_chrome_navigation_sections_order_idx" ON "site_chrome_navigation_sections" USING btree ("_order");
  CREATE INDEX "site_chrome_navigation_sections_parent_id_idx" ON "site_chrome_navigation_sections" USING btree ("_parent_id");
  CREATE INDEX "site_chrome_navigation_order_idx" ON "site_chrome_navigation" USING btree ("_order");
  CREATE INDEX "site_chrome_navigation_parent_id_idx" ON "site_chrome_navigation" USING btree ("_parent_id");
  CREATE INDEX "site_chrome_footer_columns_links_order_idx" ON "site_chrome_footer_columns_links" USING btree ("_order");
  CREATE INDEX "site_chrome_footer_columns_links_parent_id_idx" ON "site_chrome_footer_columns_links" USING btree ("_parent_id");
  CREATE INDEX "site_chrome_footer_columns_order_idx" ON "site_chrome_footer_columns" USING btree ("_order");
  CREATE INDEX "site_chrome_footer_columns_parent_id_idx" ON "site_chrome_footer_columns" USING btree ("_parent_id");
  CREATE INDEX "site_chrome__status_idx" ON "site_chrome" USING btree ("_status");
  CREATE INDEX "_site_chrome_v_version_navigation_items_order_idx" ON "_site_chrome_v_version_navigation_items" USING btree ("_order");
  CREATE INDEX "_site_chrome_v_version_navigation_items_parent_id_idx" ON "_site_chrome_v_version_navigation_items" USING btree ("_parent_id");
  CREATE INDEX "_site_chrome_v_version_navigation_sections_items_order_idx" ON "_site_chrome_v_version_navigation_sections_items" USING btree ("_order");
  CREATE INDEX "_site_chrome_v_version_navigation_sections_items_parent_id_idx" ON "_site_chrome_v_version_navigation_sections_items" USING btree ("_parent_id");
  CREATE INDEX "_site_chrome_v_version_navigation_sections_order_idx" ON "_site_chrome_v_version_navigation_sections" USING btree ("_order");
  CREATE INDEX "_site_chrome_v_version_navigation_sections_parent_id_idx" ON "_site_chrome_v_version_navigation_sections" USING btree ("_parent_id");
  CREATE INDEX "_site_chrome_v_version_navigation_order_idx" ON "_site_chrome_v_version_navigation" USING btree ("_order");
  CREATE INDEX "_site_chrome_v_version_navigation_parent_id_idx" ON "_site_chrome_v_version_navigation" USING btree ("_parent_id");
  CREATE INDEX "_site_chrome_v_version_footer_columns_links_order_idx" ON "_site_chrome_v_version_footer_columns_links" USING btree ("_order");
  CREATE INDEX "_site_chrome_v_version_footer_columns_links_parent_id_idx" ON "_site_chrome_v_version_footer_columns_links" USING btree ("_parent_id");
  CREATE INDEX "_site_chrome_v_version_footer_columns_order_idx" ON "_site_chrome_v_version_footer_columns" USING btree ("_order");
  CREATE INDEX "_site_chrome_v_version_footer_columns_parent_id_idx" ON "_site_chrome_v_version_footer_columns" USING btree ("_parent_id");
  CREATE INDEX "_site_chrome_v_version_version__status_idx" ON "_site_chrome_v" USING btree ("version__status");
  CREATE INDEX "_site_chrome_v_created_at_idx" ON "_site_chrome_v" USING btree ("created_at");
  CREATE INDEX "_site_chrome_v_updated_at_idx" ON "_site_chrome_v" USING btree ("updated_at");
  CREATE INDEX "_site_chrome_v_snapshot_idx" ON "_site_chrome_v" USING btree ("snapshot");
  CREATE INDEX "_site_chrome_v_published_locale_idx" ON "_site_chrome_v" USING btree ("published_locale");
  CREATE INDEX "_site_chrome_v_latest_idx" ON "_site_chrome_v" USING btree ("latest");
  -- R1B publication protocol (hand-written; not a Payload collection). One row per committed public change,
  -- written in the change's own transaction with its transaction id, so a release can prove which changes
  -- its PostgreSQL snapshot covers (pg_visible_in_snapshot). See src/content/events.ts.
  CREATE TABLE "h2o_publication_events" (
  	"seq" bigserial PRIMARY KEY NOT NULL,
  	"reason" varchar NOT NULL,
  	"route_id" varchar,
  	"route_path" varchar,
  	"xid" xid8 NOT NULL DEFAULT pg_current_xact_id(),
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  CREATE INDEX "h2o_publication_events_created_at_idx" ON "h2o_publication_events" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE IF EXISTS "h2o_publication_events";
   DROP TABLE "public_routes_slots" CASCADE;
  DROP TABLE "public_routes_blocks_heading" CASCADE;
  DROP TABLE "public_routes_blocks_paragraph" CASCADE;
  DROP TABLE "public_routes_blocks_image" CASCADE;
  DROP TABLE "public_routes_blocks_button" CASCADE;
  DROP TABLE "public_routes_blocks_faq_items" CASCADE;
  DROP TABLE "public_routes_blocks_faq" CASCADE;
  DROP TABLE "_public_routes_v_version_slots" CASCADE;
  DROP TABLE "_public_routes_v_blocks_heading" CASCADE;
  DROP TABLE "_public_routes_v_blocks_paragraph" CASCADE;
  DROP TABLE "_public_routes_v_blocks_image" CASCADE;
  DROP TABLE "_public_routes_v_blocks_button" CASCADE;
  DROP TABLE "_public_routes_v_blocks_faq_items" CASCADE;
  DROP TABLE "_public_routes_v_blocks_faq" CASCADE;
  DROP TABLE "site_chrome_navigation_items" CASCADE;
  DROP TABLE "site_chrome_navigation_sections_items" CASCADE;
  DROP TABLE "site_chrome_navigation_sections" CASCADE;
  DROP TABLE "site_chrome_navigation" CASCADE;
  DROP TABLE "site_chrome_footer_columns_links" CASCADE;
  DROP TABLE "site_chrome_footer_columns" CASCADE;
  DROP TABLE "site_chrome" CASCADE;
  DROP TABLE "_site_chrome_v_version_navigation_items" CASCADE;
  DROP TABLE "_site_chrome_v_version_navigation_sections_items" CASCADE;
  DROP TABLE "_site_chrome_v_version_navigation_sections" CASCADE;
  DROP TABLE "_site_chrome_v_version_navigation" CASCADE;
  DROP TABLE "_site_chrome_v_version_footer_columns_links" CASCADE;
  DROP TABLE "_site_chrome_v_version_footer_columns" CASCADE;
  DROP TABLE "_site_chrome_v" CASCADE;
  ALTER TABLE "public_routes" ALTER COLUMN "family" SET DATA TYPE text;
  DROP TYPE "public"."enum_public_routes_family";
  CREATE TYPE "public"."enum_public_routes_family" AS ENUM('salmon', 'live', 'english-service', 'alias', 'search');
  ALTER TABLE "public_routes" ALTER COLUMN "family" SET DATA TYPE "public"."enum_public_routes_family" USING "family"::"public"."enum_public_routes_family";
  ALTER TABLE "_public_routes_v" ALTER COLUMN "version_family" SET DATA TYPE text;
  DROP TYPE "public"."enum__public_routes_v_version_family";
  CREATE TYPE "public"."enum__public_routes_v_version_family" AS ENUM('salmon', 'live', 'english-service', 'alias', 'search');
  ALTER TABLE "_public_routes_v" ALTER COLUMN "version_family" SET DATA TYPE "public"."enum__public_routes_v_version_family" USING "version_family"::"public"."enum__public_routes_v_version_family";
  ALTER TABLE "public_routes" DROP COLUMN "requested_path";
  ALTER TABLE "public_routes" DROP COLUMN "lead";
  ALTER TABLE "_public_routes_v" DROP COLUMN "version_requested_path";
  ALTER TABLE "_public_routes_v" DROP COLUMN "version_lead";
  ALTER TABLE "publication_state" DROP COLUMN "state";
  ALTER TABLE "publication_state" DROP COLUMN "release_id";
  ALTER TABLE "publication_state" DROP COLUMN "release_max_event_seq";
  ALTER TABLE "publication_state" DROP COLUMN "pending_events";
  DROP TYPE "public"."enum_public_routes_slots_kind";
  DROP TYPE "public"."enum_public_routes_slots_intent";
  DROP TYPE "public"."enum_public_routes_blocks_heading_level";
  DROP TYPE "public"."enum_public_routes_blocks_button_intent";
  DROP TYPE "public"."enum__public_routes_v_version_slots_kind";
  DROP TYPE "public"."enum__public_routes_v_version_slots_intent";
  DROP TYPE "public"."enum__public_routes_v_blocks_heading_level";
  DROP TYPE "public"."enum__public_routes_v_blocks_button_intent";
  DROP TYPE "public"."enum_publication_state_state";
  DROP TYPE "public"."enum_site_chrome_status";
  DROP TYPE "public"."enum__site_chrome_v_version_status";
  DROP TYPE "public"."enum__site_chrome_v_published_locale";`)
}
