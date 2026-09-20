import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."_locales" AS ENUM('en');
  CREATE TYPE "public"."enum__pages_v_published_locale" AS ENUM('en');
  CREATE TYPE "public"."enum__people_v_published_locale" AS ENUM('en');
  CREATE TYPE "public"."enum_product_categories_state" AS ENUM('USABLE', 'MALFORMED_TERM_REVIEW_REQUIRED', 'DUPLICATE_NAME_REVIEW_REQUIRED', 'EMPTY_TERM_REVIEW_REQUIRED');
  CREATE TYPE "public"."enum_product_families_seo_robots" AS ENUM('index', 'noindex');
  CREATE TYPE "public"."enum_product_media_image_state" AS ENUM('ORIGINAL_VERIFIED', 'AI_ENHANCED_VERIFIED', 'AI_COMPOSITE_MARKETING', 'AI_RECONSTRUCTED_ILLUSTRATIVE');
  CREATE TYPE "public"."enum_product_media_exact_product_match" AS ENUM('EXACT', 'FAMILY_ONLY', 'NOT_ESTABLISHED');
  CREATE TYPE "public"."enum_product_media_rights_status" AS ENUM('ICS_OWNED', 'MANUFACTURER_PERMITTED', 'REVIEW_RIGHTS');
  CREATE TYPE "public"."enum_product_documents_document_type" AS ENUM('MANUAL_OR_INSTALLATION', 'DATASHEET_OR_SPECIFICATION', 'CATALOG', 'BROCHURE', 'FORM_OR_DATA_SHEET', 'CERTIFICATE_OR_CREDENTIAL', 'EDUCATIONAL_REFERENCE', 'QUOTATION_HISTORICAL', 'UNCLASSIFIED_REVIEW_REQUIRED');
  CREATE TYPE "public"."enum_product_documents_rights_status" AS ENUM('ICS_OWNED', 'MANUFACTURER_PERMITTED', 'REVIEW_RIGHTS', 'LINK_ONLY');
  CREATE TYPE "public"."enum_product_evidence_evidence_state" AS ENUM('VERIFIED_MANUFACTURER', 'VERIFIED_ICS', 'LEGACY_ICS', 'AUTHORIZED_DISTRIBUTOR', 'THIRD_PARTY_SUPPORTING', 'AI_DRAFT_UNVERIFIED', 'UNKNOWN');
  CREATE TYPE "public"."enum_product_evidence_exact_model_match" AS ENUM('EXACT', 'FAMILY', 'NOT_ESTABLISHED');
  CREATE TYPE "public"."enum_product_evidence_confidence" AS ENUM('HIGH', 'MEDIUM', 'LOW');
  CREATE TYPE "public"."enum_product_evidence_reviewer_status" AS ENUM('UNREVIEWED', 'APPROVED', 'REJECTED');
  CREATE TYPE "public"."enum_products_legacy_urls_redirect_type" AS ENUM('301', '410', 'KEEP');
  CREATE TYPE "public"."enum_products_completeness_checks_check" AS ENUM('PRODUCT_IDENTITY', 'MANUFACTURER', 'MODEL', 'FAMILY', 'IDENTIFIERS', 'TECHNICAL_FACT_PROVENANCE', 'UNIQUE_USEFUL_CONTENT', 'SPECIFICATIONS', 'APPLICATIONS', 'COMPATIBILITY', 'PRIMARY_IMAGE', 'IMAGE_EXACTNESS', 'ADDITIONAL_MEDIA', 'DOCUMENTS', 'DOCUMENT_URL_MIGRATION', 'INTERNAL_LINKS', 'RELATED_SERVICES', 'TITLE_H1_META', 'CANONICAL', 'INDEXABILITY', 'STRUCTURED_DATA', 'LOCALE_HREFLANG', 'RFQ_CTA', 'CHAT_CONTEXT', 'CRM_ROUTE', 'ATTRIBUTION', 'MOBILE', 'ACCESSIBILITY', 'PERFORMANCE', 'TRUTH_REVIEW');
  CREATE TYPE "public"."enum_products_completeness_checks_state" AS ENUM('PASS', 'NOT_APPLICABLE', 'UNKNOWN', 'REVIEW_REQUIRED', 'BLOCKED');
  CREATE TYPE "public"."enum_products_manufacturer_evidence_state" AS ENUM('VERIFIED_MANUFACTURER', 'VERIFIED_ICS', 'LEGACY_ICS', 'AUTHORIZED_DISTRIBUTOR', 'THIRD_PARTY_SUPPORTING', 'AI_DRAFT_UNVERIFIED', 'UNKNOWN');
  CREATE TYPE "public"."enum_products_manufacturer_evidence_unknown_reason" AS ENUM('NO_BRAND_TERM_IN_ESTATE', 'BRAND_TERM_AMBIGUOUS', 'MULTIPLE_BRANDS_ON_ONE_RECORD', 'RESEARCH_PENDING', 'NOT_APPLICABLE');
  CREATE TYPE "public"."enum_products_identifiers_identifier_state" AS ENUM('VERIFIED_MANUFACTURER', 'VERIFIED_ICS', 'AI_EXTRACTED_UNCONFIRMED', 'ABSENT', 'UNKNOWN');
  CREATE TYPE "public"."enum_products_commerce_mode" AS ENUM('QUOTE_ONLY', 'FIXED_PRICE_PURCHASABLE', 'REVIEW');
  CREATE TYPE "public"."enum_products_seo_robots" AS ENUM('index', 'noindex');
  CREATE TYPE "public"."enum_products_truth_status" AS ENUM('VERIFIED_MANUFACTURER', 'VERIFIED_ICS', 'LEGACY_ICS', 'AUTHORIZED_DISTRIBUTOR', 'THIRD_PARTY_SUPPORTING', 'AI_DRAFT_UNVERIFIED', 'UNKNOWN');
  CREATE TYPE "public"."enum_products_editorial_state" AS ENUM('INCOMPLETE', 'RESEARCHING', 'AI_DRAFT', 'TECH_REVIEW', 'SEO_REVIEW', 'READY', 'PUBLISHED', 'RETIRED');
  CREATE TYPE "public"."enum_products_completeness_state" AS ENUM('PASS', 'NOT_APPLICABLE', 'UNKNOWN', 'REVIEW_REQUIRED', 'BLOCKED');
  CREATE TYPE "public"."enum_products_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__products_v_version_legacy_urls_redirect_type" AS ENUM('301', '410', 'KEEP');
  CREATE TYPE "public"."enum__products_v_version_completeness_checks_check" AS ENUM('PRODUCT_IDENTITY', 'MANUFACTURER', 'MODEL', 'FAMILY', 'IDENTIFIERS', 'TECHNICAL_FACT_PROVENANCE', 'UNIQUE_USEFUL_CONTENT', 'SPECIFICATIONS', 'APPLICATIONS', 'COMPATIBILITY', 'PRIMARY_IMAGE', 'IMAGE_EXACTNESS', 'ADDITIONAL_MEDIA', 'DOCUMENTS', 'DOCUMENT_URL_MIGRATION', 'INTERNAL_LINKS', 'RELATED_SERVICES', 'TITLE_H1_META', 'CANONICAL', 'INDEXABILITY', 'STRUCTURED_DATA', 'LOCALE_HREFLANG', 'RFQ_CTA', 'CHAT_CONTEXT', 'CRM_ROUTE', 'ATTRIBUTION', 'MOBILE', 'ACCESSIBILITY', 'PERFORMANCE', 'TRUTH_REVIEW');
  CREATE TYPE "public"."enum__products_v_version_completeness_checks_state" AS ENUM('PASS', 'NOT_APPLICABLE', 'UNKNOWN', 'REVIEW_REQUIRED', 'BLOCKED');
  CREATE TYPE "public"."enum__products_v_version_manufacturer_evidence_state" AS ENUM('VERIFIED_MANUFACTURER', 'VERIFIED_ICS', 'LEGACY_ICS', 'AUTHORIZED_DISTRIBUTOR', 'THIRD_PARTY_SUPPORTING', 'AI_DRAFT_UNVERIFIED', 'UNKNOWN');
  CREATE TYPE "public"."enum__products_v_version_manufacturer_evidence_unknown_reason" AS ENUM('NO_BRAND_TERM_IN_ESTATE', 'BRAND_TERM_AMBIGUOUS', 'MULTIPLE_BRANDS_ON_ONE_RECORD', 'RESEARCH_PENDING', 'NOT_APPLICABLE');
  CREATE TYPE "public"."enum__products_v_version_identifiers_identifier_state" AS ENUM('VERIFIED_MANUFACTURER', 'VERIFIED_ICS', 'AI_EXTRACTED_UNCONFIRMED', 'ABSENT', 'UNKNOWN');
  CREATE TYPE "public"."enum__products_v_version_commerce_mode" AS ENUM('QUOTE_ONLY', 'FIXED_PRICE_PURCHASABLE', 'REVIEW');
  CREATE TYPE "public"."enum__products_v_version_seo_robots" AS ENUM('index', 'noindex');
  CREATE TYPE "public"."enum__products_v_version_truth_status" AS ENUM('VERIFIED_MANUFACTURER', 'VERIFIED_ICS', 'LEGACY_ICS', 'AUTHORIZED_DISTRIBUTOR', 'THIRD_PARTY_SUPPORTING', 'AI_DRAFT_UNVERIFIED', 'UNKNOWN');
  CREATE TYPE "public"."enum__products_v_version_editorial_state" AS ENUM('INCOMPLETE', 'RESEARCHING', 'AI_DRAFT', 'TECH_REVIEW', 'SEO_REVIEW', 'READY', 'PUBLISHED', 'RETIRED');
  CREATE TYPE "public"."enum__products_v_version_completeness_state" AS ENUM('PASS', 'NOT_APPLICABLE', 'UNKNOWN', 'REVIEW_REQUIRED', 'BLOCKED');
  CREATE TYPE "public"."enum__products_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__products_v_published_locale" AS ENUM('en');
  CREATE TYPE "public"."enum_pricing_observations_observation_type" AS ENUM('THIRD_PARTY_OBSERVED_PRICE', 'THIRD_PARTY_NO_PUBLIC_PRICE', 'HISTORICAL_ICS_SITE_VALUE', 'ICS_INTERNAL_TARGET_PRICE');
  CREATE TYPE "public"."enum_pricing_observations_match_confidence" AS ENUM('EXACT_SAME_RECORD', 'EXACT_MODEL_MATCH', 'PARTIAL_FAMILY_MATCH_NOT_EXACT_CONFIGURATION', 'NOT_ESTABLISHED');
  CREATE TABLE "product_categories" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"parent_id" uuid,
  	"state" "enum_product_categories_state",
  	"indexable" boolean,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "product_families" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"manufacturer_id" uuid NOT NULL,
  	"category_id" uuid,
  	"seo_canonical" varchar,
  	"seo_robots" "enum_product_families_seo_robots",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "product_families_locales" (
  	"narrative_summary" jsonb,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" uuid NOT NULL
  );
  
  CREATE TABLE "product_families_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"products_id" uuid
  );
  
  CREATE TABLE "product_media" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"image_state" "enum_product_media_image_state" NOT NULL,
  	"exact_product_match" "enum_product_media_exact_product_match",
  	"original_asset_id" uuid,
  	"legacy_url" varchar,
  	"rights_status" "enum_product_media_rights_status",
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
  	"focal_y" numeric
  );
  
  CREATE TABLE "product_media_locales" (
  	"alt" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" uuid NOT NULL
  );
  
  CREATE TABLE "product_document_files" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"sha256" varchar NOT NULL,
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
  	"focal_y" numeric
  );
  
  CREATE TABLE "product_documents" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"document_type" "enum_product_documents_document_type",
  	"manufacturer_id" uuid,
  	"model_association" varchar,
  	"file_id" uuid NOT NULL,
  	"sha256" varchar NOT NULL,
  	"bytes" numeric,
  	"version_or_date" varchar,
  	"language" varchar,
  	"rights_status" "enum_product_documents_rights_status",
  	"legacy_url" varchar,
  	"indexable" boolean,
  	"canonical" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "product_evidence" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"product_id" uuid NOT NULL,
  	"field" varchar NOT NULL,
  	"value" varchar,
  	"evidence_state" "enum_product_evidence_evidence_state" NOT NULL,
  	"source_url" varchar,
  	"source_title" varchar,
  	"source_tier" varchar,
  	"exact_model_match" "enum_product_evidence_exact_model_match",
  	"retrieved_date" timestamp(3) with time zone,
  	"source_document_version" varchar,
  	"ai_extracted" boolean,
  	"confidence" "enum_product_evidence_confidence",
  	"reviewer_status" "enum_product_evidence_reviewer_status",
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "products_narrative_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" jsonb
  );
  
  CREATE TABLE "products_specifications" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"value" varchar,
  	"unit" varchar,
  	"evidence_id" uuid
  );
  
  CREATE TABLE "products_legacy_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar,
  	"redirect_type" "enum_products_legacy_urls_redirect_type",
  	"pre_existing_live_redirect" boolean
  );
  
  CREATE TABLE "products_locale_state_translations" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"locale" varchar,
  	"url" varchar
  );
  
  CREATE TABLE "products_completeness_checks" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"check" "enum_products_completeness_checks_check",
  	"state" "enum_products_completeness_checks_state",
  	"note" varchar
  );
  
  CREATE TABLE "products" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"manufacturer_id" uuid,
  	"manufacturer_evidence_state" "enum_products_manufacturer_evidence_state" DEFAULT 'UNKNOWN',
  	"manufacturer_evidence_estate_brand_term" varchar,
  	"manufacturer_evidence_unknown_reason" "enum_products_manufacturer_evidence_unknown_reason",
  	"family_id" uuid,
  	"model_designation" varchar,
  	"identifiers_mpn" varchar,
  	"identifiers_gtin" varchar,
  	"identifiers_ics_sku" varchar,
  	"identifiers_identifier_state" "enum_products_identifiers_identifier_state" DEFAULT 'UNKNOWN',
  	"commerce_mode" "enum_products_commerce_mode" DEFAULT 'QUOTE_ONLY',
  	"fixed_price_research_candidate" boolean DEFAULT false,
  	"public_price_amount" numeric,
  	"public_price_currency" varchar,
  	"public_price_approved_by" varchar,
  	"public_price_approved_at" timestamp(3) with time zone,
  	"seo_canonical" varchar,
  	"seo_robots" "enum_products_seo_robots",
  	"locale_state_source_locale" varchar DEFAULT 'en',
  	"locale_state_hreflang_eligible" boolean,
  	"truth_status" "enum_products_truth_status" DEFAULT 'LEGACY_ICS',
  	"editorial_state" "enum_products_editorial_state" DEFAULT 'INCOMPLETE',
  	"completeness_state" "enum_products_completeness_state",
  	"completeness_last_evaluated" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_products_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "products_locales" (
  	"narrative_summary" jsonb,
  	"narrative_applications" jsonb,
  	"narrative_compatibility" jsonb,
  	"narrative_features" jsonb,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" uuid NOT NULL
  );
  
  CREATE TABLE "products_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"product_evidence_id" uuid,
  	"products_id" uuid,
  	"product_media_id" uuid,
  	"product_documents_id" uuid,
  	"pages_id" uuid
  );
  
  CREATE TABLE "_products_v_version_narrative_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"question" varchar,
  	"answer" jsonb,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_products_v_version_specifications" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar,
  	"value" varchar,
  	"unit" varchar,
  	"evidence_id" uuid,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_products_v_version_legacy_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"path" varchar,
  	"redirect_type" "enum__products_v_version_legacy_urls_redirect_type",
  	"pre_existing_live_redirect" boolean,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_products_v_version_locale_state_translations" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"locale" varchar,
  	"url" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_products_v_version_completeness_checks" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"check" "enum__products_v_version_completeness_checks_check",
  	"state" "enum__products_v_version_completeness_checks_state",
  	"note" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_products_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_manufacturer_id" uuid,
  	"version_manufacturer_evidence_state" "enum__products_v_version_manufacturer_evidence_state" DEFAULT 'UNKNOWN',
  	"version_manufacturer_evidence_estate_brand_term" varchar,
  	"version_manufacturer_evidence_unknown_reason" "enum__products_v_version_manufacturer_evidence_unknown_reason",
  	"version_family_id" uuid,
  	"version_model_designation" varchar,
  	"version_identifiers_mpn" varchar,
  	"version_identifiers_gtin" varchar,
  	"version_identifiers_ics_sku" varchar,
  	"version_identifiers_identifier_state" "enum__products_v_version_identifiers_identifier_state" DEFAULT 'UNKNOWN',
  	"version_commerce_mode" "enum__products_v_version_commerce_mode" DEFAULT 'QUOTE_ONLY',
  	"version_fixed_price_research_candidate" boolean DEFAULT false,
  	"version_public_price_amount" numeric,
  	"version_public_price_currency" varchar,
  	"version_public_price_approved_by" varchar,
  	"version_public_price_approved_at" timestamp(3) with time zone,
  	"version_seo_canonical" varchar,
  	"version_seo_robots" "enum__products_v_version_seo_robots",
  	"version_locale_state_source_locale" varchar DEFAULT 'en',
  	"version_locale_state_hreflang_eligible" boolean,
  	"version_truth_status" "enum__products_v_version_truth_status" DEFAULT 'LEGACY_ICS',
  	"version_editorial_state" "enum__products_v_version_editorial_state" DEFAULT 'INCOMPLETE',
  	"version_completeness_state" "enum__products_v_version_completeness_state",
  	"version_completeness_last_evaluated" timestamp(3) with time zone,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__products_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__products_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_products_v_locales" (
  	"version_narrative_summary" jsonb,
  	"version_narrative_applications" jsonb,
  	"version_narrative_compatibility" jsonb,
  	"version_narrative_features" jsonb,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" uuid NOT NULL
  );
  
  CREATE TABLE "_products_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"product_evidence_id" uuid,
  	"products_id" uuid,
  	"product_media_id" uuid,
  	"product_documents_id" uuid,
  	"pages_id" uuid
  );
  
  CREATE TABLE "pricing_observations" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"observation_type" "enum_pricing_observations_observation_type" NOT NULL,
  	"product_id" uuid,
  	"seller" varchar,
  	"source_url" varchar,
  	"observed_date" timestamp(3) with time zone,
  	"exact_model" varchar,
  	"match_confidence" "enum_pricing_observations_match_confidence",
  	"amount" numeric,
  	"currency" varchar,
  	"condition" varchar,
  	"configuration_or_options" varchar,
  	"stock_availability" varchar,
  	"shipping_or_freight" varchar,
  	"territory" varchar,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "_pages_v" ADD COLUMN "snapshot" boolean;
  ALTER TABLE "_pages_v" ADD COLUMN "published_locale" "enum__pages_v_published_locale";
  ALTER TABLE "_people_v" ADD COLUMN "snapshot" boolean;
  ALTER TABLE "_people_v" ADD COLUMN "published_locale" "enum__people_v_published_locale";
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "product_categories_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "product_families_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "product_media_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "product_document_files_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "product_documents_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "product_evidence_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "products_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "pricing_observations_id" uuid;
  ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_id_product_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."product_categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "product_families" ADD CONSTRAINT "product_families_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "product_families" ADD CONSTRAINT "product_families_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "product_families_locales" ADD CONSTRAINT "product_families_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."product_families"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "product_families_rels" ADD CONSTRAINT "product_families_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."product_families"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "product_families_rels" ADD CONSTRAINT "product_families_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "product_media" ADD CONSTRAINT "product_media_original_asset_id_product_media_id_fk" FOREIGN KEY ("original_asset_id") REFERENCES "public"."product_media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "product_media_locales" ADD CONSTRAINT "product_media_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."product_media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "product_documents" ADD CONSTRAINT "product_documents_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "product_documents" ADD CONSTRAINT "product_documents_file_id_product_document_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."product_document_files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "product_evidence" ADD CONSTRAINT "product_evidence_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_narrative_faq" ADD CONSTRAINT "products_narrative_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_specifications" ADD CONSTRAINT "products_specifications_evidence_id_product_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."product_evidence"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_specifications" ADD CONSTRAINT "products_specifications_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_legacy_urls" ADD CONSTRAINT "products_legacy_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_locale_state_translations" ADD CONSTRAINT "products_locale_state_translations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_completeness_checks" ADD CONSTRAINT "products_completeness_checks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_family_id_product_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."product_families"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_locales" ADD CONSTRAINT "products_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_product_evidence_fk" FOREIGN KEY ("product_evidence_id") REFERENCES "public"."product_evidence"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_product_media_fk" FOREIGN KEY ("product_media_id") REFERENCES "public"."product_media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_product_documents_fk" FOREIGN KEY ("product_documents_id") REFERENCES "public"."product_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_narrative_faq" ADD CONSTRAINT "_products_v_version_narrative_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_specifications" ADD CONSTRAINT "_products_v_version_specifications_evidence_id_product_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."product_evidence"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v_version_specifications" ADD CONSTRAINT "_products_v_version_specifications_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_legacy_urls" ADD CONSTRAINT "_products_v_version_legacy_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_locale_state_translations" ADD CONSTRAINT "_products_v_version_locale_state_translations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_completeness_checks" ADD CONSTRAINT "_products_v_version_completeness_checks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_parent_id_products_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_version_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("version_manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_version_family_id_product_families_id_fk" FOREIGN KEY ("version_family_id") REFERENCES "public"."product_families"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v_locales" ADD CONSTRAINT "_products_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_product_evidence_fk" FOREIGN KEY ("product_evidence_id") REFERENCES "public"."product_evidence"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_product_media_fk" FOREIGN KEY ("product_media_id") REFERENCES "public"."product_media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_product_documents_fk" FOREIGN KEY ("product_documents_id") REFERENCES "public"."product_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pricing_observations" ADD CONSTRAINT "pricing_observations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "product_categories_slug_idx" ON "product_categories" USING btree ("slug");
  CREATE INDEX "product_categories_parent_idx" ON "product_categories" USING btree ("parent_id");
  CREATE INDEX "product_categories_updated_at_idx" ON "product_categories" USING btree ("updated_at");
  CREATE INDEX "product_categories_created_at_idx" ON "product_categories" USING btree ("created_at");
  CREATE INDEX "product_families_manufacturer_idx" ON "product_families" USING btree ("manufacturer_id");
  CREATE INDEX "product_families_category_idx" ON "product_families" USING btree ("category_id");
  CREATE INDEX "product_families_updated_at_idx" ON "product_families" USING btree ("updated_at");
  CREATE INDEX "product_families_created_at_idx" ON "product_families" USING btree ("created_at");
  CREATE UNIQUE INDEX "product_families_locales_locale_parent_id_unique" ON "product_families_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "product_families_rels_order_idx" ON "product_families_rels" USING btree ("order");
  CREATE INDEX "product_families_rels_parent_idx" ON "product_families_rels" USING btree ("parent_id");
  CREATE INDEX "product_families_rels_path_idx" ON "product_families_rels" USING btree ("path");
  CREATE INDEX "product_families_rels_products_id_idx" ON "product_families_rels" USING btree ("products_id");
  CREATE INDEX "product_media_original_asset_idx" ON "product_media" USING btree ("original_asset_id");
  CREATE INDEX "product_media_updated_at_idx" ON "product_media" USING btree ("updated_at");
  CREATE INDEX "product_media_created_at_idx" ON "product_media" USING btree ("created_at");
  CREATE UNIQUE INDEX "product_media_filename_idx" ON "product_media" USING btree ("filename");
  CREATE UNIQUE INDEX "product_media_locales_locale_parent_id_unique" ON "product_media_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "product_document_files_sha256_idx" ON "product_document_files" USING btree ("sha256");
  CREATE INDEX "product_document_files_updated_at_idx" ON "product_document_files" USING btree ("updated_at");
  CREATE INDEX "product_document_files_created_at_idx" ON "product_document_files" USING btree ("created_at");
  CREATE UNIQUE INDEX "product_document_files_filename_idx" ON "product_document_files" USING btree ("filename");
  CREATE INDEX "product_documents_manufacturer_idx" ON "product_documents" USING btree ("manufacturer_id");
  CREATE INDEX "product_documents_file_idx" ON "product_documents" USING btree ("file_id");
  CREATE INDEX "product_documents_sha256_idx" ON "product_documents" USING btree ("sha256");
  CREATE INDEX "product_documents_updated_at_idx" ON "product_documents" USING btree ("updated_at");
  CREATE INDEX "product_documents_created_at_idx" ON "product_documents" USING btree ("created_at");
  CREATE INDEX "product_evidence_product_idx" ON "product_evidence" USING btree ("product_id");
  CREATE INDEX "product_evidence_updated_at_idx" ON "product_evidence" USING btree ("updated_at");
  CREATE INDEX "product_evidence_created_at_idx" ON "product_evidence" USING btree ("created_at");
  CREATE INDEX "products_narrative_faq_order_idx" ON "products_narrative_faq" USING btree ("_order");
  CREATE INDEX "products_narrative_faq_parent_id_idx" ON "products_narrative_faq" USING btree ("_parent_id");
  CREATE INDEX "products_narrative_faq_locale_idx" ON "products_narrative_faq" USING btree ("_locale");
  CREATE INDEX "products_specifications_order_idx" ON "products_specifications" USING btree ("_order");
  CREATE INDEX "products_specifications_parent_id_idx" ON "products_specifications" USING btree ("_parent_id");
  CREATE INDEX "products_specifications_evidence_idx" ON "products_specifications" USING btree ("evidence_id");
  CREATE INDEX "products_legacy_urls_order_idx" ON "products_legacy_urls" USING btree ("_order");
  CREATE INDEX "products_legacy_urls_parent_id_idx" ON "products_legacy_urls" USING btree ("_parent_id");
  CREATE INDEX "products_locale_state_translations_order_idx" ON "products_locale_state_translations" USING btree ("_order");
  CREATE INDEX "products_locale_state_translations_parent_id_idx" ON "products_locale_state_translations" USING btree ("_parent_id");
  CREATE INDEX "products_completeness_checks_order_idx" ON "products_completeness_checks" USING btree ("_order");
  CREATE INDEX "products_completeness_checks_parent_id_idx" ON "products_completeness_checks" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "products_slug_idx" ON "products" USING btree ("slug");
  CREATE INDEX "products_manufacturer_idx" ON "products" USING btree ("manufacturer_id");
  CREATE INDEX "products_family_idx" ON "products" USING btree ("family_id");
  CREATE INDEX "products_updated_at_idx" ON "products" USING btree ("updated_at");
  CREATE INDEX "products_created_at_idx" ON "products" USING btree ("created_at");
  CREATE INDEX "products__status_idx" ON "products" USING btree ("_status");
  CREATE UNIQUE INDEX "products_locales_locale_parent_id_unique" ON "products_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "products_rels_order_idx" ON "products_rels" USING btree ("order");
  CREATE INDEX "products_rels_parent_idx" ON "products_rels" USING btree ("parent_id");
  CREATE INDEX "products_rels_path_idx" ON "products_rels" USING btree ("path");
  CREATE INDEX "products_rels_product_evidence_id_idx" ON "products_rels" USING btree ("product_evidence_id");
  CREATE INDEX "products_rels_products_id_idx" ON "products_rels" USING btree ("products_id");
  CREATE INDEX "products_rels_product_media_id_idx" ON "products_rels" USING btree ("product_media_id");
  CREATE INDEX "products_rels_product_documents_id_idx" ON "products_rels" USING btree ("product_documents_id");
  CREATE INDEX "products_rels_pages_id_idx" ON "products_rels" USING btree ("pages_id");
  CREATE INDEX "_products_v_version_narrative_faq_order_idx" ON "_products_v_version_narrative_faq" USING btree ("_order");
  CREATE INDEX "_products_v_version_narrative_faq_parent_id_idx" ON "_products_v_version_narrative_faq" USING btree ("_parent_id");
  CREATE INDEX "_products_v_version_narrative_faq_locale_idx" ON "_products_v_version_narrative_faq" USING btree ("_locale");
  CREATE INDEX "_products_v_version_specifications_order_idx" ON "_products_v_version_specifications" USING btree ("_order");
  CREATE INDEX "_products_v_version_specifications_parent_id_idx" ON "_products_v_version_specifications" USING btree ("_parent_id");
  CREATE INDEX "_products_v_version_specifications_evidence_idx" ON "_products_v_version_specifications" USING btree ("evidence_id");
  CREATE INDEX "_products_v_version_legacy_urls_order_idx" ON "_products_v_version_legacy_urls" USING btree ("_order");
  CREATE INDEX "_products_v_version_legacy_urls_parent_id_idx" ON "_products_v_version_legacy_urls" USING btree ("_parent_id");
  CREATE INDEX "_products_v_version_locale_state_translations_order_idx" ON "_products_v_version_locale_state_translations" USING btree ("_order");
  CREATE INDEX "_products_v_version_locale_state_translations_parent_id_idx" ON "_products_v_version_locale_state_translations" USING btree ("_parent_id");
  CREATE INDEX "_products_v_version_completeness_checks_order_idx" ON "_products_v_version_completeness_checks" USING btree ("_order");
  CREATE INDEX "_products_v_version_completeness_checks_parent_id_idx" ON "_products_v_version_completeness_checks" USING btree ("_parent_id");
  CREATE INDEX "_products_v_parent_idx" ON "_products_v" USING btree ("parent_id");
  CREATE INDEX "_products_v_version_version_slug_idx" ON "_products_v" USING btree ("version_slug");
  CREATE INDEX "_products_v_version_version_manufacturer_idx" ON "_products_v" USING btree ("version_manufacturer_id");
  CREATE INDEX "_products_v_version_version_family_idx" ON "_products_v" USING btree ("version_family_id");
  CREATE INDEX "_products_v_version_version_updated_at_idx" ON "_products_v" USING btree ("version_updated_at");
  CREATE INDEX "_products_v_version_version_created_at_idx" ON "_products_v" USING btree ("version_created_at");
  CREATE INDEX "_products_v_version_version__status_idx" ON "_products_v" USING btree ("version__status");
  CREATE INDEX "_products_v_created_at_idx" ON "_products_v" USING btree ("created_at");
  CREATE INDEX "_products_v_updated_at_idx" ON "_products_v" USING btree ("updated_at");
  CREATE INDEX "_products_v_snapshot_idx" ON "_products_v" USING btree ("snapshot");
  CREATE INDEX "_products_v_published_locale_idx" ON "_products_v" USING btree ("published_locale");
  CREATE INDEX "_products_v_latest_idx" ON "_products_v" USING btree ("latest");
  CREATE UNIQUE INDEX "_products_v_locales_locale_parent_id_unique" ON "_products_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_products_v_rels_order_idx" ON "_products_v_rels" USING btree ("order");
  CREATE INDEX "_products_v_rels_parent_idx" ON "_products_v_rels" USING btree ("parent_id");
  CREATE INDEX "_products_v_rels_path_idx" ON "_products_v_rels" USING btree ("path");
  CREATE INDEX "_products_v_rels_product_evidence_id_idx" ON "_products_v_rels" USING btree ("product_evidence_id");
  CREATE INDEX "_products_v_rels_products_id_idx" ON "_products_v_rels" USING btree ("products_id");
  CREATE INDEX "_products_v_rels_product_media_id_idx" ON "_products_v_rels" USING btree ("product_media_id");
  CREATE INDEX "_products_v_rels_product_documents_id_idx" ON "_products_v_rels" USING btree ("product_documents_id");
  CREATE INDEX "_products_v_rels_pages_id_idx" ON "_products_v_rels" USING btree ("pages_id");
  CREATE INDEX "pricing_observations_product_idx" ON "pricing_observations" USING btree ("product_id");
  CREATE INDEX "pricing_observations_updated_at_idx" ON "pricing_observations" USING btree ("updated_at");
  CREATE INDEX "pricing_observations_created_at_idx" ON "pricing_observations" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_product_categories_fk" FOREIGN KEY ("product_categories_id") REFERENCES "public"."product_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_product_families_fk" FOREIGN KEY ("product_families_id") REFERENCES "public"."product_families"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_product_media_fk" FOREIGN KEY ("product_media_id") REFERENCES "public"."product_media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_product_document_files_fk" FOREIGN KEY ("product_document_files_id") REFERENCES "public"."product_document_files"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_product_documents_fk" FOREIGN KEY ("product_documents_id") REFERENCES "public"."product_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_product_evidence_fk" FOREIGN KEY ("product_evidence_id") REFERENCES "public"."product_evidence"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pricing_observations_fk" FOREIGN KEY ("pricing_observations_id") REFERENCES "public"."pricing_observations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "_pages_v_snapshot_idx" ON "_pages_v" USING btree ("snapshot");
  CREATE INDEX "_pages_v_published_locale_idx" ON "_pages_v" USING btree ("published_locale");
  CREATE INDEX "_people_v_snapshot_idx" ON "_people_v" USING btree ("snapshot");
  CREATE INDEX "_people_v_published_locale_idx" ON "_people_v" USING btree ("published_locale");
  CREATE INDEX "payload_locked_documents_rels_product_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("product_categories_id");
  CREATE INDEX "payload_locked_documents_rels_product_families_id_idx" ON "payload_locked_documents_rels" USING btree ("product_families_id");
  CREATE INDEX "payload_locked_documents_rels_product_media_id_idx" ON "payload_locked_documents_rels" USING btree ("product_media_id");
  CREATE INDEX "payload_locked_documents_rels_product_document_files_id_idx" ON "payload_locked_documents_rels" USING btree ("product_document_files_id");
  CREATE INDEX "payload_locked_documents_rels_product_documents_id_idx" ON "payload_locked_documents_rels" USING btree ("product_documents_id");
  CREATE INDEX "payload_locked_documents_rels_product_evidence_id_idx" ON "payload_locked_documents_rels" USING btree ("product_evidence_id");
  CREATE INDEX "payload_locked_documents_rels_products_id_idx" ON "payload_locked_documents_rels" USING btree ("products_id");
  CREATE INDEX "payload_locked_documents_rels_pricing_observations_id_idx" ON "payload_locked_documents_rels" USING btree ("pricing_observations_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "product_categories" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "product_families" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "product_families_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "product_families_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "product_media" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "product_media_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "product_document_files" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "product_documents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "product_evidence" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_narrative_faq" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_specifications" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_legacy_urls" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_locale_state_translations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_completeness_checks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_products_v_version_narrative_faq" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_products_v_version_specifications" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_products_v_version_legacy_urls" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_products_v_version_locale_state_translations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_products_v_version_completeness_checks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_products_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_products_v_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_products_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pricing_observations" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "product_categories" CASCADE;
  DROP TABLE "product_families" CASCADE;
  DROP TABLE "product_families_locales" CASCADE;
  DROP TABLE "product_families_rels" CASCADE;
  DROP TABLE "product_media" CASCADE;
  DROP TABLE "product_media_locales" CASCADE;
  DROP TABLE "product_document_files" CASCADE;
  DROP TABLE "product_documents" CASCADE;
  DROP TABLE "product_evidence" CASCADE;
  DROP TABLE "products_narrative_faq" CASCADE;
  DROP TABLE "products_specifications" CASCADE;
  DROP TABLE "products_legacy_urls" CASCADE;
  DROP TABLE "products_locale_state_translations" CASCADE;
  DROP TABLE "products_completeness_checks" CASCADE;
  DROP TABLE "products" CASCADE;
  DROP TABLE "products_locales" CASCADE;
  DROP TABLE "products_rels" CASCADE;
  DROP TABLE "_products_v_version_narrative_faq" CASCADE;
  DROP TABLE "_products_v_version_specifications" CASCADE;
  DROP TABLE "_products_v_version_legacy_urls" CASCADE;
  DROP TABLE "_products_v_version_locale_state_translations" CASCADE;
  DROP TABLE "_products_v_version_completeness_checks" CASCADE;
  DROP TABLE "_products_v" CASCADE;
  DROP TABLE "_products_v_locales" CASCADE;
  DROP TABLE "_products_v_rels" CASCADE;
  DROP TABLE "pricing_observations" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_product_categories_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_product_families_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_product_media_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_product_document_files_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_product_documents_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_product_evidence_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_products_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_pricing_observations_fk";
  
  DROP INDEX "_pages_v_snapshot_idx";
  DROP INDEX "_pages_v_published_locale_idx";
  DROP INDEX "_people_v_snapshot_idx";
  DROP INDEX "_people_v_published_locale_idx";
  DROP INDEX "payload_locked_documents_rels_product_categories_id_idx";
  DROP INDEX "payload_locked_documents_rels_product_families_id_idx";
  DROP INDEX "payload_locked_documents_rels_product_media_id_idx";
  DROP INDEX "payload_locked_documents_rels_product_document_files_id_idx";
  DROP INDEX "payload_locked_documents_rels_product_documents_id_idx";
  DROP INDEX "payload_locked_documents_rels_product_evidence_id_idx";
  DROP INDEX "payload_locked_documents_rels_products_id_idx";
  DROP INDEX "payload_locked_documents_rels_pricing_observations_id_idx";
  ALTER TABLE "_pages_v" DROP COLUMN "snapshot";
  ALTER TABLE "_pages_v" DROP COLUMN "published_locale";
  ALTER TABLE "_people_v" DROP COLUMN "snapshot";
  ALTER TABLE "_people_v" DROP COLUMN "published_locale";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "product_categories_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "product_families_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "product_media_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "product_document_files_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "product_documents_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "product_evidence_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "products_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "pricing_observations_id";
  DROP TYPE "public"."_locales";
  DROP TYPE "public"."enum__pages_v_published_locale";
  DROP TYPE "public"."enum__people_v_published_locale";
  DROP TYPE "public"."enum_product_categories_state";
  DROP TYPE "public"."enum_product_families_seo_robots";
  DROP TYPE "public"."enum_product_media_image_state";
  DROP TYPE "public"."enum_product_media_exact_product_match";
  DROP TYPE "public"."enum_product_media_rights_status";
  DROP TYPE "public"."enum_product_documents_document_type";
  DROP TYPE "public"."enum_product_documents_rights_status";
  DROP TYPE "public"."enum_product_evidence_evidence_state";
  DROP TYPE "public"."enum_product_evidence_exact_model_match";
  DROP TYPE "public"."enum_product_evidence_confidence";
  DROP TYPE "public"."enum_product_evidence_reviewer_status";
  DROP TYPE "public"."enum_products_legacy_urls_redirect_type";
  DROP TYPE "public"."enum_products_completeness_checks_check";
  DROP TYPE "public"."enum_products_completeness_checks_state";
  DROP TYPE "public"."enum_products_manufacturer_evidence_state";
  DROP TYPE "public"."enum_products_manufacturer_evidence_unknown_reason";
  DROP TYPE "public"."enum_products_identifiers_identifier_state";
  DROP TYPE "public"."enum_products_commerce_mode";
  DROP TYPE "public"."enum_products_seo_robots";
  DROP TYPE "public"."enum_products_truth_status";
  DROP TYPE "public"."enum_products_editorial_state";
  DROP TYPE "public"."enum_products_completeness_state";
  DROP TYPE "public"."enum_products_status";
  DROP TYPE "public"."enum__products_v_version_legacy_urls_redirect_type";
  DROP TYPE "public"."enum__products_v_version_completeness_checks_check";
  DROP TYPE "public"."enum__products_v_version_completeness_checks_state";
  DROP TYPE "public"."enum__products_v_version_manufacturer_evidence_state";
  DROP TYPE "public"."enum__products_v_version_manufacturer_evidence_unknown_reason";
  DROP TYPE "public"."enum__products_v_version_identifiers_identifier_state";
  DROP TYPE "public"."enum__products_v_version_commerce_mode";
  DROP TYPE "public"."enum__products_v_version_seo_robots";
  DROP TYPE "public"."enum__products_v_version_truth_status";
  DROP TYPE "public"."enum__products_v_version_editorial_state";
  DROP TYPE "public"."enum__products_v_version_completeness_state";
  DROP TYPE "public"."enum__products_v_version_status";
  DROP TYPE "public"."enum__products_v_published_locale";
  DROP TYPE "public"."enum_pricing_observations_observation_type";
  DROP TYPE "public"."enum_pricing_observations_match_confidence";`)
}
