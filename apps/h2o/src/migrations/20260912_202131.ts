import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_roles" AS ENUM('platform-admin', 'client-admin', 'editor', 'search-analyst', 'sales', 'viewer');
  CREATE TYPE "public"."enum_media_rights" AS ENUM('owned', 'licensed', 'creative-commons', 'ai-generated', 'unknown');
  CREATE TYPE "public"."enum_pages_blocks_hero_variant" AS ENUM('media', 'plain');
  CREATE TYPE "public"."enum_pages_blocks_hero_as" AS ENUM('h1', 'h2');
  CREATE TYPE "public"."enum_pages_blocks_rich_text_measure" AS ENUM('prose', 'wide', 'full');
  CREATE TYPE "public"."enum_pages_blocks_data_table_variant" AS ENUM('plain', 'compare', 'price');
  CREATE TYPE "public"."enum_pages_blocks_steps_layout" AS ENUM('split', 'stack');
  CREATE TYPE "public"."enum_pages_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum_pages_page_type" AS ENUM('standard', 'home', 'service', 'industry', 'location', 'about', 'article', 'category', 'pricing', 'comparison', 'faq', 'glossary', 'contact', 'legal', 'campaign', 'tool', 'case-study', 'build');
  CREATE TYPE "public"."enum_pages_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_pages_migration_source_system" AS ENUM('wordpress', 'static-html', 'copy-deck', 'other');
  CREATE TYPE "public"."enum_pages_migration_decision_action" AS ENUM('PROTECT', 'IMPROVE', 'REWRITE', 'REPOSITION', 'CONSOLIDATE', 'REDIRECT', 'NOINDEX', 'PRUNE', 'REVIEW');
  CREATE TYPE "public"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_blocks_hero_variant" AS ENUM('media', 'plain');
  CREATE TYPE "public"."enum__pages_v_blocks_hero_as" AS ENUM('h1', 'h2');
  CREATE TYPE "public"."enum__pages_v_blocks_rich_text_measure" AS ENUM('prose', 'wide', 'full');
  CREATE TYPE "public"."enum__pages_v_blocks_data_table_variant" AS ENUM('plain', 'compare', 'price');
  CREATE TYPE "public"."enum__pages_v_blocks_steps_layout" AS ENUM('split', 'stack');
  CREATE TYPE "public"."enum__pages_v_version_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum__pages_v_version_page_type" AS ENUM('standard', 'home', 'service', 'industry', 'location', 'about', 'article', 'category', 'pricing', 'comparison', 'faq', 'glossary', 'contact', 'legal', 'campaign', 'tool', 'case-study', 'build');
  CREATE TYPE "public"."enum__pages_v_version_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum__pages_v_version_migration_source_system" AS ENUM('wordpress', 'static-html', 'copy-deck', 'other');
  CREATE TYPE "public"."enum__pages_v_version_migration_decision_action" AS ENUM('PROTECT', 'IMPROVE', 'REWRITE', 'REPOSITION', 'CONSOLIDATE', 'REDIRECT', 'NOINDEX', 'PRUNE', 'REVIEW');
  CREATE TYPE "public"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_locations_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum_people_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum_people_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_people_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__people_v_version_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum__people_v_version_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum__people_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_citations_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_manufacturers_corporate_status" AS ENUM('INDEPENDENT_MANUFACTURER_ACTIVE', 'BRAND_NOW_UNDER_PARENT', 'DIVISION_OF_ANOTHER_COMPANY', 'ICS_OWN_BRAND', 'RESEARCH_REQUIRED');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'schedulePublish');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'schedulePublish');
  CREATE TABLE "users_roles" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum_users_roles",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar,
  	"invited_by_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "media" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"alt" varchar NOT NULL,
  	"decorative" boolean DEFAULT false,
  	"caption" varchar,
  	"rights" "enum_media_rights" NOT NULL,
  	"credit" varchar,
  	"source" varchar,
  	"source_url" varchar,
  	"source_date" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_w480_url" varchar,
  	"sizes_w480_width" numeric,
  	"sizes_w480_height" numeric,
  	"sizes_w480_mime_type" varchar,
  	"sizes_w480_filesize" numeric,
  	"sizes_w480_filename" varchar,
  	"sizes_w760_url" varchar,
  	"sizes_w760_width" numeric,
  	"sizes_w760_height" numeric,
  	"sizes_w760_mime_type" varchar,
  	"sizes_w760_filesize" numeric,
  	"sizes_w760_filename" varchar,
  	"sizes_w1100_url" varchar,
  	"sizes_w1100_width" numeric,
  	"sizes_w1100_height" numeric,
  	"sizes_w1100_mime_type" varchar,
  	"sizes_w1100_filesize" numeric,
  	"sizes_w1100_filename" varchar,
  	"sizes_w1600_url" varchar,
  	"sizes_w1600_width" numeric,
  	"sizes_w1600_height" numeric,
  	"sizes_w1600_mime_type" varchar,
  	"sizes_w1600_filesize" numeric,
  	"sizes_w1600_filename" varchar,
  	"sizes_og_url" varchar,
  	"sizes_og_width" numeric,
  	"sizes_og_height" numeric,
  	"sizes_og_mime_type" varchar,
  	"sizes_og_filesize" numeric,
  	"sizes_og_filename" varchar
  );
  
  CREATE TABLE "pages_blocks_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"lede" varchar,
  	"status" varchar,
  	"eyebrow" varchar,
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
  
  CREATE TABLE "pages_blocks_rich_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"body" jsonb,
  	"measure" "enum_pages_blocks_rich_text_measure" DEFAULT 'prose',
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
  
  CREATE TABLE "pages_blocks_glossary_list_terms_notes" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"text" varchar
  );
  
  CREATE TABLE "pages_blocks_glossary_list_terms" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"schema_id" varchar,
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
  	"schema_set_id" varchar,
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
  	"schema_extra" jsonb,
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
  	"schema_extra" jsonb,
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
  
  CREATE TABLE "pages_seo_schema_types" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum_pages_seo_schema_types",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "pages" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"page_type" "enum_pages_page_type" DEFAULT 'standard',
  	"parent_id" uuid,
  	"legal_effective_date" timestamp(3) with time zone,
  	"legal_jurisdiction" varchar,
  	"legal_version" varchar,
  	"published_at" timestamp(3) with time zone,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical" varchar,
  	"seo_noindex" boolean DEFAULT false,
  	"seo_nofollow" boolean DEFAULT false,
  	"seo_lock" boolean DEFAULT false,
  	"seo_noindex_reason" varchar,
  	"seo_og_title" varchar,
  	"seo_og_description" varchar,
  	"seo_og_image_id" uuid,
  	"seo_og_image_url" varchar,
  	"seo_og_image_alt" varchar,
  	"seo_twitter_description" varchar,
  	"seo_twitter_image_alt" varchar,
  	"seo_primary_topic" varchar,
  	"seo_breadcrumb_title" varchar,
  	"seo_schema_extra" jsonb,
  	"seo_reviewed_at" timestamp(3) with time zone,
  	"seo_content_updated_at" timestamp(3) with time zone,
  	"verification_status" "enum_pages_verification_status" DEFAULT 'unverified',
  	"verification_verified_by_id" uuid,
  	"verification_verified_at" timestamp(3) with time zone,
  	"verification_note" varchar,
  	"migration_source_url" varchar,
  	"migration_source_id" varchar,
  	"migration_source_system" "enum_pages_migration_source_system",
  	"migration_original_title" varchar,
  	"migration_original_meta_description" varchar,
  	"migration_original_h1" varchar,
  	"migration_original_word_count" numeric,
  	"migration_content_hash" varchar,
  	"migration_imported_at" timestamp(3) with time zone,
  	"migration_decisions_version" varchar,
  	"migration_decision_action" "enum_pages_migration_decision_action",
  	"automation_pending_review" boolean DEFAULT false,
  	"automation_run_id" varchar,
  	"automation_last_automation_at" timestamp(3) with time zone,
  	"automation_last_human_edit_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_pages_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "pages_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"people_id" uuid,
  	"citations_id" uuid
  );
  
  CREATE TABLE "_pages_v_blocks_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar,
  	"lede" varchar,
  	"status" varchar,
  	"eyebrow" varchar,
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
  
  CREATE TABLE "_pages_v_blocks_rich_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"body" jsonb,
  	"measure" "enum__pages_v_blocks_rich_text_measure" DEFAULT 'prose',
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
  
  CREATE TABLE "_pages_v_blocks_glossary_list_terms_notes" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"text" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_glossary_list_terms" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"anchor" varchar,
  	"schema_id" varchar,
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
  	"schema_set_id" varchar,
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
  	"schema_extra" jsonb,
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
  	"schema_extra" jsonb,
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
  
  CREATE TABLE "_pages_v_version_seo_schema_types" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum__pages_v_version_seo_schema_types",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "_pages_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_page_type" "enum__pages_v_version_page_type" DEFAULT 'standard',
  	"version_parent_id" uuid,
  	"version_legal_effective_date" timestamp(3) with time zone,
  	"version_legal_jurisdiction" varchar,
  	"version_legal_version" varchar,
  	"version_published_at" timestamp(3) with time zone,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_canonical" varchar,
  	"version_seo_noindex" boolean DEFAULT false,
  	"version_seo_nofollow" boolean DEFAULT false,
  	"version_seo_lock" boolean DEFAULT false,
  	"version_seo_noindex_reason" varchar,
  	"version_seo_og_title" varchar,
  	"version_seo_og_description" varchar,
  	"version_seo_og_image_id" uuid,
  	"version_seo_og_image_url" varchar,
  	"version_seo_og_image_alt" varchar,
  	"version_seo_twitter_description" varchar,
  	"version_seo_twitter_image_alt" varchar,
  	"version_seo_primary_topic" varchar,
  	"version_seo_breadcrumb_title" varchar,
  	"version_seo_schema_extra" jsonb,
  	"version_seo_reviewed_at" timestamp(3) with time zone,
  	"version_seo_content_updated_at" timestamp(3) with time zone,
  	"version_verification_status" "enum__pages_v_version_verification_status" DEFAULT 'unverified',
  	"version_verification_verified_by_id" uuid,
  	"version_verification_verified_at" timestamp(3) with time zone,
  	"version_verification_note" varchar,
  	"version_migration_source_url" varchar,
  	"version_migration_source_id" varchar,
  	"version_migration_source_system" "enum__pages_v_version_migration_source_system",
  	"version_migration_original_title" varchar,
  	"version_migration_original_meta_description" varchar,
  	"version_migration_original_h1" varchar,
  	"version_migration_original_word_count" numeric,
  	"version_migration_content_hash" varchar,
  	"version_migration_imported_at" timestamp(3) with time zone,
  	"version_migration_decisions_version" varchar,
  	"version_migration_decision_action" "enum__pages_v_version_migration_decision_action",
  	"version_automation_pending_review" boolean DEFAULT false,
  	"version_automation_run_id" varchar,
  	"version_automation_last_automation_at" timestamp(3) with time zone,
  	"version_automation_last_human_edit_at" timestamp(3) with time zone,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "_pages_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"people_id" uuid,
  	"citations_id" uuid
  );
  
  CREATE TABLE "locations_seo_schema_types" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum_locations_seo_schema_types",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "locations" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"country" varchar NOT NULL,
  	"region" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical" varchar,
  	"seo_noindex" boolean DEFAULT false,
  	"seo_nofollow" boolean DEFAULT false,
  	"seo_lock" boolean DEFAULT false,
  	"seo_noindex_reason" varchar,
  	"seo_og_title" varchar,
  	"seo_og_description" varchar,
  	"seo_og_image_id" uuid,
  	"seo_og_image_url" varchar,
  	"seo_og_image_alt" varchar,
  	"seo_twitter_description" varchar,
  	"seo_twitter_image_alt" varchar,
  	"seo_primary_topic" varchar,
  	"seo_breadcrumb_title" varchar,
  	"seo_schema_extra" jsonb,
  	"seo_reviewed_at" timestamp(3) with time zone,
  	"seo_content_updated_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "locations_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"citations_id" uuid
  );
  
  CREATE TABLE "audit_log" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"action" varchar NOT NULL,
  	"collection" varchar NOT NULL,
  	"doc_id" varchar,
  	"actor" varchar,
  	"actor_email" varchar,
  	"ip" varchar,
  	"changed_keys" jsonb,
  	"summary" varchar,
  	"detail" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "people_same_as" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar
  );
  
  CREATE TABLE "people_knows_about" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"topic" varchar
  );
  
  CREATE TABLE "people_seo_schema_types" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum_people_seo_schema_types",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "people" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar,
  	"slug" varchar,
  	"job_title" varchar,
  	"bio" jsonb,
  	"photo_id" uuid,
  	"location_id" uuid,
  	"is_author" boolean DEFAULT false,
  	"is_team" boolean DEFAULT true,
  	"schema_id" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical" varchar,
  	"seo_noindex" boolean DEFAULT false,
  	"seo_nofollow" boolean DEFAULT false,
  	"seo_lock" boolean DEFAULT false,
  	"seo_noindex_reason" varchar,
  	"seo_og_title" varchar,
  	"seo_og_description" varchar,
  	"seo_og_image_id" uuid,
  	"seo_og_image_url" varchar,
  	"seo_og_image_alt" varchar,
  	"seo_twitter_description" varchar,
  	"seo_twitter_image_alt" varchar,
  	"seo_primary_topic" varchar,
  	"seo_breadcrumb_title" varchar,
  	"seo_schema_extra" jsonb,
  	"seo_reviewed_at" timestamp(3) with time zone,
  	"seo_content_updated_at" timestamp(3) with time zone,
  	"verification_status" "enum_people_verification_status" DEFAULT 'unverified',
  	"verification_verified_by_id" uuid,
  	"verification_verified_at" timestamp(3) with time zone,
  	"verification_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_people_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "people_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"citations_id" uuid
  );
  
  CREATE TABLE "_people_v_version_same_as" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"url" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_people_v_version_knows_about" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"topic" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_people_v_version_seo_schema_types" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum__people_v_version_seo_schema_types",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "_people_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_name" varchar,
  	"version_slug" varchar,
  	"version_job_title" varchar,
  	"version_bio" jsonb,
  	"version_photo_id" uuid,
  	"version_location_id" uuid,
  	"version_is_author" boolean DEFAULT false,
  	"version_is_team" boolean DEFAULT true,
  	"version_schema_id" varchar,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_canonical" varchar,
  	"version_seo_noindex" boolean DEFAULT false,
  	"version_seo_nofollow" boolean DEFAULT false,
  	"version_seo_lock" boolean DEFAULT false,
  	"version_seo_noindex_reason" varchar,
  	"version_seo_og_title" varchar,
  	"version_seo_og_description" varchar,
  	"version_seo_og_image_id" uuid,
  	"version_seo_og_image_url" varchar,
  	"version_seo_og_image_alt" varchar,
  	"version_seo_twitter_description" varchar,
  	"version_seo_twitter_image_alt" varchar,
  	"version_seo_primary_topic" varchar,
  	"version_seo_breadcrumb_title" varchar,
  	"version_seo_schema_extra" jsonb,
  	"version_seo_reviewed_at" timestamp(3) with time zone,
  	"version_seo_content_updated_at" timestamp(3) with time zone,
  	"version_verification_status" "enum__people_v_version_verification_status" DEFAULT 'unverified',
  	"version_verification_verified_by_id" uuid,
  	"version_verification_verified_at" timestamp(3) with time zone,
  	"version_verification_note" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__people_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_people_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"citations_id" uuid
  );
  
  CREATE TABLE "citations" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"publisher" varchar NOT NULL,
  	"url" varchar,
  	"published_at" timestamp(3) with time zone,
  	"accessed_at" timestamp(3) with time zone,
  	"note" varchar,
  	"verification_status" "enum_citations_verification_status" DEFAULT 'unverified' NOT NULL,
  	"verification_verified_by_id" uuid,
  	"verification_verified_at" timestamp(3) with time zone,
  	"verification_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "manufacturers" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"legal_or_current_name" varchar,
  	"corporate_status" "enum_manufacturers_corporate_status",
  	"official_source_url" varchar,
  	"official_document_url" varchar,
  	"estate_brand_term" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "payload_jobs" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" uuid,
  	"media_id" uuid,
  	"pages_id" uuid,
  	"locations_id" uuid,
  	"audit_log_id" uuid,
  	"people_id" uuid,
  	"citations_id" uuid,
  	"manufacturers_id" uuid
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" uuid
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users_roles" ADD CONSTRAINT "users_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users" ADD CONSTRAINT "users_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_hero" ADD CONSTRAINT "pages_blocks_hero_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_hero" ADD CONSTRAINT "pages_blocks_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_rich_text" ADD CONSTRAINT "pages_blocks_rich_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_takeaway_list_items" ADD CONSTRAINT "pages_blocks_takeaway_list_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_takeaway_list"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_takeaway_list" ADD CONSTRAINT "pages_blocks_takeaway_list_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_evidence_grid_items" ADD CONSTRAINT "pages_blocks_evidence_grid_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_evidence_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_evidence_grid" ADD CONSTRAINT "pages_blocks_evidence_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_faq_items" ADD CONSTRAINT "pages_blocks_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_faq" ADD CONSTRAINT "pages_blocks_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_glossary_list_terms_notes" ADD CONSTRAINT "pages_blocks_glossary_list_terms_notes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_glossary_list_terms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_glossary_list_terms" ADD CONSTRAINT "pages_blocks_glossary_list_terms_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_glossary_list"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_glossary_list" ADD CONSTRAINT "pages_blocks_glossary_list_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_cta" ADD CONSTRAINT "pages_blocks_cta_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_cta" ADD CONSTRAINT "pages_blocks_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_brief_form" ADD CONSTRAINT "pages_blocks_brief_form_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
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
  ALTER TABLE "pages_seo_schema_types" ADD CONSTRAINT "pages_seo_schema_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_seo_og_image_id_media_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_verification_verified_by_id_users_id_fk" FOREIGN KEY ("verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_rels" ADD CONSTRAINT "pages_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_rels" ADD CONSTRAINT "pages_rels_people_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_rels" ADD CONSTRAINT "pages_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_hero" ADD CONSTRAINT "_pages_v_blocks_hero_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_hero" ADD CONSTRAINT "_pages_v_blocks_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_rich_text" ADD CONSTRAINT "_pages_v_blocks_rich_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_takeaway_list_items" ADD CONSTRAINT "_pages_v_blocks_takeaway_list_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_takeaway_list"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_takeaway_list" ADD CONSTRAINT "_pages_v_blocks_takeaway_list_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_evidence_grid_items" ADD CONSTRAINT "_pages_v_blocks_evidence_grid_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_evidence_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_evidence_grid" ADD CONSTRAINT "_pages_v_blocks_evidence_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_faq_items" ADD CONSTRAINT "_pages_v_blocks_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_faq" ADD CONSTRAINT "_pages_v_blocks_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_glossary_list_terms_notes" ADD CONSTRAINT "_pages_v_blocks_glossary_list_terms_notes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_glossary_list_terms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_glossary_list_terms" ADD CONSTRAINT "_pages_v_blocks_glossary_list_terms_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_glossary_list"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_glossary_list" ADD CONSTRAINT "_pages_v_blocks_glossary_list_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_cta" ADD CONSTRAINT "_pages_v_blocks_cta_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_cta" ADD CONSTRAINT "_pages_v_blocks_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_brief_form" ADD CONSTRAINT "_pages_v_blocks_brief_form_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
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
  ALTER TABLE "_pages_v_version_seo_schema_types" ADD CONSTRAINT "_pages_v_version_seo_schema_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_parent_id_pages_id_fk" FOREIGN KEY ("version_parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_seo_og_image_id_media_id_fk" FOREIGN KEY ("version_seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_verification_verified_by_id_users_id_fk" FOREIGN KEY ("version_verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_people_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "locations_seo_schema_types" ADD CONSTRAINT "locations_seo_schema_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "locations" ADD CONSTRAINT "locations_seo_og_image_id_media_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "locations_rels" ADD CONSTRAINT "locations_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "locations_rels" ADD CONSTRAINT "locations_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "people_same_as" ADD CONSTRAINT "people_same_as_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "people_knows_about" ADD CONSTRAINT "people_knows_about_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "people_seo_schema_types" ADD CONSTRAINT "people_seo_schema_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "people" ADD CONSTRAINT "people_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "people" ADD CONSTRAINT "people_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "people" ADD CONSTRAINT "people_seo_og_image_id_media_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "people" ADD CONSTRAINT "people_verification_verified_by_id_users_id_fk" FOREIGN KEY ("verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "people_rels" ADD CONSTRAINT "people_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "people_rels" ADD CONSTRAINT "people_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_people_v_version_same_as" ADD CONSTRAINT "_people_v_version_same_as_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_people_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_people_v_version_knows_about" ADD CONSTRAINT "_people_v_version_knows_about_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_people_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_people_v_version_seo_schema_types" ADD CONSTRAINT "_people_v_version_seo_schema_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_people_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_people_v" ADD CONSTRAINT "_people_v_parent_id_people_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_people_v" ADD CONSTRAINT "_people_v_version_photo_id_media_id_fk" FOREIGN KEY ("version_photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_people_v" ADD CONSTRAINT "_people_v_version_location_id_locations_id_fk" FOREIGN KEY ("version_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_people_v" ADD CONSTRAINT "_people_v_version_seo_og_image_id_media_id_fk" FOREIGN KEY ("version_seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_people_v" ADD CONSTRAINT "_people_v_version_verification_verified_by_id_users_id_fk" FOREIGN KEY ("version_verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_people_v_rels" ADD CONSTRAINT "_people_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_people_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_people_v_rels" ADD CONSTRAINT "_people_v_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "citations" ADD CONSTRAINT "citations_verification_verified_by_id_users_id_fk" FOREIGN KEY ("verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_locations_fk" FOREIGN KEY ("locations_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audit_log_fk" FOREIGN KEY ("audit_log_id") REFERENCES "public"."audit_log"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_people_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_manufacturers_fk" FOREIGN KEY ("manufacturers_id") REFERENCES "public"."manufacturers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_roles_order_idx" ON "users_roles" USING btree ("order");
  CREATE INDEX "users_roles_parent_idx" ON "users_roles" USING btree ("parent_id");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_invited_by_idx" ON "users" USING btree ("invited_by_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_w480_sizes_w480_filename_idx" ON "media" USING btree ("sizes_w480_filename");
  CREATE INDEX "media_sizes_w760_sizes_w760_filename_idx" ON "media" USING btree ("sizes_w760_filename");
  CREATE INDEX "media_sizes_w1100_sizes_w1100_filename_idx" ON "media" USING btree ("sizes_w1100_filename");
  CREATE INDEX "media_sizes_w1600_sizes_w1600_filename_idx" ON "media" USING btree ("sizes_w1600_filename");
  CREATE INDEX "media_sizes_og_sizes_og_filename_idx" ON "media" USING btree ("sizes_og_filename");
  CREATE INDEX "pages_blocks_hero_order_idx" ON "pages_blocks_hero" USING btree ("_order");
  CREATE INDEX "pages_blocks_hero_parent_id_idx" ON "pages_blocks_hero" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_hero_path_idx" ON "pages_blocks_hero" USING btree ("_path");
  CREATE INDEX "pages_blocks_hero_image_idx" ON "pages_blocks_hero" USING btree ("image_id");
  CREATE INDEX "pages_blocks_rich_text_order_idx" ON "pages_blocks_rich_text" USING btree ("_order");
  CREATE INDEX "pages_blocks_rich_text_parent_id_idx" ON "pages_blocks_rich_text" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_rich_text_path_idx" ON "pages_blocks_rich_text" USING btree ("_path");
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
  CREATE INDEX "pages_blocks_glossary_list_terms_notes_order_idx" ON "pages_blocks_glossary_list_terms_notes" USING btree ("_order");
  CREATE INDEX "pages_blocks_glossary_list_terms_notes_parent_id_idx" ON "pages_blocks_glossary_list_terms_notes" USING btree ("_parent_id");
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
  CREATE INDEX "pages_seo_schema_types_order_idx" ON "pages_seo_schema_types" USING btree ("order");
  CREATE INDEX "pages_seo_schema_types_parent_idx" ON "pages_seo_schema_types" USING btree ("parent_id");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
  CREATE INDEX "pages_parent_idx" ON "pages" USING btree ("parent_id");
  CREATE INDEX "pages_seo_seo_og_image_idx" ON "pages" USING btree ("seo_og_image_id");
  CREATE INDEX "pages_verification_verification_verified_by_idx" ON "pages" USING btree ("verification_verified_by_id");
  CREATE INDEX "pages_migration_migration_source_url_idx" ON "pages" USING btree ("migration_source_url");
  CREATE INDEX "pages_migration_migration_decisions_version_idx" ON "pages" USING btree ("migration_decisions_version");
  CREATE INDEX "pages_automation_automation_pending_review_idx" ON "pages" USING btree ("automation_pending_review");
  CREATE INDEX "pages_automation_automation_run_id_idx" ON "pages" USING btree ("automation_run_id");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE INDEX "pages__status_idx" ON "pages" USING btree ("_status");
  CREATE INDEX "pages_rels_order_idx" ON "pages_rels" USING btree ("order");
  CREATE INDEX "pages_rels_parent_idx" ON "pages_rels" USING btree ("parent_id");
  CREATE INDEX "pages_rels_path_idx" ON "pages_rels" USING btree ("path");
  CREATE INDEX "pages_rels_people_id_idx" ON "pages_rels" USING btree ("people_id");
  CREATE INDEX "pages_rels_citations_id_idx" ON "pages_rels" USING btree ("citations_id");
  CREATE INDEX "_pages_v_blocks_hero_order_idx" ON "_pages_v_blocks_hero" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_hero_parent_id_idx" ON "_pages_v_blocks_hero" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_hero_path_idx" ON "_pages_v_blocks_hero" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_hero_image_idx" ON "_pages_v_blocks_hero" USING btree ("image_id");
  CREATE INDEX "_pages_v_blocks_rich_text_order_idx" ON "_pages_v_blocks_rich_text" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_rich_text_parent_id_idx" ON "_pages_v_blocks_rich_text" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_rich_text_path_idx" ON "_pages_v_blocks_rich_text" USING btree ("_path");
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
  CREATE INDEX "_pages_v_blocks_glossary_list_terms_notes_order_idx" ON "_pages_v_blocks_glossary_list_terms_notes" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_glossary_list_terms_notes_parent_id_idx" ON "_pages_v_blocks_glossary_list_terms_notes" USING btree ("_parent_id");
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
  CREATE INDEX "_pages_v_blocks_brief_form_path_idx" ON "_pages_v_blocks_brief_form" USING btree ("_path");
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
  CREATE INDEX "_pages_v_blocks_offices_path_idx" ON "_pages_v_blocks_offices" USING btree ("_path");
  CREATE INDEX "_pages_v_version_seo_schema_types_order_idx" ON "_pages_v_version_seo_schema_types" USING btree ("order");
  CREATE INDEX "_pages_v_version_seo_schema_types_parent_idx" ON "_pages_v_version_seo_schema_types" USING btree ("parent_id");
  CREATE INDEX "_pages_v_parent_idx" ON "_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_version_parent_idx" ON "_pages_v" USING btree ("version_parent_id");
  CREATE INDEX "_pages_v_version_seo_version_seo_og_image_idx" ON "_pages_v" USING btree ("version_seo_og_image_id");
  CREATE INDEX "_pages_v_version_verification_version_verification_verif_idx" ON "_pages_v" USING btree ("version_verification_verified_by_id");
  CREATE INDEX "_pages_v_version_migration_version_migration_source_url_idx" ON "_pages_v" USING btree ("version_migration_source_url");
  CREATE INDEX "_pages_v_version_migration_version_migration_decisions_v_idx" ON "_pages_v" USING btree ("version_migration_decisions_version");
  CREATE INDEX "_pages_v_version_automation_version_automation_pending_r_idx" ON "_pages_v" USING btree ("version_automation_pending_review");
  CREATE INDEX "_pages_v_version_automation_version_automation_run_id_idx" ON "_pages_v" USING btree ("version_automation_run_id");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "_pages_v" USING btree ("version__status");
  CREATE INDEX "_pages_v_created_at_idx" ON "_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_latest_idx" ON "_pages_v" USING btree ("latest");
  CREATE INDEX "_pages_v_autosave_idx" ON "_pages_v" USING btree ("autosave");
  CREATE INDEX "_pages_v_rels_order_idx" ON "_pages_v_rels" USING btree ("order");
  CREATE INDEX "_pages_v_rels_parent_idx" ON "_pages_v_rels" USING btree ("parent_id");
  CREATE INDEX "_pages_v_rels_path_idx" ON "_pages_v_rels" USING btree ("path");
  CREATE INDEX "_pages_v_rels_people_id_idx" ON "_pages_v_rels" USING btree ("people_id");
  CREATE INDEX "_pages_v_rels_citations_id_idx" ON "_pages_v_rels" USING btree ("citations_id");
  CREATE INDEX "locations_seo_schema_types_order_idx" ON "locations_seo_schema_types" USING btree ("order");
  CREATE INDEX "locations_seo_schema_types_parent_idx" ON "locations_seo_schema_types" USING btree ("parent_id");
  CREATE UNIQUE INDEX "locations_slug_idx" ON "locations" USING btree ("slug");
  CREATE INDEX "locations_seo_seo_og_image_idx" ON "locations" USING btree ("seo_og_image_id");
  CREATE INDEX "locations_updated_at_idx" ON "locations" USING btree ("updated_at");
  CREATE INDEX "locations_created_at_idx" ON "locations" USING btree ("created_at");
  CREATE INDEX "locations_rels_order_idx" ON "locations_rels" USING btree ("order");
  CREATE INDEX "locations_rels_parent_idx" ON "locations_rels" USING btree ("parent_id");
  CREATE INDEX "locations_rels_path_idx" ON "locations_rels" USING btree ("path");
  CREATE INDEX "locations_rels_citations_id_idx" ON "locations_rels" USING btree ("citations_id");
  CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");
  CREATE INDEX "audit_log_collection_idx" ON "audit_log" USING btree ("collection");
  CREATE INDEX "audit_log_doc_id_idx" ON "audit_log" USING btree ("doc_id");
  CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor");
  CREATE INDEX "audit_log_updated_at_idx" ON "audit_log" USING btree ("updated_at");
  CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");
  CREATE INDEX "people_same_as_order_idx" ON "people_same_as" USING btree ("_order");
  CREATE INDEX "people_same_as_parent_id_idx" ON "people_same_as" USING btree ("_parent_id");
  CREATE INDEX "people_knows_about_order_idx" ON "people_knows_about" USING btree ("_order");
  CREATE INDEX "people_knows_about_parent_id_idx" ON "people_knows_about" USING btree ("_parent_id");
  CREATE INDEX "people_seo_schema_types_order_idx" ON "people_seo_schema_types" USING btree ("order");
  CREATE INDEX "people_seo_schema_types_parent_idx" ON "people_seo_schema_types" USING btree ("parent_id");
  CREATE UNIQUE INDEX "people_slug_idx" ON "people" USING btree ("slug");
  CREATE INDEX "people_photo_idx" ON "people" USING btree ("photo_id");
  CREATE INDEX "people_location_idx" ON "people" USING btree ("location_id");
  CREATE INDEX "people_seo_seo_og_image_idx" ON "people" USING btree ("seo_og_image_id");
  CREATE INDEX "people_verification_verification_verified_by_idx" ON "people" USING btree ("verification_verified_by_id");
  CREATE INDEX "people_updated_at_idx" ON "people" USING btree ("updated_at");
  CREATE INDEX "people_created_at_idx" ON "people" USING btree ("created_at");
  CREATE INDEX "people__status_idx" ON "people" USING btree ("_status");
  CREATE INDEX "people_rels_order_idx" ON "people_rels" USING btree ("order");
  CREATE INDEX "people_rels_parent_idx" ON "people_rels" USING btree ("parent_id");
  CREATE INDEX "people_rels_path_idx" ON "people_rels" USING btree ("path");
  CREATE INDEX "people_rels_citations_id_idx" ON "people_rels" USING btree ("citations_id");
  CREATE INDEX "_people_v_version_same_as_order_idx" ON "_people_v_version_same_as" USING btree ("_order");
  CREATE INDEX "_people_v_version_same_as_parent_id_idx" ON "_people_v_version_same_as" USING btree ("_parent_id");
  CREATE INDEX "_people_v_version_knows_about_order_idx" ON "_people_v_version_knows_about" USING btree ("_order");
  CREATE INDEX "_people_v_version_knows_about_parent_id_idx" ON "_people_v_version_knows_about" USING btree ("_parent_id");
  CREATE INDEX "_people_v_version_seo_schema_types_order_idx" ON "_people_v_version_seo_schema_types" USING btree ("order");
  CREATE INDEX "_people_v_version_seo_schema_types_parent_idx" ON "_people_v_version_seo_schema_types" USING btree ("parent_id");
  CREATE INDEX "_people_v_parent_idx" ON "_people_v" USING btree ("parent_id");
  CREATE INDEX "_people_v_version_version_slug_idx" ON "_people_v" USING btree ("version_slug");
  CREATE INDEX "_people_v_version_version_photo_idx" ON "_people_v" USING btree ("version_photo_id");
  CREATE INDEX "_people_v_version_version_location_idx" ON "_people_v" USING btree ("version_location_id");
  CREATE INDEX "_people_v_version_seo_version_seo_og_image_idx" ON "_people_v" USING btree ("version_seo_og_image_id");
  CREATE INDEX "_people_v_version_verification_version_verification_veri_idx" ON "_people_v" USING btree ("version_verification_verified_by_id");
  CREATE INDEX "_people_v_version_version_updated_at_idx" ON "_people_v" USING btree ("version_updated_at");
  CREATE INDEX "_people_v_version_version_created_at_idx" ON "_people_v" USING btree ("version_created_at");
  CREATE INDEX "_people_v_version_version__status_idx" ON "_people_v" USING btree ("version__status");
  CREATE INDEX "_people_v_created_at_idx" ON "_people_v" USING btree ("created_at");
  CREATE INDEX "_people_v_updated_at_idx" ON "_people_v" USING btree ("updated_at");
  CREATE INDEX "_people_v_latest_idx" ON "_people_v" USING btree ("latest");
  CREATE INDEX "_people_v_rels_order_idx" ON "_people_v_rels" USING btree ("order");
  CREATE INDEX "_people_v_rels_parent_idx" ON "_people_v_rels" USING btree ("parent_id");
  CREATE INDEX "_people_v_rels_path_idx" ON "_people_v_rels" USING btree ("path");
  CREATE INDEX "_people_v_rels_citations_id_idx" ON "_people_v_rels" USING btree ("citations_id");
  CREATE INDEX "citations_verification_verification_verified_by_idx" ON "citations" USING btree ("verification_verified_by_id");
  CREATE INDEX "citations_updated_at_idx" ON "citations" USING btree ("updated_at");
  CREATE INDEX "citations_created_at_idx" ON "citations" USING btree ("created_at");
  CREATE INDEX "manufacturers_updated_at_idx" ON "manufacturers" USING btree ("updated_at");
  CREATE INDEX "manufacturers_created_at_idx" ON "manufacturers" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_locations_id_idx" ON "payload_locked_documents_rels" USING btree ("locations_id");
  CREATE INDEX "payload_locked_documents_rels_audit_log_id_idx" ON "payload_locked_documents_rels" USING btree ("audit_log_id");
  CREATE INDEX "payload_locked_documents_rels_people_id_idx" ON "payload_locked_documents_rels" USING btree ("people_id");
  CREATE INDEX "payload_locked_documents_rels_citations_id_idx" ON "payload_locked_documents_rels" USING btree ("citations_id");
  CREATE INDEX "payload_locked_documents_rels_manufacturers_id_idx" ON "payload_locked_documents_rels" USING btree ("manufacturers_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_roles" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "pages_blocks_hero" CASCADE;
  DROP TABLE "pages_blocks_rich_text" CASCADE;
  DROP TABLE "pages_blocks_takeaway_list_items" CASCADE;
  DROP TABLE "pages_blocks_takeaway_list" CASCADE;
  DROP TABLE "pages_blocks_evidence_grid_items" CASCADE;
  DROP TABLE "pages_blocks_evidence_grid" CASCADE;
  DROP TABLE "pages_blocks_faq_items" CASCADE;
  DROP TABLE "pages_blocks_faq" CASCADE;
  DROP TABLE "pages_blocks_glossary_list_terms_notes" CASCADE;
  DROP TABLE "pages_blocks_glossary_list_terms" CASCADE;
  DROP TABLE "pages_blocks_glossary_list" CASCADE;
  DROP TABLE "pages_blocks_cta" CASCADE;
  DROP TABLE "pages_blocks_brief_form" CASCADE;
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
  DROP TABLE "pages_seo_schema_types" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "pages_rels" CASCADE;
  DROP TABLE "_pages_v_blocks_hero" CASCADE;
  DROP TABLE "_pages_v_blocks_rich_text" CASCADE;
  DROP TABLE "_pages_v_blocks_takeaway_list_items" CASCADE;
  DROP TABLE "_pages_v_blocks_takeaway_list" CASCADE;
  DROP TABLE "_pages_v_blocks_evidence_grid_items" CASCADE;
  DROP TABLE "_pages_v_blocks_evidence_grid" CASCADE;
  DROP TABLE "_pages_v_blocks_faq_items" CASCADE;
  DROP TABLE "_pages_v_blocks_faq" CASCADE;
  DROP TABLE "_pages_v_blocks_glossary_list_terms_notes" CASCADE;
  DROP TABLE "_pages_v_blocks_glossary_list_terms" CASCADE;
  DROP TABLE "_pages_v_blocks_glossary_list" CASCADE;
  DROP TABLE "_pages_v_blocks_cta" CASCADE;
  DROP TABLE "_pages_v_blocks_brief_form" CASCADE;
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
  DROP TABLE "_pages_v_version_seo_schema_types" CASCADE;
  DROP TABLE "_pages_v" CASCADE;
  DROP TABLE "_pages_v_rels" CASCADE;
  DROP TABLE "locations_seo_schema_types" CASCADE;
  DROP TABLE "locations" CASCADE;
  DROP TABLE "locations_rels" CASCADE;
  DROP TABLE "audit_log" CASCADE;
  DROP TABLE "people_same_as" CASCADE;
  DROP TABLE "people_knows_about" CASCADE;
  DROP TABLE "people_seo_schema_types" CASCADE;
  DROP TABLE "people" CASCADE;
  DROP TABLE "people_rels" CASCADE;
  DROP TABLE "_people_v_version_same_as" CASCADE;
  DROP TABLE "_people_v_version_knows_about" CASCADE;
  DROP TABLE "_people_v_version_seo_schema_types" CASCADE;
  DROP TABLE "_people_v" CASCADE;
  DROP TABLE "_people_v_rels" CASCADE;
  DROP TABLE "citations" CASCADE;
  DROP TABLE "manufacturers" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_jobs_log" CASCADE;
  DROP TABLE "payload_jobs" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_users_roles";
  DROP TYPE "public"."enum_media_rights";
  DROP TYPE "public"."enum_pages_blocks_hero_variant";
  DROP TYPE "public"."enum_pages_blocks_hero_as";
  DROP TYPE "public"."enum_pages_blocks_rich_text_measure";
  DROP TYPE "public"."enum_pages_blocks_data_table_variant";
  DROP TYPE "public"."enum_pages_blocks_steps_layout";
  DROP TYPE "public"."enum_pages_seo_schema_types";
  DROP TYPE "public"."enum_pages_page_type";
  DROP TYPE "public"."enum_pages_verification_status";
  DROP TYPE "public"."enum_pages_migration_source_system";
  DROP TYPE "public"."enum_pages_migration_decision_action";
  DROP TYPE "public"."enum_pages_status";
  DROP TYPE "public"."enum__pages_v_blocks_hero_variant";
  DROP TYPE "public"."enum__pages_v_blocks_hero_as";
  DROP TYPE "public"."enum__pages_v_blocks_rich_text_measure";
  DROP TYPE "public"."enum__pages_v_blocks_data_table_variant";
  DROP TYPE "public"."enum__pages_v_blocks_steps_layout";
  DROP TYPE "public"."enum__pages_v_version_seo_schema_types";
  DROP TYPE "public"."enum__pages_v_version_page_type";
  DROP TYPE "public"."enum__pages_v_version_verification_status";
  DROP TYPE "public"."enum__pages_v_version_migration_source_system";
  DROP TYPE "public"."enum__pages_v_version_migration_decision_action";
  DROP TYPE "public"."enum__pages_v_version_status";
  DROP TYPE "public"."enum_locations_seo_schema_types";
  DROP TYPE "public"."enum_people_seo_schema_types";
  DROP TYPE "public"."enum_people_verification_status";
  DROP TYPE "public"."enum_people_status";
  DROP TYPE "public"."enum__people_v_version_seo_schema_types";
  DROP TYPE "public"."enum__people_v_version_verification_status";
  DROP TYPE "public"."enum__people_v_version_status";
  DROP TYPE "public"."enum_citations_verification_status";
  DROP TYPE "public"."enum_manufacturers_corporate_status";
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE "public"."enum_payload_jobs_log_state";
  DROP TYPE "public"."enum_payload_jobs_task_slug";`)
}
