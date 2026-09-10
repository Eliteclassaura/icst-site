import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_roles" AS ENUM('platform-admin', 'client-admin', 'editor', 'search-analyst', 'sales', 'viewer');
  CREATE TYPE "public"."enum_media_rights" AS ENUM('owned', 'licensed', 'creative-commons', 'ai-generated', 'unknown');
  CREATE TYPE "public"."enum_pages_blocks_rich_text_measure" AS ENUM('prose', 'wide', 'full');
  CREATE TYPE "public"."enum_pages_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum_pages_page_type" AS ENUM('standard', 'home', 'service', 'industry', 'location', 'about', 'article', 'category', 'pricing', 'comparison', 'faq', 'glossary', 'contact', 'legal', 'campaign', 'tool');
  CREATE TYPE "public"."enum_pages_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_blocks_rich_text_measure" AS ENUM('prose', 'wide', 'full');
  CREATE TYPE "public"."enum__pages_v_version_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum__pages_v_version_page_type" AS ENUM('standard', 'home', 'service', 'industry', 'location', 'about', 'article', 'category', 'pricing', 'comparison', 'faq', 'glossary', 'contact', 'legal', 'campaign', 'tool');
  CREATE TYPE "public"."enum__pages_v_version_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_posts_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum_posts_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_posts_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__posts_v_version_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum__posts_v_version_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum__posts_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_categories_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum_tags_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum_topics_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum_industries_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum_locations_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum_people_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum_people_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_people_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__people_v_version_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum__people_v_version_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum__people_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_services_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum_services_offer_billing" AS ENUM('fixed', 'monthly', 'quote');
  CREATE TYPE "public"."enum_services_offer_availability" AS ENUM('available', 'limited', 'waitlist');
  CREATE TYPE "public"."enum_services_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_services_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__services_v_version_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum__services_v_version_offer_billing" AS ENUM('fixed', 'monthly', 'quote');
  CREATE TYPE "public"."enum__services_v_version_offer_availability" AS ENUM('available', 'limited', 'waitlist');
  CREATE TYPE "public"."enum__services_v_version_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum__services_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_offices_hours_days" AS ENUM('Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su');
  CREATE TYPE "public"."enum_offices_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_offices_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__offices_v_version_hours_days" AS ENUM('Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su');
  CREATE TYPE "public"."enum__offices_v_version_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum__offices_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_case_studies_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum_case_studies_kind" AS ENUM('client-result', 'modelled');
  CREATE TYPE "public"."enum_case_studies_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_case_studies_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__case_studies_v_version_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum__case_studies_v_version_kind" AS ENUM('client-result', 'modelled');
  CREATE TYPE "public"."enum__case_studies_v_version_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum__case_studies_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_ventures_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum_ventures_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_ventures_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum__ventures_v_version_seo_schema_types" AS ENUM('WebPage', 'Article', 'BlogPosting', 'Service', 'FAQPage', 'HowTo', 'DefinedTermSet', 'Person', 'Organization', 'LocalBusiness', 'OfferCatalog', 'ProfilePage');
  CREATE TYPE "public"."enum__ventures_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__ventures_v_version_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_testimonials_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_testimonials_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__testimonials_v_version_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum__testimonials_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_faqs_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_faqs_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__faqs_v_version_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum__faqs_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_glossary_terms_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_glossary_terms_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__glossary_terms_v_version_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum__glossary_terms_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_citations_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_evidence_stats_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_evidence_stats_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__evidence_stats_v_version_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum__evidence_stats_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_ctas_primary_chat_mode" AS ENUM('brief', 'roadmap');
  CREATE TYPE "public"."enum_ctas_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__ctas_v_version_primary_chat_mode" AS ENUM('brief', 'roadmap');
  CREATE TYPE "public"."enum__ctas_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_simulator_prompts_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__simulator_prompts_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_scorecard_questions_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__scorecard_questions_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_scorecard_bands_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__scorecard_bands_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_revenue_model_programs_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_revenue_model_programs_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__revenue_model_programs_v_version_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum__revenue_model_programs_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_notices_placement" AS ENUM('announcement', 'hero-status', 'footer');
  CREATE TYPE "public"."enum_notices_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__notices_v_version_placement" AS ENUM('announcement', 'hero-status', 'footer');
  CREATE TYPE "public"."enum__notices_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_schema_entities_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_seo_templates_applies_to" AS ENUM('pages', 'posts', 'services', 'case-studies', 'glossary-terms');
  CREATE TYPE "public"."enum_redirects_status_code" AS ENUM('301', '308', '410');
  CREATE TYPE "public"."enum_redirects_source" AS ENUM('manual', 'slug-change', 'migration', 'legacy-hash');
  CREATE TYPE "public"."enum_forms_fields_type" AS ENUM('text', 'email', 'textarea', 'select', 'checkbox', 'url');
  CREATE TYPE "public"."enum_submissions_mode" AS ENUM('brief', 'newsletter', 'roadmap');
  CREATE TYPE "public"."enum_submissions_source" AS ENUM('form', 'chat', 'newsletter', 'scorecard', 'import');
  CREATE TYPE "public"."enum_submissions_status" AS ENUM('received', 'spam', 'duplicate', 'processed', 'failed');
  CREATE TYPE "public"."enum_subscribers_status" AS ENUM('pending', 'confirmed', 'unsubscribed', 'bounced', 'complained');
  CREATE TYPE "public"."enum_subscribers_source" AS ENUM('newsletter', 'chat', 'form', 'roadmap', 'scorecard', 'import');
  CREATE TYPE "public"."enum_subscribers_consent_method" AS ENUM('double-opt-in', 'single-opt-in', 'unsubscribed', 'imported');
  CREATE TYPE "public"."enum_contacts_provenance" AS ENUM('form', 'chat', 'newsletter', 'roadmap', 'import', 'manual');
  CREATE TYPE "public"."enum_leads_stage" AS ENUM('new', 'qualified', 'proposal', 'won', 'lost', 'nurture');
  CREATE TYPE "public"."enum_leads_source" AS ENUM('form', 'chat', 'roadmap', 'newsletter', 'referral', 'manual');
  CREATE TYPE "public"."enum_leads_ai_insight_review_action" AS ENUM('accepted', 'edited', 'rejected');
  CREATE TYPE "public"."enum_activities_type" AS ENUM('submission', 'email-sent', 'email-received', 'note', 'stage-change', 'task', 'score-change', 'ai-insight', 'import');
  CREATE TYPE "public"."enum_tasks_status" AS ENUM('open', 'done', 'cancelled');
  CREATE TYPE "public"."enum_lead_score_rules_factor" AS ENUM('service-fit', 'geography', 'budget', 'timeline', 'engagement', 'recency', 'negative');
  CREATE TYPE "public"."enum_lead_score_rules_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_outbox_kind" AS ENUM('notify-owner', 'confirmation', 'welcome', 'roadmap', 'roadmap-copy', 'test');
  CREATE TYPE "public"."enum_outbox_status" AS ENUM('queued', 'sent', 'failed', 'suppressed');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'sendMockEmail', 'schedulePublish');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'sendMockEmail', 'schedulePublish');
  CREATE TYPE "public"."enum_site_settings_stats_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_site_settings_hero_status_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_contact_legal_verification_status" AS ENUM('unverified', 'verified', 'needs-change');
  CREATE TYPE "public"."enum_integrations_ai_features" AS ENUM('lead-summary', 'follow-up-draft', 'lead-classification', 'content-brief', 'schema-suggestions', 'report-narrative');
  CREATE TYPE "public"."enum_integrations_analytics_provider" AS ENUM('none', 'umami', 'plausible', 'posthog');
  CREATE TYPE "public"."enum_integrations_email_provider" AS ENUM('mock', 'smtp', 'gmail-api', 'stalwart');
  CREATE TYPE "public"."enum_chat_config_brief_steps_type" AS ENUM('text', 'email', 'textarea', 'chips');
  CREATE TYPE "public"."enum_chat_config_roadmap_steps_type" AS ENUM('text', 'email', 'textarea', 'chips');
  CREATE TYPE "public"."enum_roadmap_config_ai_agents_kind" AS ENUM('retrieval', 'training');
  CREATE TYPE "public"."enum_roadmap_config_findings_severity" AS ENUM('critical', 'major', 'minor', 'ok');
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
  
  CREATE TABLE "private_files" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
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
  
  CREATE TABLE "pages_blocks_rich_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"body" jsonb,
  	"measure" "enum_pages_blocks_rich_text_measure" DEFAULT 'prose',
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
  	"seo_noindex_reason" varchar,
  	"seo_og_image_id" uuid,
  	"seo_primary_topic" varchar,
  	"seo_breadcrumb_title" varchar,
  	"seo_reviewed_at" timestamp(3) with time zone,
  	"seo_content_updated_at" timestamp(3) with time zone,
  	"verification_status" "enum_pages_verification_status" DEFAULT 'unverified',
  	"verification_verified_by_id" uuid,
  	"verification_verified_at" timestamp(3) with time zone,
  	"verification_note" varchar,
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
  	"version_seo_noindex_reason" varchar,
  	"version_seo_og_image_id" uuid,
  	"version_seo_primary_topic" varchar,
  	"version_seo_breadcrumb_title" varchar,
  	"version_seo_reviewed_at" timestamp(3) with time zone,
  	"version_seo_content_updated_at" timestamp(3) with time zone,
  	"version_verification_status" "enum__pages_v_version_verification_status" DEFAULT 'unverified',
  	"version_verification_verified_by_id" uuid,
  	"version_verification_verified_at" timestamp(3) with time zone,
  	"version_verification_note" varchar,
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
  
  CREATE TABLE "posts_update_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"date" timestamp(3) with time zone,
  	"note" varchar
  );
  
  CREATE TABLE "posts_seo_schema_types" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum_posts_seo_schema_types",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "posts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"excerpt" varchar,
  	"featured_image_id" uuid,
  	"body" jsonb,
  	"category_id" uuid,
  	"issue_number" numeric,
  	"published_at" timestamp(3) with time zone,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical" varchar,
  	"seo_noindex" boolean DEFAULT false,
  	"seo_nofollow" boolean DEFAULT false,
  	"seo_noindex_reason" varchar,
  	"seo_og_image_id" uuid,
  	"seo_primary_topic" varchar,
  	"seo_breadcrumb_title" varchar,
  	"seo_reviewed_at" timestamp(3) with time zone,
  	"seo_content_updated_at" timestamp(3) with time zone,
  	"verification_status" "enum_posts_verification_status" DEFAULT 'unverified',
  	"verification_verified_by_id" uuid,
  	"verification_verified_at" timestamp(3) with time zone,
  	"verification_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_posts_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "posts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" uuid,
  	"topics_id" uuid,
  	"posts_id" uuid,
  	"people_id" uuid,
  	"citations_id" uuid
  );
  
  CREATE TABLE "_posts_v_version_update_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"date" timestamp(3) with time zone,
  	"note" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_posts_v_version_seo_schema_types" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum__posts_v_version_seo_schema_types",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "_posts_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_excerpt" varchar,
  	"version_featured_image_id" uuid,
  	"version_body" jsonb,
  	"version_category_id" uuid,
  	"version_issue_number" numeric,
  	"version_published_at" timestamp(3) with time zone,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_canonical" varchar,
  	"version_seo_noindex" boolean DEFAULT false,
  	"version_seo_nofollow" boolean DEFAULT false,
  	"version_seo_noindex_reason" varchar,
  	"version_seo_og_image_id" uuid,
  	"version_seo_primary_topic" varchar,
  	"version_seo_breadcrumb_title" varchar,
  	"version_seo_reviewed_at" timestamp(3) with time zone,
  	"version_seo_content_updated_at" timestamp(3) with time zone,
  	"version_verification_status" "enum__posts_v_version_verification_status" DEFAULT 'unverified',
  	"version_verification_verified_by_id" uuid,
  	"version_verification_verified_at" timestamp(3) with time zone,
  	"version_verification_note" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__posts_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "_posts_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" uuid,
  	"topics_id" uuid,
  	"posts_id" uuid,
  	"people_id" uuid,
  	"citations_id" uuid
  );
  
  CREATE TABLE "categories_seo_schema_types" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum_categories_seo_schema_types",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "categories" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical" varchar,
  	"seo_noindex" boolean DEFAULT false,
  	"seo_nofollow" boolean DEFAULT false,
  	"seo_noindex_reason" varchar,
  	"seo_og_image_id" uuid,
  	"seo_primary_topic" varchar,
  	"seo_breadcrumb_title" varchar,
  	"seo_reviewed_at" timestamp(3) with time zone,
  	"seo_content_updated_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "categories_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"citations_id" uuid
  );
  
  CREATE TABLE "tags_seo_schema_types" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum_tags_seo_schema_types",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "tags" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical" varchar,
  	"seo_noindex" boolean DEFAULT false,
  	"seo_nofollow" boolean DEFAULT false,
  	"seo_noindex_reason" varchar,
  	"seo_og_image_id" uuid,
  	"seo_primary_topic" varchar,
  	"seo_breadcrumb_title" varchar,
  	"seo_reviewed_at" timestamp(3) with time zone,
  	"seo_content_updated_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tags_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"citations_id" uuid
  );
  
  CREATE TABLE "topics_seo_schema_types" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum_topics_seo_schema_types",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "topics" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical" varchar,
  	"seo_noindex" boolean DEFAULT false,
  	"seo_nofollow" boolean DEFAULT false,
  	"seo_noindex_reason" varchar,
  	"seo_og_image_id" uuid,
  	"seo_primary_topic" varchar,
  	"seo_breadcrumb_title" varchar,
  	"seo_reviewed_at" timestamp(3) with time zone,
  	"seo_content_updated_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "topics_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"citations_id" uuid
  );
  
  CREATE TABLE "industries_seo_schema_types" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum_industries_seo_schema_types",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "industries" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical" varchar,
  	"seo_noindex" boolean DEFAULT false,
  	"seo_nofollow" boolean DEFAULT false,
  	"seo_noindex_reason" varchar,
  	"seo_og_image_id" uuid,
  	"seo_primary_topic" varchar,
  	"seo_breadcrumb_title" varchar,
  	"seo_reviewed_at" timestamp(3) with time zone,
  	"seo_content_updated_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "industries_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
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
  	"seo_noindex_reason" varchar,
  	"seo_og_image_id" uuid,
  	"seo_primary_topic" varchar,
  	"seo_breadcrumb_title" varchar,
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
  	"seo_noindex_reason" varchar,
  	"seo_og_image_id" uuid,
  	"seo_primary_topic" varchar,
  	"seo_breadcrumb_title" varchar,
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
  	"version_seo_noindex_reason" varchar,
  	"version_seo_og_image_id" uuid,
  	"version_seo_primary_topic" varchar,
  	"version_seo_breadcrumb_title" varchar,
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
  
  CREATE TABLE "services_offer_includes" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"item" varchar
  );
  
  CREATE TABLE "services_seo_schema_types" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum_services_seo_schema_types",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "services" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"summary" varchar,
  	"body" jsonb,
  	"offer_price" numeric,
  	"offer_currency" varchar DEFAULT 'USD',
  	"offer_billing" "enum_services_offer_billing",
  	"offer_availability" "enum_services_offer_availability",
  	"order" numeric,
  	"schema_id" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical" varchar,
  	"seo_noindex" boolean DEFAULT false,
  	"seo_nofollow" boolean DEFAULT false,
  	"seo_noindex_reason" varchar,
  	"seo_og_image_id" uuid,
  	"seo_primary_topic" varchar,
  	"seo_breadcrumb_title" varchar,
  	"seo_reviewed_at" timestamp(3) with time zone,
  	"seo_content_updated_at" timestamp(3) with time zone,
  	"verification_status" "enum_services_verification_status" DEFAULT 'unverified',
  	"verification_verified_by_id" uuid,
  	"verification_verified_at" timestamp(3) with time zone,
  	"verification_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_services_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "services_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"citations_id" uuid
  );
  
  CREATE TABLE "_services_v_version_offer_includes" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"item" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_services_v_version_seo_schema_types" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum__services_v_version_seo_schema_types",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "_services_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_summary" varchar,
  	"version_body" jsonb,
  	"version_offer_price" numeric,
  	"version_offer_currency" varchar DEFAULT 'USD',
  	"version_offer_billing" "enum__services_v_version_offer_billing",
  	"version_offer_availability" "enum__services_v_version_offer_availability",
  	"version_order" numeric,
  	"version_schema_id" varchar,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_canonical" varchar,
  	"version_seo_noindex" boolean DEFAULT false,
  	"version_seo_nofollow" boolean DEFAULT false,
  	"version_seo_noindex_reason" varchar,
  	"version_seo_og_image_id" uuid,
  	"version_seo_primary_topic" varchar,
  	"version_seo_breadcrumb_title" varchar,
  	"version_seo_reviewed_at" timestamp(3) with time zone,
  	"version_seo_content_updated_at" timestamp(3) with time zone,
  	"version_verification_status" "enum__services_v_version_verification_status" DEFAULT 'unverified',
  	"version_verification_verified_by_id" uuid,
  	"version_verification_verified_at" timestamp(3) with time zone,
  	"version_verification_note" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__services_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_services_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"citations_id" uuid
  );
  
  CREATE TABLE "offices_hours_days" (
  	"order" integer NOT NULL,
  	"parent_id" varchar NOT NULL,
  	"value" "enum_offices_hours_days",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "offices_hours" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"opens" varchar,
  	"closes" varchar
  );
  
  CREATE TABLE "offices" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar,
  	"slug" varchar,
  	"description" varchar,
  	"address_street" varchar,
  	"address_locality" varchar,
  	"address_region" varchar,
  	"address_postal_code" varchar,
  	"address_country" varchar,
  	"geo_latitude" numeric,
  	"geo_longitude" numeric,
  	"telephone" varchar,
  	"area_served" varchar,
  	"schema_id" varchar,
  	"verification_status" "enum_offices_verification_status" DEFAULT 'unverified',
  	"verification_verified_by_id" uuid,
  	"verification_verified_at" timestamp(3) with time zone,
  	"verification_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_offices_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_offices_v_version_hours_days" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum__offices_v_version_hours_days",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "_offices_v_version_hours" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"opens" varchar,
  	"closes" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_offices_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_name" varchar,
  	"version_slug" varchar,
  	"version_description" varchar,
  	"version_address_street" varchar,
  	"version_address_locality" varchar,
  	"version_address_region" varchar,
  	"version_address_postal_code" varchar,
  	"version_address_country" varchar,
  	"version_geo_latitude" numeric,
  	"version_geo_longitude" numeric,
  	"version_telephone" varchar,
  	"version_area_served" varchar,
  	"version_schema_id" varchar,
  	"version_verification_status" "enum__offices_v_version_verification_status" DEFAULT 'unverified',
  	"version_verification_verified_by_id" uuid,
  	"version_verification_verified_at" timestamp(3) with time zone,
  	"version_verification_note" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__offices_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "case_studies_diagnostics" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"value" varchar,
  	"note" varchar
  );
  
  CREATE TABLE "case_studies_plays" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"body" varchar
  );
  
  CREATE TABLE "case_studies_phases" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"month" varchar,
  	"heading" varchar,
  	"body" varchar
  );
  
  CREATE TABLE "case_studies_results" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"from" varchar,
  	"to" varchar
  );
  
  CREATE TABLE "case_studies_kpis" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"value" varchar
  );
  
  CREATE TABLE "case_studies_stack" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"item" varchar
  );
  
  CREATE TABLE "case_studies_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"url" varchar,
  	"detail" varchar
  );
  
  CREATE TABLE "case_studies_seo_schema_types" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum_case_studies_seo_schema_types",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "case_studies" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"kind" "enum_case_studies_kind" DEFAULT 'modelled',
  	"consent_recorded" boolean,
  	"track" varchar,
  	"client" varchar,
  	"scale" varchar,
  	"span" varchar,
  	"blurb" varchar,
  	"problem" jsonb,
  	"benchmark" varchar,
  	"chart_caption" varchar,
  	"chart_unit" varchar,
  	"chart_labels" jsonb,
  	"chart_series" jsonb,
  	"ai_in_the_loop" jsonb,
  	"lever" varchar,
  	"featured" boolean DEFAULT false,
  	"order" numeric,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical" varchar,
  	"seo_noindex" boolean DEFAULT false,
  	"seo_nofollow" boolean DEFAULT false,
  	"seo_noindex_reason" varchar,
  	"seo_og_image_id" uuid,
  	"seo_primary_topic" varchar,
  	"seo_breadcrumb_title" varchar,
  	"seo_reviewed_at" timestamp(3) with time zone,
  	"seo_content_updated_at" timestamp(3) with time zone,
  	"verification_status" "enum_case_studies_verification_status" DEFAULT 'unverified',
  	"verification_verified_by_id" uuid,
  	"verification_verified_at" timestamp(3) with time zone,
  	"verification_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_case_studies_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "case_studies_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"citations_id" uuid
  );
  
  CREATE TABLE "_case_studies_v_version_diagnostics" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"value" varchar,
  	"note" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_case_studies_v_version_plays" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"heading" varchar,
  	"body" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_case_studies_v_version_phases" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"month" varchar,
  	"heading" varchar,
  	"body" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_case_studies_v_version_results" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"from" varchar,
  	"to" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_case_studies_v_version_kpis" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"value" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_case_studies_v_version_stack" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"item" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_case_studies_v_version_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar,
  	"url" varchar,
  	"detail" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_case_studies_v_version_seo_schema_types" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum__case_studies_v_version_seo_schema_types",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "_case_studies_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_kind" "enum__case_studies_v_version_kind" DEFAULT 'modelled',
  	"version_consent_recorded" boolean,
  	"version_track" varchar,
  	"version_client" varchar,
  	"version_scale" varchar,
  	"version_span" varchar,
  	"version_blurb" varchar,
  	"version_problem" jsonb,
  	"version_benchmark" varchar,
  	"version_chart_caption" varchar,
  	"version_chart_unit" varchar,
  	"version_chart_labels" jsonb,
  	"version_chart_series" jsonb,
  	"version_ai_in_the_loop" jsonb,
  	"version_lever" varchar,
  	"version_featured" boolean DEFAULT false,
  	"version_order" numeric,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_canonical" varchar,
  	"version_seo_noindex" boolean DEFAULT false,
  	"version_seo_nofollow" boolean DEFAULT false,
  	"version_seo_noindex_reason" varchar,
  	"version_seo_og_image_id" uuid,
  	"version_seo_primary_topic" varchar,
  	"version_seo_breadcrumb_title" varchar,
  	"version_seo_reviewed_at" timestamp(3) with time zone,
  	"version_seo_content_updated_at" timestamp(3) with time zone,
  	"version_verification_status" "enum__case_studies_v_version_verification_status" DEFAULT 'unverified',
  	"version_verification_verified_by_id" uuid,
  	"version_verification_verified_at" timestamp(3) with time zone,
  	"version_verification_note" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__case_studies_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_case_studies_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"citations_id" uuid
  );
  
  CREATE TABLE "ventures_details" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"value" varchar
  );
  
  CREATE TABLE "ventures_stack" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"item" varchar
  );
  
  CREATE TABLE "ventures_seo_schema_types" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum_ventures_seo_schema_types",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "ventures" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"status" "enum_ventures_status",
  	"progress" numeric,
  	"metric" varchar,
  	"one" varchar,
  	"body" jsonb,
  	"next" varchar,
  	"team" varchar,
  	"order" numeric,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_canonical" varchar,
  	"seo_noindex" boolean DEFAULT false,
  	"seo_nofollow" boolean DEFAULT false,
  	"seo_noindex_reason" varchar,
  	"seo_og_image_id" uuid,
  	"seo_primary_topic" varchar,
  	"seo_breadcrumb_title" varchar,
  	"seo_reviewed_at" timestamp(3) with time zone,
  	"seo_content_updated_at" timestamp(3) with time zone,
  	"verification_status" "enum_ventures_verification_status" DEFAULT 'unverified',
  	"verification_verified_by_id" uuid,
  	"verification_verified_at" timestamp(3) with time zone,
  	"verification_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_ventures_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "ventures_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"citations_id" uuid
  );
  
  CREATE TABLE "_ventures_v_version_details" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"value" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_ventures_v_version_stack" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"item" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_ventures_v_version_seo_schema_types" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum__ventures_v_version_seo_schema_types",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "_ventures_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_status" "enum__ventures_v_version_status",
  	"version_progress" numeric,
  	"version_metric" varchar,
  	"version_one" varchar,
  	"version_body" jsonb,
  	"version_next" varchar,
  	"version_team" varchar,
  	"version_order" numeric,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_canonical" varchar,
  	"version_seo_noindex" boolean DEFAULT false,
  	"version_seo_nofollow" boolean DEFAULT false,
  	"version_seo_noindex_reason" varchar,
  	"version_seo_og_image_id" uuid,
  	"version_seo_primary_topic" varchar,
  	"version_seo_breadcrumb_title" varchar,
  	"version_seo_reviewed_at" timestamp(3) with time zone,
  	"version_seo_content_updated_at" timestamp(3) with time zone,
  	"version_verification_status" "enum__ventures_v_version_verification_status" DEFAULT 'unverified',
  	"version_verification_verified_by_id" uuid,
  	"version_verification_verified_at" timestamp(3) with time zone,
  	"version_verification_note" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__ventures_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_ventures_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"citations_id" uuid
  );
  
  CREATE TABLE "testimonials" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"quote" varchar,
  	"attribution" varchar,
  	"role" varchar,
  	"company" varchar,
  	"consent_recorded" boolean DEFAULT false,
  	"source" varchar,
  	"source_url" varchar,
  	"source_date" timestamp(3) with time zone,
  	"verification_status" "enum_testimonials_verification_status" DEFAULT 'unverified',
  	"verification_verified_by_id" uuid,
  	"verification_verified_at" timestamp(3) with time zone,
  	"verification_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_testimonials_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_testimonials_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_quote" varchar,
  	"version_attribution" varchar,
  	"version_role" varchar,
  	"version_company" varchar,
  	"version_consent_recorded" boolean DEFAULT false,
  	"version_source" varchar,
  	"version_source_url" varchar,
  	"version_source_date" timestamp(3) with time zone,
  	"version_verification_status" "enum__testimonials_v_version_verification_status" DEFAULT 'unverified',
  	"version_verification_verified_by_id" uuid,
  	"version_verification_verified_at" timestamp(3) with time zone,
  	"version_verification_note" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__testimonials_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "faqs" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"question" varchar,
  	"answer" jsonb,
  	"order" numeric,
  	"verification_status" "enum_faqs_verification_status" DEFAULT 'unverified',
  	"verification_verified_by_id" uuid,
  	"verification_verified_at" timestamp(3) with time zone,
  	"verification_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_faqs_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "faqs_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"pages_id" uuid
  );
  
  CREATE TABLE "_faqs_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_question" varchar,
  	"version_answer" jsonb,
  	"version_order" numeric,
  	"version_verification_status" "enum__faqs_v_version_verification_status" DEFAULT 'unverified',
  	"version_verification_verified_by_id" uuid,
  	"version_verification_verified_at" timestamp(3) with time zone,
  	"version_verification_note" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__faqs_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_faqs_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"pages_id" uuid
  );
  
  CREATE TABLE "glossary_terms" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"term" varchar,
  	"slug" varchar,
  	"anchor" varchar,
  	"definition" jsonb,
  	"why_it_matters" varchar,
  	"how_measured" varchar,
  	"order" numeric,
  	"verification_status" "enum_glossary_terms_verification_status" DEFAULT 'unverified',
  	"verification_verified_by_id" uuid,
  	"verification_verified_at" timestamp(3) with time zone,
  	"verification_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_glossary_terms_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_glossary_terms_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_term" varchar,
  	"version_slug" varchar,
  	"version_anchor" varchar,
  	"version_definition" jsonb,
  	"version_why_it_matters" varchar,
  	"version_how_measured" varchar,
  	"version_order" numeric,
  	"version_verification_status" "enum__glossary_terms_v_version_verification_status" DEFAULT 'unverified',
  	"version_verification_verified_by_id" uuid,
  	"version_verification_verified_at" timestamp(3) with time zone,
  	"version_verification_note" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__glossary_terms_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
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
  
  CREATE TABLE "evidence_stats" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"value" numeric,
  	"format_prefix" varchar,
  	"format_suffix" varchar,
  	"format_decimals" numeric DEFAULT 0,
  	"format_comma" boolean DEFAULT false,
  	"note" varchar,
  	"citation_id" uuid,
  	"order" numeric,
  	"verification_status" "enum_evidence_stats_verification_status" DEFAULT 'unverified',
  	"verification_verified_by_id" uuid,
  	"verification_verified_at" timestamp(3) with time zone,
  	"verification_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_evidence_stats_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_evidence_stats_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_label" varchar,
  	"version_value" numeric,
  	"version_format_prefix" varchar,
  	"version_format_suffix" varchar,
  	"version_format_decimals" numeric DEFAULT 0,
  	"version_format_comma" boolean DEFAULT false,
  	"version_note" varchar,
  	"version_citation_id" uuid,
  	"version_order" numeric,
  	"version_verification_status" "enum__evidence_stats_v_version_verification_status" DEFAULT 'unverified',
  	"version_verification_verified_by_id" uuid,
  	"version_verification_verified_at" timestamp(3) with time zone,
  	"version_verification_note" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__evidence_stats_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "ctas" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar,
  	"body" varchar,
  	"primary_label" varchar,
  	"primary_href" varchar,
  	"primary_chat_mode" "enum_ctas_primary_chat_mode",
  	"secondary_label" varchar,
  	"secondary_href" varchar,
  	"image_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_ctas_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_ctas_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_title" varchar,
  	"version_body" varchar,
  	"version_primary_label" varchar,
  	"version_primary_href" varchar,
  	"version_primary_chat_mode" "enum__ctas_v_version_primary_chat_mode",
  	"version_secondary_label" varchar,
  	"version_secondary_href" varchar,
  	"version_image_id" uuid,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__ctas_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "simulator_prompts_before_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"n" numeric,
  	"host" varchar,
  	"is_client" boolean
  );
  
  CREATE TABLE "simulator_prompts_after_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"n" numeric,
  	"host" varchar,
  	"is_client" boolean
  );
  
  CREATE TABLE "simulator_prompts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"category" varchar,
  	"question" varchar,
  	"before_body" varchar,
  	"before_note" varchar,
  	"after_body" varchar,
  	"after_note" varchar,
  	"order" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_simulator_prompts_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_simulator_prompts_v_version_before_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"n" numeric,
  	"host" varchar,
  	"is_client" boolean,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_simulator_prompts_v_version_after_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"n" numeric,
  	"host" varchar,
  	"is_client" boolean,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_simulator_prompts_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_category" varchar,
  	"version_question" varchar,
  	"version_before_body" varchar,
  	"version_before_note" varchar,
  	"version_after_body" varchar,
  	"version_after_note" varchar,
  	"version_order" numeric,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__simulator_prompts_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "scorecard_questions_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"score" numeric
  );
  
  CREATE TABLE "scorecard_questions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar,
  	"weight" numeric,
  	"fix" varchar,
  	"order" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_scorecard_questions_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_scorecard_questions_v_version_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"score" numeric,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_scorecard_questions_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_title" varchar,
  	"version_weight" numeric,
  	"version_fix" varchar,
  	"version_order" numeric,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__scorecard_questions_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "scorecard_bands" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar,
  	"min" numeric,
  	"max" numeric,
  	"copy" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_scorecard_bands_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_scorecard_bands_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_name" varchar,
  	"version_min" numeric,
  	"version_max" numeric,
  	"version_copy" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__scorecard_bands_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "revenue_model_programs" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"key" varchar,
  	"name" varchar,
  	"sessions_multiplier" numeric,
  	"conversion_multiplier" numeric,
  	"default_fee" numeric,
  	"note" varchar,
  	"verification_status" "enum_revenue_model_programs_verification_status" DEFAULT 'unverified',
  	"verification_verified_by_id" uuid,
  	"verification_verified_at" timestamp(3) with time zone,
  	"verification_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_revenue_model_programs_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_revenue_model_programs_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_key" varchar,
  	"version_name" varchar,
  	"version_sessions_multiplier" numeric,
  	"version_conversion_multiplier" numeric,
  	"version_default_fee" numeric,
  	"version_note" varchar,
  	"version_verification_status" "enum__revenue_model_programs_v_version_verification_status" DEFAULT 'unverified',
  	"version_verification_verified_by_id" uuid,
  	"version_verification_verified_at" timestamp(3) with time zone,
  	"version_verification_note" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__revenue_model_programs_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "notices" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar,
  	"body" varchar,
  	"href" varchar,
  	"from" timestamp(3) with time zone,
  	"until" timestamp(3) with time zone,
  	"placement" "enum_notices_placement" DEFAULT 'announcement',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_notices_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_notices_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_title" varchar,
  	"version_body" varchar,
  	"version_href" varchar,
  	"version_from" timestamp(3) with time zone,
  	"version_until" timestamp(3) with time zone,
  	"version_placement" "enum__notices_v_version_placement" DEFAULT 'announcement',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__notices_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "schema_entities" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"schema_id" varchar NOT NULL,
  	"type" varchar NOT NULL,
  	"data" jsonb NOT NULL,
  	"verification_status" "enum_schema_entities_verification_status" DEFAULT 'unverified' NOT NULL,
  	"verification_verified_by_id" uuid,
  	"verification_verified_at" timestamp(3) with time zone,
  	"verification_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "seo_templates_applies_to" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum_seo_templates_applies_to",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "seo_templates" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"title_template" varchar NOT NULL,
  	"description_template" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "redirects" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"from" varchar NOT NULL,
  	"to" varchar NOT NULL,
  	"status_code" "enum_redirects_status_code" DEFAULT '308' NOT NULL,
  	"reason" varchar,
  	"source" "enum_redirects_source" DEFAULT 'manual',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "forms_fields_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"value" varchar NOT NULL
  );
  
  CREATE TABLE "forms_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"label" varchar NOT NULL,
  	"type" "enum_forms_fields_type" NOT NULL,
  	"required" boolean DEFAULT false,
  	"max_length" numeric,
  	"placeholder" varchar,
  	"default_value" varchar
  );
  
  CREATE TABLE "forms" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"key" varchar NOT NULL,
  	"submit_label" varchar DEFAULT 'Send',
  	"success_message" varchar,
  	"roadmap_opt_in_enabled" boolean DEFAULT true,
  	"roadmap_opt_in_default_checked" boolean DEFAULT false,
  	"roadmap_opt_in_label" varchar,
  	"turnstile" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "submissions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"form_id" uuid NOT NULL,
  	"mode" "enum_submissions_mode" NOT NULL,
  	"source" "enum_submissions_source" NOT NULL,
  	"status" "enum_submissions_status" DEFAULT 'received' NOT NULL,
  	"email" varchar NOT NULL,
  	"name" varchar,
  	"company" varchar,
  	"site" varchar,
  	"fields" jsonb,
  	"context_page" varchar,
  	"context_journey" varchar,
  	"context_dwell_seconds" numeric,
  	"context_score" varchar,
  	"context_referrer" varchar,
  	"context_utm" jsonb,
  	"context_screen" varchar,
  	"context_language" varchar,
  	"context_timezone" varchar,
  	"context_user_agent" varchar,
  	"context_ip_hash" varchar,
  	"spam_score" numeric,
  	"spam_reasons" jsonb,
  	"fingerprint" varchar,
  	"contact_id" uuid,
  	"lead_id" uuid,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "subscribers_tags" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tag" varchar NOT NULL
  );
  
  CREATE TABLE "subscribers_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"status" varchar NOT NULL,
  	"at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "subscribers" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"external_id" varchar,
  	"email" varchar NOT NULL,
  	"dedupe_key" varchar,
  	"name" varchar,
  	"status" "enum_subscribers_status" DEFAULT 'pending' NOT NULL,
  	"signup_at" timestamp(3) with time zone NOT NULL,
  	"confirmed_at" timestamp(3) with time zone,
  	"unsubscribed_at" timestamp(3) with time zone,
  	"source" "enum_subscribers_source" DEFAULT 'newsletter',
  	"source_page" varchar,
  	"consent_method" "enum_subscribers_consent_method",
  	"consent_requested_at" timestamp(3) with time zone,
  	"consent_confirmed_at" timestamp(3) with time zone,
  	"consent_ip_hash" varchar,
  	"consent_user_agent" varchar,
  	"consent_evidence" varchar,
  	"meta" jsonb,
  	"schema_version" numeric DEFAULT 2,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "companies" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"domain" varchar,
  	"industry_id" uuid,
  	"location_id" uuid,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "contacts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"email" varchar NOT NULL,
  	"email_normalized" varchar,
  	"name" varchar,
  	"phone" varchar,
  	"company_id" uuid,
  	"provenance" "enum_contacts_provenance" DEFAULT 'form' NOT NULL,
  	"preferences_marketing" boolean DEFAULT false,
  	"preferences_transactional" boolean DEFAULT true,
  	"suppressed" boolean DEFAULT false,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "leads" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"contact_id" uuid NOT NULL,
  	"company_id" uuid,
  	"stage" "enum_leads_stage" DEFAULT 'new' NOT NULL,
  	"source" "enum_leads_source" NOT NULL,
  	"attribution_landing_page" varchar,
  	"attribution_referrer" varchar,
  	"attribution_utm" jsonb,
  	"attribution_campaign" varchar,
  	"submitted_fields" jsonb,
  	"score" numeric,
  	"score_breakdown" jsonb,
  	"owner_id" uuid,
  	"next_follow_up_at" timestamp(3) with time zone,
  	"ai_insight_summary" varchar,
  	"ai_insight_next_action" varchar,
  	"ai_insight_provider" varchar,
  	"ai_insight_model" varchar,
  	"ai_insight_prompt_version" varchar,
  	"ai_insight_generated_at" timestamp(3) with time zone,
  	"ai_insight_confidence" numeric,
  	"ai_insight_reviewed_by_id" uuid,
  	"ai_insight_review_action" "enum_leads_ai_insight_review_action",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "activities" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"type" "enum_activities_type" NOT NULL,
  	"contact_id" uuid,
  	"lead_id" uuid,
  	"submission_id" uuid,
  	"summary" varchar NOT NULL,
  	"data" jsonb,
  	"actor_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tasks" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"lead_id" uuid,
  	"assignee_id" uuid,
  	"due_at" timestamp(3) with time zone,
  	"status" "enum_tasks_status" DEFAULT 'open',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "lead_score_rules" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"factor" "enum_lead_score_rules_factor" NOT NULL,
  	"field" varchar NOT NULL,
  	"match" varchar NOT NULL,
  	"points" numeric NOT NULL,
  	"active" boolean DEFAULT true,
  	"verification_status" "enum_lead_score_rules_verification_status" DEFAULT 'unverified' NOT NULL,
  	"verification_verified_by_id" uuid,
  	"verification_verified_at" timestamp(3) with time zone,
  	"verification_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "outbox" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"to" varchar NOT NULL,
  	"subject" varchar NOT NULL,
  	"kind" "enum_outbox_kind" NOT NULL,
  	"status" "enum_outbox_status" DEFAULT 'queued' NOT NULL,
  	"provider" varchar,
  	"provider_message_id" varchar,
  	"idempotency_key" varchar,
  	"headers" jsonb,
  	"error" varchar,
  	"sent_at" timestamp(3) with time zone,
  	"lead_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
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
  	"private_files_id" uuid,
  	"pages_id" uuid,
  	"posts_id" uuid,
  	"categories_id" uuid,
  	"tags_id" uuid,
  	"topics_id" uuid,
  	"industries_id" uuid,
  	"locations_id" uuid,
  	"people_id" uuid,
  	"services_id" uuid,
  	"offices_id" uuid,
  	"case_studies_id" uuid,
  	"ventures_id" uuid,
  	"testimonials_id" uuid,
  	"faqs_id" uuid,
  	"glossary_terms_id" uuid,
  	"citations_id" uuid,
  	"evidence_stats_id" uuid,
  	"ctas_id" uuid,
  	"simulator_prompts_id" uuid,
  	"scorecard_questions_id" uuid,
  	"scorecard_bands_id" uuid,
  	"revenue_model_programs_id" uuid,
  	"notices_id" uuid,
  	"schema_entities_id" uuid,
  	"seo_templates_id" uuid,
  	"redirects_id" uuid,
  	"forms_id" uuid,
  	"submissions_id" uuid,
  	"subscribers_id" uuid,
  	"companies_id" uuid,
  	"contacts_id" uuid,
  	"leads_id" uuid,
  	"activities_id" uuid,
  	"tasks_id" uuid,
  	"lead_score_rules_id" uuid,
  	"outbox_id" uuid,
  	"audit_log_id" uuid
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
  
  CREATE TABLE "site_settings_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"value" numeric NOT NULL,
  	"prefix" varchar,
  	"suffix" varchar,
  	"decimals" numeric DEFAULT 0,
  	"comma" boolean,
  	"verification_status" "enum_site_settings_stats_verification_status" DEFAULT 'unverified' NOT NULL,
  	"verification_verified_by_id" uuid,
  	"verification_verified_at" timestamp(3) with time zone,
  	"verification_note" varchar
  );
  
  CREATE TABLE "site_settings" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_name" varchar NOT NULL,
  	"site_url" varchar NOT NULL,
  	"tagline" varchar,
  	"default_locale" varchar DEFAULT 'en',
  	"timezone" varchar DEFAULT 'UTC',
  	"trailing_slash" boolean DEFAULT true,
  	"hero_status_text" varchar,
  	"hero_status_live" boolean DEFAULT false,
  	"hero_status_verification_status" "enum_site_settings_hero_status_verification_status" DEFAULT 'unverified' NOT NULL,
  	"hero_status_verification_verified_by_id" uuid,
  	"hero_status_verification_verified_at" timestamp(3) with time zone,
  	"hero_status_verification_note" varchar,
  	"build" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "brand_settings" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"brand_name" varchar NOT NULL,
  	"wordmark_text" varchar,
  	"wordmark_accent_suffix" varchar,
  	"wordmark_subline" varchar,
  	"logo_id" uuid,
  	"monogram_id" uuid,
  	"og_default_id" uuid,
  	"design_contract_version" varchar,
  	"voice" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "header_primary" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"href" varchar NOT NULL,
  	"rel" varchar,
  	"external" boolean DEFAULT false
  );
  
  CREATE TABLE "header_utility" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"href" varchar NOT NULL,
  	"rel" varchar,
  	"external" boolean DEFAULT false
  );
  
  CREATE TABLE "header_palette" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"href" varchar NOT NULL,
  	"keywords" varchar
  );
  
  CREATE TABLE "header" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"cta_label" varchar,
  	"cta_href" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "footer_columns_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"href" varchar NOT NULL,
  	"rel" varchar,
  	"external" boolean DEFAULT false
  );
  
  CREATE TABLE "footer_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar NOT NULL
  );
  
  CREATE TABLE "footer_legal" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"href" varchar NOT NULL,
  	"rel" varchar,
  	"external" boolean DEFAULT false
  );
  
  CREATE TABLE "footer" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "contact_legal_social_profiles" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"network" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"handle" varchar
  );
  
  CREATE TABLE "contact_legal" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"legal_name" varchar,
  	"contact_email_public" varchar,
  	"privacy_page_id" uuid,
  	"terms_page_id" uuid,
  	"accessibility_statement_page_id" uuid,
  	"verification_status" "enum_contact_legal_verification_status" DEFAULT 'unverified' NOT NULL,
  	"verification_verified_by_id" uuid,
  	"verification_verified_at" timestamp(3) with time zone,
  	"verification_note" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "contact_legal_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"offices_id" uuid
  );
  
  CREATE TABLE "seo_defaults" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title_template" varchar DEFAULT '{title} | {siteName}' NOT NULL,
  	"default_description" varchar,
  	"default_og_image_id" uuid,
  	"twitter_site" varchar,
  	"robots_directives" varchar DEFAULT 'index,follow,max-image-preview:large,max-snippet:-1',
  	"robots_txt" varchar,
  	"llms_txt" varchar,
  	"organization_entity_id" uuid,
  	"website_entity_id" uuid,
  	"person_entity_id" uuid,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "integrations_ai_features" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum_integrations_ai_features",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "integrations" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"turnstile_enabled" boolean DEFAULT true,
  	"turnstile_site_key" varchar,
  	"analytics_provider" "enum_integrations_analytics_provider" DEFAULT 'none',
  	"analytics_public_id" varchar,
  	"analytics_host" varchar,
  	"analytics_requires_consent" boolean DEFAULT true,
  	"ai_enabled" boolean DEFAULT false,
  	"ai_data_policy_note" varchar,
  	"email_provider" "enum_integrations_email_provider" DEFAULT 'mock',
  	"email_from_name" varchar,
  	"email_from_email" varchar,
  	"email_notify_email" varchar,
  	"email_reply_to" varchar,
  	"search_intelligence_enabled" boolean DEFAULT false,
  	"crm_enabled" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "chat_config_greetings" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"context" varchar NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "chat_config_brief_steps_chips" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"value" varchar
  );
  
  CREATE TABLE "chat_config_brief_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"prompt" varchar NOT NULL,
  	"type" "enum_chat_config_brief_steps_type" NOT NULL,
  	"required" boolean,
  	"skip_label" varchar
  );
  
  CREATE TABLE "chat_config_roadmap_steps_chips" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"value" varchar
  );
  
  CREATE TABLE "chat_config_roadmap_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"prompt" varchar NOT NULL,
  	"type" "enum_chat_config_roadmap_steps_type" NOT NULL,
  	"required" boolean
  );
  
  CREATE TABLE "chat_config" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"copy_success" varchar,
  	"copy_roadmap_success" varchar,
  	"copy_failure" varchar,
  	"copy_fallback_url" varchar,
  	"copy_legal" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "roadmap_config_ai_agents" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"agent" varchar NOT NULL,
  	"kind" "enum_roadmap_config_ai_agents_kind"
  );
  
  CREATE TABLE "roadmap_config_findings" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"severity" "enum_roadmap_config_findings_severity" NOT NULL,
  	"title" varchar NOT NULL,
  	"body" varchar
  );
  
  CREATE TABLE "roadmap_config_plan_phases" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"weeks" varchar NOT NULL,
  	"heading" varchar NOT NULL,
  	"body" varchar,
  	"focus" varchar
  );
  
  CREATE TABLE "roadmap_config" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"daily_cap_per_email" numeric DEFAULT 2,
  	"daily_cap_global" numeric DEFAULT 100,
  	"score_weights" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "email_templates" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"notify_owner_subject" varchar NOT NULL,
  	"notify_owner_preheader" varchar,
  	"notify_owner_body" jsonb,
  	"notify_owner_text_fallback" varchar,
  	"confirmation_subject" varchar NOT NULL,
  	"confirmation_preheader" varchar,
  	"confirmation_body" jsonb,
  	"confirmation_text_fallback" varchar,
  	"welcome_subject" varchar NOT NULL,
  	"welcome_preheader" varchar,
  	"welcome_body" jsonb,
  	"welcome_text_fallback" varchar,
  	"roadmap_subject" varchar NOT NULL,
  	"roadmap_preheader" varchar,
  	"roadmap_body" jsonb,
  	"roadmap_text_fallback" varchar,
  	"roadmap_copy_subject" varchar NOT NULL,
  	"roadmap_copy_preheader" varchar,
  	"roadmap_copy_body" jsonb,
  	"roadmap_copy_text_fallback" varchar,
  	"signature" varchar,
  	"list_unsubscribe" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "spam_config_phrases" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"phrase" varchar NOT NULL
  );
  
  CREATE TABLE "spam_config_throwaway_domains" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"domain" varchar NOT NULL
  );
  
  CREATE TABLE "spam_config_disposable_domains" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"domain" varchar NOT NULL
  );
  
  CREATE TABLE "spam_config_known_good_domains" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"domain" varchar NOT NULL
  );
  
  CREATE TABLE "spam_config_role_local_parts" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"local" varchar NOT NULL
  );
  
  CREATE TABLE "spam_config" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"thresholds_silent_drop_score" numeric DEFAULT 5,
  	"thresholds_dwell_min_seconds" numeric DEFAULT 3,
  	"thresholds_dwell_max_seconds" numeric DEFAULT 7200,
  	"thresholds_rate_per_hour" numeric DEFAULT 20,
  	"thresholds_sends_per_hour" numeric DEFAULT 5,
  	"thresholds_global_per_day" numeric DEFAULT 200,
  	"thresholds_dedupe_window_seconds" numeric DEFAULT 900,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "form_config_selects_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"value" varchar NOT NULL,
  	"default" boolean
  );
  
  CREATE TABLE "form_config_selects" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL
  );
  
  CREATE TABLE "form_config" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"messages_sending" varchar,
  	"messages_sent" varchar,
  	"messages_duplicate" varchar,
  	"messages_typo_prompt" varchar,
  	"messages_fallback" varchar,
  	"messages_newsletter_pending" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "users_roles" ADD CONSTRAINT "users_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users" ADD CONSTRAINT "users_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_rich_text" ADD CONSTRAINT "pages_blocks_rich_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_seo_schema_types" ADD CONSTRAINT "pages_seo_schema_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_seo_og_image_id_media_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_verification_verified_by_id_users_id_fk" FOREIGN KEY ("verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_rels" ADD CONSTRAINT "pages_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_rels" ADD CONSTRAINT "pages_rels_people_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_rels" ADD CONSTRAINT "pages_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_rich_text" ADD CONSTRAINT "_pages_v_blocks_rich_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_version_seo_schema_types" ADD CONSTRAINT "_pages_v_version_seo_schema_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_parent_id_pages_id_fk" FOREIGN KEY ("version_parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_seo_og_image_id_media_id_fk" FOREIGN KEY ("version_seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_verification_verified_by_id_users_id_fk" FOREIGN KEY ("version_verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_people_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_update_history" ADD CONSTRAINT "posts_update_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_seo_schema_types" ADD CONSTRAINT "posts_seo_schema_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_featured_image_id_media_id_fk" FOREIGN KEY ("featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_seo_og_image_id_media_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_verification_verified_by_id_users_id_fk" FOREIGN KEY ("verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_topics_fk" FOREIGN KEY ("topics_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_people_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_version_update_history" ADD CONSTRAINT "_posts_v_version_update_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_version_seo_schema_types" ADD CONSTRAINT "_posts_v_version_seo_schema_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_parent_id_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_featured_image_id_media_id_fk" FOREIGN KEY ("version_featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_category_id_categories_id_fk" FOREIGN KEY ("version_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_seo_og_image_id_media_id_fk" FOREIGN KEY ("version_seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_verification_verified_by_id_users_id_fk" FOREIGN KEY ("version_verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_topics_fk" FOREIGN KEY ("topics_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_people_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "categories_seo_schema_types" ADD CONSTRAINT "categories_seo_schema_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_seo_og_image_id_media_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories_rels" ADD CONSTRAINT "categories_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "categories_rels" ADD CONSTRAINT "categories_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tags_seo_schema_types" ADD CONSTRAINT "tags_seo_schema_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tags" ADD CONSTRAINT "tags_seo_og_image_id_media_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tags_rels" ADD CONSTRAINT "tags_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tags_rels" ADD CONSTRAINT "tags_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "topics_seo_schema_types" ADD CONSTRAINT "topics_seo_schema_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "topics" ADD CONSTRAINT "topics_seo_og_image_id_media_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "topics_rels" ADD CONSTRAINT "topics_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "topics_rels" ADD CONSTRAINT "topics_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "industries_seo_schema_types" ADD CONSTRAINT "industries_seo_schema_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."industries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "industries" ADD CONSTRAINT "industries_seo_og_image_id_media_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "industries_rels" ADD CONSTRAINT "industries_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."industries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "industries_rels" ADD CONSTRAINT "industries_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
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
  ALTER TABLE "services_offer_includes" ADD CONSTRAINT "services_offer_includes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "services_seo_schema_types" ADD CONSTRAINT "services_seo_schema_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "services" ADD CONSTRAINT "services_seo_og_image_id_media_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "services" ADD CONSTRAINT "services_verification_verified_by_id_users_id_fk" FOREIGN KEY ("verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "services_rels" ADD CONSTRAINT "services_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "services_rels" ADD CONSTRAINT "services_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_services_v_version_offer_includes" ADD CONSTRAINT "_services_v_version_offer_includes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_services_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_services_v_version_seo_schema_types" ADD CONSTRAINT "_services_v_version_seo_schema_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_services_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_services_v" ADD CONSTRAINT "_services_v_parent_id_services_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_services_v" ADD CONSTRAINT "_services_v_version_seo_og_image_id_media_id_fk" FOREIGN KEY ("version_seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_services_v" ADD CONSTRAINT "_services_v_version_verification_verified_by_id_users_id_fk" FOREIGN KEY ("version_verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_services_v_rels" ADD CONSTRAINT "_services_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_services_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_services_v_rels" ADD CONSTRAINT "_services_v_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "offices_hours_days" ADD CONSTRAINT "offices_hours_days_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."offices_hours"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "offices_hours" ADD CONSTRAINT "offices_hours_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "offices" ADD CONSTRAINT "offices_verification_verified_by_id_users_id_fk" FOREIGN KEY ("verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_offices_v_version_hours_days" ADD CONSTRAINT "_offices_v_version_hours_days_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_offices_v_version_hours"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_offices_v_version_hours" ADD CONSTRAINT "_offices_v_version_hours_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_offices_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_offices_v" ADD CONSTRAINT "_offices_v_parent_id_offices_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."offices"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_offices_v" ADD CONSTRAINT "_offices_v_version_verification_verified_by_id_users_id_fk" FOREIGN KEY ("version_verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "case_studies_diagnostics" ADD CONSTRAINT "case_studies_diagnostics_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."case_studies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "case_studies_plays" ADD CONSTRAINT "case_studies_plays_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."case_studies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "case_studies_phases" ADD CONSTRAINT "case_studies_phases_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."case_studies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "case_studies_results" ADD CONSTRAINT "case_studies_results_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."case_studies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "case_studies_kpis" ADD CONSTRAINT "case_studies_kpis_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."case_studies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "case_studies_stack" ADD CONSTRAINT "case_studies_stack_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."case_studies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "case_studies_sources" ADD CONSTRAINT "case_studies_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."case_studies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "case_studies_seo_schema_types" ADD CONSTRAINT "case_studies_seo_schema_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."case_studies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "case_studies" ADD CONSTRAINT "case_studies_seo_og_image_id_media_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "case_studies" ADD CONSTRAINT "case_studies_verification_verified_by_id_users_id_fk" FOREIGN KEY ("verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "case_studies_rels" ADD CONSTRAINT "case_studies_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."case_studies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "case_studies_rels" ADD CONSTRAINT "case_studies_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_case_studies_v_version_diagnostics" ADD CONSTRAINT "_case_studies_v_version_diagnostics_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_case_studies_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_case_studies_v_version_plays" ADD CONSTRAINT "_case_studies_v_version_plays_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_case_studies_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_case_studies_v_version_phases" ADD CONSTRAINT "_case_studies_v_version_phases_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_case_studies_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_case_studies_v_version_results" ADD CONSTRAINT "_case_studies_v_version_results_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_case_studies_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_case_studies_v_version_kpis" ADD CONSTRAINT "_case_studies_v_version_kpis_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_case_studies_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_case_studies_v_version_stack" ADD CONSTRAINT "_case_studies_v_version_stack_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_case_studies_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_case_studies_v_version_sources" ADD CONSTRAINT "_case_studies_v_version_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_case_studies_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_case_studies_v_version_seo_schema_types" ADD CONSTRAINT "_case_studies_v_version_seo_schema_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_case_studies_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_case_studies_v" ADD CONSTRAINT "_case_studies_v_parent_id_case_studies_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."case_studies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_case_studies_v" ADD CONSTRAINT "_case_studies_v_version_seo_og_image_id_media_id_fk" FOREIGN KEY ("version_seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_case_studies_v" ADD CONSTRAINT "_case_studies_v_version_verification_verified_by_id_users_id_fk" FOREIGN KEY ("version_verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_case_studies_v_rels" ADD CONSTRAINT "_case_studies_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_case_studies_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_case_studies_v_rels" ADD CONSTRAINT "_case_studies_v_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ventures_details" ADD CONSTRAINT "ventures_details_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ventures"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ventures_stack" ADD CONSTRAINT "ventures_stack_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ventures"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ventures_seo_schema_types" ADD CONSTRAINT "ventures_seo_schema_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ventures"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ventures" ADD CONSTRAINT "ventures_seo_og_image_id_media_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ventures" ADD CONSTRAINT "ventures_verification_verified_by_id_users_id_fk" FOREIGN KEY ("verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ventures_rels" ADD CONSTRAINT "ventures_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ventures"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ventures_rels" ADD CONSTRAINT "ventures_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_ventures_v_version_details" ADD CONSTRAINT "_ventures_v_version_details_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_ventures_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_ventures_v_version_stack" ADD CONSTRAINT "_ventures_v_version_stack_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_ventures_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_ventures_v_version_seo_schema_types" ADD CONSTRAINT "_ventures_v_version_seo_schema_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_ventures_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_ventures_v" ADD CONSTRAINT "_ventures_v_parent_id_ventures_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ventures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_ventures_v" ADD CONSTRAINT "_ventures_v_version_seo_og_image_id_media_id_fk" FOREIGN KEY ("version_seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_ventures_v" ADD CONSTRAINT "_ventures_v_version_verification_verified_by_id_users_id_fk" FOREIGN KEY ("version_verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_ventures_v_rels" ADD CONSTRAINT "_ventures_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_ventures_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_ventures_v_rels" ADD CONSTRAINT "_ventures_v_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_verification_verified_by_id_users_id_fk" FOREIGN KEY ("verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_testimonials_v" ADD CONSTRAINT "_testimonials_v_parent_id_testimonials_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."testimonials"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_testimonials_v" ADD CONSTRAINT "_testimonials_v_version_verification_verified_by_id_users_id_fk" FOREIGN KEY ("version_verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "faqs" ADD CONSTRAINT "faqs_verification_verified_by_id_users_id_fk" FOREIGN KEY ("verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "faqs_rels" ADD CONSTRAINT "faqs_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."faqs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "faqs_rels" ADD CONSTRAINT "faqs_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_faqs_v" ADD CONSTRAINT "_faqs_v_parent_id_faqs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."faqs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_faqs_v" ADD CONSTRAINT "_faqs_v_version_verification_verified_by_id_users_id_fk" FOREIGN KEY ("version_verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_faqs_v_rels" ADD CONSTRAINT "_faqs_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_faqs_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_faqs_v_rels" ADD CONSTRAINT "_faqs_v_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "glossary_terms" ADD CONSTRAINT "glossary_terms_verification_verified_by_id_users_id_fk" FOREIGN KEY ("verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_glossary_terms_v" ADD CONSTRAINT "_glossary_terms_v_parent_id_glossary_terms_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."glossary_terms"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_glossary_terms_v" ADD CONSTRAINT "_glossary_terms_v_version_verification_verified_by_id_users_id_fk" FOREIGN KEY ("version_verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "citations" ADD CONSTRAINT "citations_verification_verified_by_id_users_id_fk" FOREIGN KEY ("verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "evidence_stats" ADD CONSTRAINT "evidence_stats_citation_id_citations_id_fk" FOREIGN KEY ("citation_id") REFERENCES "public"."citations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "evidence_stats" ADD CONSTRAINT "evidence_stats_verification_verified_by_id_users_id_fk" FOREIGN KEY ("verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_evidence_stats_v" ADD CONSTRAINT "_evidence_stats_v_parent_id_evidence_stats_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."evidence_stats"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_evidence_stats_v" ADD CONSTRAINT "_evidence_stats_v_version_citation_id_citations_id_fk" FOREIGN KEY ("version_citation_id") REFERENCES "public"."citations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_evidence_stats_v" ADD CONSTRAINT "_evidence_stats_v_version_verification_verified_by_id_users_id_fk" FOREIGN KEY ("version_verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ctas" ADD CONSTRAINT "ctas_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_ctas_v" ADD CONSTRAINT "_ctas_v_parent_id_ctas_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ctas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_ctas_v" ADD CONSTRAINT "_ctas_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "simulator_prompts_before_sources" ADD CONSTRAINT "simulator_prompts_before_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."simulator_prompts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "simulator_prompts_after_sources" ADD CONSTRAINT "simulator_prompts_after_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."simulator_prompts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_simulator_prompts_v_version_before_sources" ADD CONSTRAINT "_simulator_prompts_v_version_before_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_simulator_prompts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_simulator_prompts_v_version_after_sources" ADD CONSTRAINT "_simulator_prompts_v_version_after_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_simulator_prompts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_simulator_prompts_v" ADD CONSTRAINT "_simulator_prompts_v_parent_id_simulator_prompts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."simulator_prompts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "scorecard_questions_options" ADD CONSTRAINT "scorecard_questions_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."scorecard_questions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_scorecard_questions_v_version_options" ADD CONSTRAINT "_scorecard_questions_v_version_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_scorecard_questions_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_scorecard_questions_v" ADD CONSTRAINT "_scorecard_questions_v_parent_id_scorecard_questions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."scorecard_questions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_scorecard_bands_v" ADD CONSTRAINT "_scorecard_bands_v_parent_id_scorecard_bands_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."scorecard_bands"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "revenue_model_programs" ADD CONSTRAINT "revenue_model_programs_verification_verified_by_id_users_id_fk" FOREIGN KEY ("verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_revenue_model_programs_v" ADD CONSTRAINT "_revenue_model_programs_v_parent_id_revenue_model_programs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."revenue_model_programs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_revenue_model_programs_v" ADD CONSTRAINT "_revenue_model_programs_v_version_verification_verified_by_id_users_id_fk" FOREIGN KEY ("version_verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_notices_v" ADD CONSTRAINT "_notices_v_parent_id_notices_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."notices"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "schema_entities" ADD CONSTRAINT "schema_entities_verification_verified_by_id_users_id_fk" FOREIGN KEY ("verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "seo_templates_applies_to" ADD CONSTRAINT "seo_templates_applies_to_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."seo_templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_fields_options" ADD CONSTRAINT "forms_fields_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms_fields"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_fields" ADD CONSTRAINT "forms_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "submissions" ADD CONSTRAINT "submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "submissions" ADD CONSTRAINT "submissions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "submissions" ADD CONSTRAINT "submissions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscribers_tags" ADD CONSTRAINT "subscribers_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "subscribers_history" ADD CONSTRAINT "subscribers_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "companies" ADD CONSTRAINT "companies_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "companies" ADD CONSTRAINT "companies_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "leads" ADD CONSTRAINT "leads_ai_insight_reviewed_by_id_users_id_fk" FOREIGN KEY ("ai_insight_reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "activities" ADD CONSTRAINT "activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "activities" ADD CONSTRAINT "activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "activities" ADD CONSTRAINT "activities_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lead_score_rules" ADD CONSTRAINT "lead_score_rules_verification_verified_by_id_users_id_fk" FOREIGN KEY ("verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "outbox" ADD CONSTRAINT "outbox_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_private_files_fk" FOREIGN KEY ("private_files_id") REFERENCES "public"."private_files"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_topics_fk" FOREIGN KEY ("topics_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_industries_fk" FOREIGN KEY ("industries_id") REFERENCES "public"."industries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_locations_fk" FOREIGN KEY ("locations_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_people_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_services_fk" FOREIGN KEY ("services_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_offices_fk" FOREIGN KEY ("offices_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_case_studies_fk" FOREIGN KEY ("case_studies_id") REFERENCES "public"."case_studies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ventures_fk" FOREIGN KEY ("ventures_id") REFERENCES "public"."ventures"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_testimonials_fk" FOREIGN KEY ("testimonials_id") REFERENCES "public"."testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_faqs_fk" FOREIGN KEY ("faqs_id") REFERENCES "public"."faqs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_glossary_terms_fk" FOREIGN KEY ("glossary_terms_id") REFERENCES "public"."glossary_terms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_citations_fk" FOREIGN KEY ("citations_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_evidence_stats_fk" FOREIGN KEY ("evidence_stats_id") REFERENCES "public"."evidence_stats"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ctas_fk" FOREIGN KEY ("ctas_id") REFERENCES "public"."ctas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_simulator_prompts_fk" FOREIGN KEY ("simulator_prompts_id") REFERENCES "public"."simulator_prompts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_scorecard_questions_fk" FOREIGN KEY ("scorecard_questions_id") REFERENCES "public"."scorecard_questions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_scorecard_bands_fk" FOREIGN KEY ("scorecard_bands_id") REFERENCES "public"."scorecard_bands"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_revenue_model_programs_fk" FOREIGN KEY ("revenue_model_programs_id") REFERENCES "public"."revenue_model_programs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notices_fk" FOREIGN KEY ("notices_id") REFERENCES "public"."notices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_schema_entities_fk" FOREIGN KEY ("schema_entities_id") REFERENCES "public"."schema_entities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_seo_templates_fk" FOREIGN KEY ("seo_templates_id") REFERENCES "public"."seo_templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_redirects_fk" FOREIGN KEY ("redirects_id") REFERENCES "public"."redirects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_forms_fk" FOREIGN KEY ("forms_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_submissions_fk" FOREIGN KEY ("submissions_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_subscribers_fk" FOREIGN KEY ("subscribers_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_companies_fk" FOREIGN KEY ("companies_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_contacts_fk" FOREIGN KEY ("contacts_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_leads_fk" FOREIGN KEY ("leads_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_activities_fk" FOREIGN KEY ("activities_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tasks_fk" FOREIGN KEY ("tasks_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lead_score_rules_fk" FOREIGN KEY ("lead_score_rules_id") REFERENCES "public"."lead_score_rules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_outbox_fk" FOREIGN KEY ("outbox_id") REFERENCES "public"."outbox"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audit_log_fk" FOREIGN KEY ("audit_log_id") REFERENCES "public"."audit_log"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_stats" ADD CONSTRAINT "site_settings_stats_verification_verified_by_id_users_id_fk" FOREIGN KEY ("verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "site_settings_stats" ADD CONSTRAINT "site_settings_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_hero_status_verification_verified_by_id_users_id_fk" FOREIGN KEY ("hero_status_verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "brand_settings" ADD CONSTRAINT "brand_settings_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "brand_settings" ADD CONSTRAINT "brand_settings_monogram_id_media_id_fk" FOREIGN KEY ("monogram_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "brand_settings" ADD CONSTRAINT "brand_settings_og_default_id_media_id_fk" FOREIGN KEY ("og_default_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "header_primary" ADD CONSTRAINT "header_primary_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "header_utility" ADD CONSTRAINT "header_utility_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "header_palette" ADD CONSTRAINT "header_palette_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "footer_columns_links" ADD CONSTRAINT "footer_columns_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."footer_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "footer_columns" ADD CONSTRAINT "footer_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "footer_legal" ADD CONSTRAINT "footer_legal_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "contact_legal_social_profiles" ADD CONSTRAINT "contact_legal_social_profiles_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."contact_legal"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "contact_legal" ADD CONSTRAINT "contact_legal_privacy_page_id_pages_id_fk" FOREIGN KEY ("privacy_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contact_legal" ADD CONSTRAINT "contact_legal_terms_page_id_pages_id_fk" FOREIGN KEY ("terms_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contact_legal" ADD CONSTRAINT "contact_legal_accessibility_statement_page_id_pages_id_fk" FOREIGN KEY ("accessibility_statement_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contact_legal" ADD CONSTRAINT "contact_legal_verification_verified_by_id_users_id_fk" FOREIGN KEY ("verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "contact_legal_rels" ADD CONSTRAINT "contact_legal_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."contact_legal"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "contact_legal_rels" ADD CONSTRAINT "contact_legal_rels_offices_fk" FOREIGN KEY ("offices_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "seo_defaults" ADD CONSTRAINT "seo_defaults_default_og_image_id_media_id_fk" FOREIGN KEY ("default_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "seo_defaults" ADD CONSTRAINT "seo_defaults_organization_entity_id_schema_entities_id_fk" FOREIGN KEY ("organization_entity_id") REFERENCES "public"."schema_entities"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "seo_defaults" ADD CONSTRAINT "seo_defaults_website_entity_id_schema_entities_id_fk" FOREIGN KEY ("website_entity_id") REFERENCES "public"."schema_entities"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "seo_defaults" ADD CONSTRAINT "seo_defaults_person_entity_id_people_id_fk" FOREIGN KEY ("person_entity_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "integrations_ai_features" ADD CONSTRAINT "integrations_ai_features_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chat_config_greetings" ADD CONSTRAINT "chat_config_greetings_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chat_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chat_config_brief_steps_chips" ADD CONSTRAINT "chat_config_brief_steps_chips_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chat_config_brief_steps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chat_config_brief_steps" ADD CONSTRAINT "chat_config_brief_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chat_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chat_config_roadmap_steps_chips" ADD CONSTRAINT "chat_config_roadmap_steps_chips_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chat_config_roadmap_steps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chat_config_roadmap_steps" ADD CONSTRAINT "chat_config_roadmap_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chat_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "roadmap_config_ai_agents" ADD CONSTRAINT "roadmap_config_ai_agents_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."roadmap_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "roadmap_config_findings" ADD CONSTRAINT "roadmap_config_findings_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."roadmap_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "roadmap_config_plan_phases" ADD CONSTRAINT "roadmap_config_plan_phases_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."roadmap_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "spam_config_phrases" ADD CONSTRAINT "spam_config_phrases_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."spam_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "spam_config_throwaway_domains" ADD CONSTRAINT "spam_config_throwaway_domains_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."spam_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "spam_config_disposable_domains" ADD CONSTRAINT "spam_config_disposable_domains_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."spam_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "spam_config_known_good_domains" ADD CONSTRAINT "spam_config_known_good_domains_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."spam_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "spam_config_role_local_parts" ADD CONSTRAINT "spam_config_role_local_parts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."spam_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "form_config_selects_options" ADD CONSTRAINT "form_config_selects_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."form_config_selects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "form_config_selects" ADD CONSTRAINT "form_config_selects_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."form_config"("id") ON DELETE cascade ON UPDATE no action;
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
  CREATE INDEX "private_files_updated_at_idx" ON "private_files" USING btree ("updated_at");
  CREATE INDEX "private_files_created_at_idx" ON "private_files" USING btree ("created_at");
  CREATE UNIQUE INDEX "private_files_filename_idx" ON "private_files" USING btree ("filename");
  CREATE INDEX "pages_blocks_rich_text_order_idx" ON "pages_blocks_rich_text" USING btree ("_order");
  CREATE INDEX "pages_blocks_rich_text_parent_id_idx" ON "pages_blocks_rich_text" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_rich_text_path_idx" ON "pages_blocks_rich_text" USING btree ("_path");
  CREATE INDEX "pages_seo_schema_types_order_idx" ON "pages_seo_schema_types" USING btree ("order");
  CREATE INDEX "pages_seo_schema_types_parent_idx" ON "pages_seo_schema_types" USING btree ("parent_id");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
  CREATE INDEX "pages_parent_idx" ON "pages" USING btree ("parent_id");
  CREATE INDEX "pages_seo_seo_og_image_idx" ON "pages" USING btree ("seo_og_image_id");
  CREATE INDEX "pages_verification_verification_verified_by_idx" ON "pages" USING btree ("verification_verified_by_id");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE INDEX "pages__status_idx" ON "pages" USING btree ("_status");
  CREATE INDEX "pages_rels_order_idx" ON "pages_rels" USING btree ("order");
  CREATE INDEX "pages_rels_parent_idx" ON "pages_rels" USING btree ("parent_id");
  CREATE INDEX "pages_rels_path_idx" ON "pages_rels" USING btree ("path");
  CREATE INDEX "pages_rels_people_id_idx" ON "pages_rels" USING btree ("people_id");
  CREATE INDEX "pages_rels_citations_id_idx" ON "pages_rels" USING btree ("citations_id");
  CREATE INDEX "_pages_v_blocks_rich_text_order_idx" ON "_pages_v_blocks_rich_text" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_rich_text_parent_id_idx" ON "_pages_v_blocks_rich_text" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_rich_text_path_idx" ON "_pages_v_blocks_rich_text" USING btree ("_path");
  CREATE INDEX "_pages_v_version_seo_schema_types_order_idx" ON "_pages_v_version_seo_schema_types" USING btree ("order");
  CREATE INDEX "_pages_v_version_seo_schema_types_parent_idx" ON "_pages_v_version_seo_schema_types" USING btree ("parent_id");
  CREATE INDEX "_pages_v_parent_idx" ON "_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_version_parent_idx" ON "_pages_v" USING btree ("version_parent_id");
  CREATE INDEX "_pages_v_version_seo_version_seo_og_image_idx" ON "_pages_v" USING btree ("version_seo_og_image_id");
  CREATE INDEX "_pages_v_version_verification_version_verification_verif_idx" ON "_pages_v" USING btree ("version_verification_verified_by_id");
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
  CREATE INDEX "posts_update_history_order_idx" ON "posts_update_history" USING btree ("_order");
  CREATE INDEX "posts_update_history_parent_id_idx" ON "posts_update_history" USING btree ("_parent_id");
  CREATE INDEX "posts_seo_schema_types_order_idx" ON "posts_seo_schema_types" USING btree ("order");
  CREATE INDEX "posts_seo_schema_types_parent_idx" ON "posts_seo_schema_types" USING btree ("parent_id");
  CREATE UNIQUE INDEX "posts_slug_idx" ON "posts" USING btree ("slug");
  CREATE INDEX "posts_featured_image_idx" ON "posts" USING btree ("featured_image_id");
  CREATE INDEX "posts_category_idx" ON "posts" USING btree ("category_id");
  CREATE INDEX "posts_seo_seo_og_image_idx" ON "posts" USING btree ("seo_og_image_id");
  CREATE INDEX "posts_verification_verification_verified_by_idx" ON "posts" USING btree ("verification_verified_by_id");
  CREATE INDEX "posts_updated_at_idx" ON "posts" USING btree ("updated_at");
  CREATE INDEX "posts_created_at_idx" ON "posts" USING btree ("created_at");
  CREATE INDEX "posts__status_idx" ON "posts" USING btree ("_status");
  CREATE INDEX "posts_rels_order_idx" ON "posts_rels" USING btree ("order");
  CREATE INDEX "posts_rels_parent_idx" ON "posts_rels" USING btree ("parent_id");
  CREATE INDEX "posts_rels_path_idx" ON "posts_rels" USING btree ("path");
  CREATE INDEX "posts_rels_tags_id_idx" ON "posts_rels" USING btree ("tags_id");
  CREATE INDEX "posts_rels_topics_id_idx" ON "posts_rels" USING btree ("topics_id");
  CREATE INDEX "posts_rels_posts_id_idx" ON "posts_rels" USING btree ("posts_id");
  CREATE INDEX "posts_rels_people_id_idx" ON "posts_rels" USING btree ("people_id");
  CREATE INDEX "posts_rels_citations_id_idx" ON "posts_rels" USING btree ("citations_id");
  CREATE INDEX "_posts_v_version_update_history_order_idx" ON "_posts_v_version_update_history" USING btree ("_order");
  CREATE INDEX "_posts_v_version_update_history_parent_id_idx" ON "_posts_v_version_update_history" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_version_seo_schema_types_order_idx" ON "_posts_v_version_seo_schema_types" USING btree ("order");
  CREATE INDEX "_posts_v_version_seo_schema_types_parent_idx" ON "_posts_v_version_seo_schema_types" USING btree ("parent_id");
  CREATE INDEX "_posts_v_parent_idx" ON "_posts_v" USING btree ("parent_id");
  CREATE INDEX "_posts_v_version_version_slug_idx" ON "_posts_v" USING btree ("version_slug");
  CREATE INDEX "_posts_v_version_version_featured_image_idx" ON "_posts_v" USING btree ("version_featured_image_id");
  CREATE INDEX "_posts_v_version_version_category_idx" ON "_posts_v" USING btree ("version_category_id");
  CREATE INDEX "_posts_v_version_seo_version_seo_og_image_idx" ON "_posts_v" USING btree ("version_seo_og_image_id");
  CREATE INDEX "_posts_v_version_verification_version_verification_verif_idx" ON "_posts_v" USING btree ("version_verification_verified_by_id");
  CREATE INDEX "_posts_v_version_version_updated_at_idx" ON "_posts_v" USING btree ("version_updated_at");
  CREATE INDEX "_posts_v_version_version_created_at_idx" ON "_posts_v" USING btree ("version_created_at");
  CREATE INDEX "_posts_v_version_version__status_idx" ON "_posts_v" USING btree ("version__status");
  CREATE INDEX "_posts_v_created_at_idx" ON "_posts_v" USING btree ("created_at");
  CREATE INDEX "_posts_v_updated_at_idx" ON "_posts_v" USING btree ("updated_at");
  CREATE INDEX "_posts_v_latest_idx" ON "_posts_v" USING btree ("latest");
  CREATE INDEX "_posts_v_autosave_idx" ON "_posts_v" USING btree ("autosave");
  CREATE INDEX "_posts_v_rels_order_idx" ON "_posts_v_rels" USING btree ("order");
  CREATE INDEX "_posts_v_rels_parent_idx" ON "_posts_v_rels" USING btree ("parent_id");
  CREATE INDEX "_posts_v_rels_path_idx" ON "_posts_v_rels" USING btree ("path");
  CREATE INDEX "_posts_v_rels_tags_id_idx" ON "_posts_v_rels" USING btree ("tags_id");
  CREATE INDEX "_posts_v_rels_topics_id_idx" ON "_posts_v_rels" USING btree ("topics_id");
  CREATE INDEX "_posts_v_rels_posts_id_idx" ON "_posts_v_rels" USING btree ("posts_id");
  CREATE INDEX "_posts_v_rels_people_id_idx" ON "_posts_v_rels" USING btree ("people_id");
  CREATE INDEX "_posts_v_rels_citations_id_idx" ON "_posts_v_rels" USING btree ("citations_id");
  CREATE INDEX "categories_seo_schema_types_order_idx" ON "categories_seo_schema_types" USING btree ("order");
  CREATE INDEX "categories_seo_schema_types_parent_idx" ON "categories_seo_schema_types" USING btree ("parent_id");
  CREATE UNIQUE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");
  CREATE INDEX "categories_seo_seo_og_image_idx" ON "categories" USING btree ("seo_og_image_id");
  CREATE INDEX "categories_updated_at_idx" ON "categories" USING btree ("updated_at");
  CREATE INDEX "categories_created_at_idx" ON "categories" USING btree ("created_at");
  CREATE INDEX "categories_rels_order_idx" ON "categories_rels" USING btree ("order");
  CREATE INDEX "categories_rels_parent_idx" ON "categories_rels" USING btree ("parent_id");
  CREATE INDEX "categories_rels_path_idx" ON "categories_rels" USING btree ("path");
  CREATE INDEX "categories_rels_citations_id_idx" ON "categories_rels" USING btree ("citations_id");
  CREATE INDEX "tags_seo_schema_types_order_idx" ON "tags_seo_schema_types" USING btree ("order");
  CREATE INDEX "tags_seo_schema_types_parent_idx" ON "tags_seo_schema_types" USING btree ("parent_id");
  CREATE UNIQUE INDEX "tags_slug_idx" ON "tags" USING btree ("slug");
  CREATE INDEX "tags_seo_seo_og_image_idx" ON "tags" USING btree ("seo_og_image_id");
  CREATE INDEX "tags_updated_at_idx" ON "tags" USING btree ("updated_at");
  CREATE INDEX "tags_created_at_idx" ON "tags" USING btree ("created_at");
  CREATE INDEX "tags_rels_order_idx" ON "tags_rels" USING btree ("order");
  CREATE INDEX "tags_rels_parent_idx" ON "tags_rels" USING btree ("parent_id");
  CREATE INDEX "tags_rels_path_idx" ON "tags_rels" USING btree ("path");
  CREATE INDEX "tags_rels_citations_id_idx" ON "tags_rels" USING btree ("citations_id");
  CREATE INDEX "topics_seo_schema_types_order_idx" ON "topics_seo_schema_types" USING btree ("order");
  CREATE INDEX "topics_seo_schema_types_parent_idx" ON "topics_seo_schema_types" USING btree ("parent_id");
  CREATE UNIQUE INDEX "topics_slug_idx" ON "topics" USING btree ("slug");
  CREATE INDEX "topics_seo_seo_og_image_idx" ON "topics" USING btree ("seo_og_image_id");
  CREATE INDEX "topics_updated_at_idx" ON "topics" USING btree ("updated_at");
  CREATE INDEX "topics_created_at_idx" ON "topics" USING btree ("created_at");
  CREATE INDEX "topics_rels_order_idx" ON "topics_rels" USING btree ("order");
  CREATE INDEX "topics_rels_parent_idx" ON "topics_rels" USING btree ("parent_id");
  CREATE INDEX "topics_rels_path_idx" ON "topics_rels" USING btree ("path");
  CREATE INDEX "topics_rels_citations_id_idx" ON "topics_rels" USING btree ("citations_id");
  CREATE INDEX "industries_seo_schema_types_order_idx" ON "industries_seo_schema_types" USING btree ("order");
  CREATE INDEX "industries_seo_schema_types_parent_idx" ON "industries_seo_schema_types" USING btree ("parent_id");
  CREATE UNIQUE INDEX "industries_slug_idx" ON "industries" USING btree ("slug");
  CREATE INDEX "industries_seo_seo_og_image_idx" ON "industries" USING btree ("seo_og_image_id");
  CREATE INDEX "industries_updated_at_idx" ON "industries" USING btree ("updated_at");
  CREATE INDEX "industries_created_at_idx" ON "industries" USING btree ("created_at");
  CREATE INDEX "industries_rels_order_idx" ON "industries_rels" USING btree ("order");
  CREATE INDEX "industries_rels_parent_idx" ON "industries_rels" USING btree ("parent_id");
  CREATE INDEX "industries_rels_path_idx" ON "industries_rels" USING btree ("path");
  CREATE INDEX "industries_rels_citations_id_idx" ON "industries_rels" USING btree ("citations_id");
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
  CREATE INDEX "services_offer_includes_order_idx" ON "services_offer_includes" USING btree ("_order");
  CREATE INDEX "services_offer_includes_parent_id_idx" ON "services_offer_includes" USING btree ("_parent_id");
  CREATE INDEX "services_seo_schema_types_order_idx" ON "services_seo_schema_types" USING btree ("order");
  CREATE INDEX "services_seo_schema_types_parent_idx" ON "services_seo_schema_types" USING btree ("parent_id");
  CREATE UNIQUE INDEX "services_slug_idx" ON "services" USING btree ("slug");
  CREATE INDEX "services_seo_seo_og_image_idx" ON "services" USING btree ("seo_og_image_id");
  CREATE INDEX "services_verification_verification_verified_by_idx" ON "services" USING btree ("verification_verified_by_id");
  CREATE INDEX "services_updated_at_idx" ON "services" USING btree ("updated_at");
  CREATE INDEX "services_created_at_idx" ON "services" USING btree ("created_at");
  CREATE INDEX "services__status_idx" ON "services" USING btree ("_status");
  CREATE INDEX "services_rels_order_idx" ON "services_rels" USING btree ("order");
  CREATE INDEX "services_rels_parent_idx" ON "services_rels" USING btree ("parent_id");
  CREATE INDEX "services_rels_path_idx" ON "services_rels" USING btree ("path");
  CREATE INDEX "services_rels_citations_id_idx" ON "services_rels" USING btree ("citations_id");
  CREATE INDEX "_services_v_version_offer_includes_order_idx" ON "_services_v_version_offer_includes" USING btree ("_order");
  CREATE INDEX "_services_v_version_offer_includes_parent_id_idx" ON "_services_v_version_offer_includes" USING btree ("_parent_id");
  CREATE INDEX "_services_v_version_seo_schema_types_order_idx" ON "_services_v_version_seo_schema_types" USING btree ("order");
  CREATE INDEX "_services_v_version_seo_schema_types_parent_idx" ON "_services_v_version_seo_schema_types" USING btree ("parent_id");
  CREATE INDEX "_services_v_parent_idx" ON "_services_v" USING btree ("parent_id");
  CREATE INDEX "_services_v_version_version_slug_idx" ON "_services_v" USING btree ("version_slug");
  CREATE INDEX "_services_v_version_seo_version_seo_og_image_idx" ON "_services_v" USING btree ("version_seo_og_image_id");
  CREATE INDEX "_services_v_version_verification_version_verification_ve_idx" ON "_services_v" USING btree ("version_verification_verified_by_id");
  CREATE INDEX "_services_v_version_version_updated_at_idx" ON "_services_v" USING btree ("version_updated_at");
  CREATE INDEX "_services_v_version_version_created_at_idx" ON "_services_v" USING btree ("version_created_at");
  CREATE INDEX "_services_v_version_version__status_idx" ON "_services_v" USING btree ("version__status");
  CREATE INDEX "_services_v_created_at_idx" ON "_services_v" USING btree ("created_at");
  CREATE INDEX "_services_v_updated_at_idx" ON "_services_v" USING btree ("updated_at");
  CREATE INDEX "_services_v_latest_idx" ON "_services_v" USING btree ("latest");
  CREATE INDEX "_services_v_rels_order_idx" ON "_services_v_rels" USING btree ("order");
  CREATE INDEX "_services_v_rels_parent_idx" ON "_services_v_rels" USING btree ("parent_id");
  CREATE INDEX "_services_v_rels_path_idx" ON "_services_v_rels" USING btree ("path");
  CREATE INDEX "_services_v_rels_citations_id_idx" ON "_services_v_rels" USING btree ("citations_id");
  CREATE INDEX "offices_hours_days_order_idx" ON "offices_hours_days" USING btree ("order");
  CREATE INDEX "offices_hours_days_parent_idx" ON "offices_hours_days" USING btree ("parent_id");
  CREATE INDEX "offices_hours_order_idx" ON "offices_hours" USING btree ("_order");
  CREATE INDEX "offices_hours_parent_id_idx" ON "offices_hours" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "offices_slug_idx" ON "offices" USING btree ("slug");
  CREATE INDEX "offices_verification_verification_verified_by_idx" ON "offices" USING btree ("verification_verified_by_id");
  CREATE INDEX "offices_updated_at_idx" ON "offices" USING btree ("updated_at");
  CREATE INDEX "offices_created_at_idx" ON "offices" USING btree ("created_at");
  CREATE INDEX "offices__status_idx" ON "offices" USING btree ("_status");
  CREATE INDEX "_offices_v_version_hours_days_order_idx" ON "_offices_v_version_hours_days" USING btree ("order");
  CREATE INDEX "_offices_v_version_hours_days_parent_idx" ON "_offices_v_version_hours_days" USING btree ("parent_id");
  CREATE INDEX "_offices_v_version_hours_order_idx" ON "_offices_v_version_hours" USING btree ("_order");
  CREATE INDEX "_offices_v_version_hours_parent_id_idx" ON "_offices_v_version_hours" USING btree ("_parent_id");
  CREATE INDEX "_offices_v_parent_idx" ON "_offices_v" USING btree ("parent_id");
  CREATE INDEX "_offices_v_version_version_slug_idx" ON "_offices_v" USING btree ("version_slug");
  CREATE INDEX "_offices_v_version_verification_version_verification_ver_idx" ON "_offices_v" USING btree ("version_verification_verified_by_id");
  CREATE INDEX "_offices_v_version_version_updated_at_idx" ON "_offices_v" USING btree ("version_updated_at");
  CREATE INDEX "_offices_v_version_version_created_at_idx" ON "_offices_v" USING btree ("version_created_at");
  CREATE INDEX "_offices_v_version_version__status_idx" ON "_offices_v" USING btree ("version__status");
  CREATE INDEX "_offices_v_created_at_idx" ON "_offices_v" USING btree ("created_at");
  CREATE INDEX "_offices_v_updated_at_idx" ON "_offices_v" USING btree ("updated_at");
  CREATE INDEX "_offices_v_latest_idx" ON "_offices_v" USING btree ("latest");
  CREATE INDEX "case_studies_diagnostics_order_idx" ON "case_studies_diagnostics" USING btree ("_order");
  CREATE INDEX "case_studies_diagnostics_parent_id_idx" ON "case_studies_diagnostics" USING btree ("_parent_id");
  CREATE INDEX "case_studies_plays_order_idx" ON "case_studies_plays" USING btree ("_order");
  CREATE INDEX "case_studies_plays_parent_id_idx" ON "case_studies_plays" USING btree ("_parent_id");
  CREATE INDEX "case_studies_phases_order_idx" ON "case_studies_phases" USING btree ("_order");
  CREATE INDEX "case_studies_phases_parent_id_idx" ON "case_studies_phases" USING btree ("_parent_id");
  CREATE INDEX "case_studies_results_order_idx" ON "case_studies_results" USING btree ("_order");
  CREATE INDEX "case_studies_results_parent_id_idx" ON "case_studies_results" USING btree ("_parent_id");
  CREATE INDEX "case_studies_kpis_order_idx" ON "case_studies_kpis" USING btree ("_order");
  CREATE INDEX "case_studies_kpis_parent_id_idx" ON "case_studies_kpis" USING btree ("_parent_id");
  CREATE INDEX "case_studies_stack_order_idx" ON "case_studies_stack" USING btree ("_order");
  CREATE INDEX "case_studies_stack_parent_id_idx" ON "case_studies_stack" USING btree ("_parent_id");
  CREATE INDEX "case_studies_sources_order_idx" ON "case_studies_sources" USING btree ("_order");
  CREATE INDEX "case_studies_sources_parent_id_idx" ON "case_studies_sources" USING btree ("_parent_id");
  CREATE INDEX "case_studies_seo_schema_types_order_idx" ON "case_studies_seo_schema_types" USING btree ("order");
  CREATE INDEX "case_studies_seo_schema_types_parent_idx" ON "case_studies_seo_schema_types" USING btree ("parent_id");
  CREATE UNIQUE INDEX "case_studies_slug_idx" ON "case_studies" USING btree ("slug");
  CREATE INDEX "case_studies_seo_seo_og_image_idx" ON "case_studies" USING btree ("seo_og_image_id");
  CREATE INDEX "case_studies_verification_verification_verified_by_idx" ON "case_studies" USING btree ("verification_verified_by_id");
  CREATE INDEX "case_studies_updated_at_idx" ON "case_studies" USING btree ("updated_at");
  CREATE INDEX "case_studies_created_at_idx" ON "case_studies" USING btree ("created_at");
  CREATE INDEX "case_studies__status_idx" ON "case_studies" USING btree ("_status");
  CREATE INDEX "case_studies_rels_order_idx" ON "case_studies_rels" USING btree ("order");
  CREATE INDEX "case_studies_rels_parent_idx" ON "case_studies_rels" USING btree ("parent_id");
  CREATE INDEX "case_studies_rels_path_idx" ON "case_studies_rels" USING btree ("path");
  CREATE INDEX "case_studies_rels_citations_id_idx" ON "case_studies_rels" USING btree ("citations_id");
  CREATE INDEX "_case_studies_v_version_diagnostics_order_idx" ON "_case_studies_v_version_diagnostics" USING btree ("_order");
  CREATE INDEX "_case_studies_v_version_diagnostics_parent_id_idx" ON "_case_studies_v_version_diagnostics" USING btree ("_parent_id");
  CREATE INDEX "_case_studies_v_version_plays_order_idx" ON "_case_studies_v_version_plays" USING btree ("_order");
  CREATE INDEX "_case_studies_v_version_plays_parent_id_idx" ON "_case_studies_v_version_plays" USING btree ("_parent_id");
  CREATE INDEX "_case_studies_v_version_phases_order_idx" ON "_case_studies_v_version_phases" USING btree ("_order");
  CREATE INDEX "_case_studies_v_version_phases_parent_id_idx" ON "_case_studies_v_version_phases" USING btree ("_parent_id");
  CREATE INDEX "_case_studies_v_version_results_order_idx" ON "_case_studies_v_version_results" USING btree ("_order");
  CREATE INDEX "_case_studies_v_version_results_parent_id_idx" ON "_case_studies_v_version_results" USING btree ("_parent_id");
  CREATE INDEX "_case_studies_v_version_kpis_order_idx" ON "_case_studies_v_version_kpis" USING btree ("_order");
  CREATE INDEX "_case_studies_v_version_kpis_parent_id_idx" ON "_case_studies_v_version_kpis" USING btree ("_parent_id");
  CREATE INDEX "_case_studies_v_version_stack_order_idx" ON "_case_studies_v_version_stack" USING btree ("_order");
  CREATE INDEX "_case_studies_v_version_stack_parent_id_idx" ON "_case_studies_v_version_stack" USING btree ("_parent_id");
  CREATE INDEX "_case_studies_v_version_sources_order_idx" ON "_case_studies_v_version_sources" USING btree ("_order");
  CREATE INDEX "_case_studies_v_version_sources_parent_id_idx" ON "_case_studies_v_version_sources" USING btree ("_parent_id");
  CREATE INDEX "_case_studies_v_version_seo_schema_types_order_idx" ON "_case_studies_v_version_seo_schema_types" USING btree ("order");
  CREATE INDEX "_case_studies_v_version_seo_schema_types_parent_idx" ON "_case_studies_v_version_seo_schema_types" USING btree ("parent_id");
  CREATE INDEX "_case_studies_v_parent_idx" ON "_case_studies_v" USING btree ("parent_id");
  CREATE INDEX "_case_studies_v_version_version_slug_idx" ON "_case_studies_v" USING btree ("version_slug");
  CREATE INDEX "_case_studies_v_version_seo_version_seo_og_image_idx" ON "_case_studies_v" USING btree ("version_seo_og_image_id");
  CREATE INDEX "_case_studies_v_version_verification_version_verificatio_idx" ON "_case_studies_v" USING btree ("version_verification_verified_by_id");
  CREATE INDEX "_case_studies_v_version_version_updated_at_idx" ON "_case_studies_v" USING btree ("version_updated_at");
  CREATE INDEX "_case_studies_v_version_version_created_at_idx" ON "_case_studies_v" USING btree ("version_created_at");
  CREATE INDEX "_case_studies_v_version_version__status_idx" ON "_case_studies_v" USING btree ("version__status");
  CREATE INDEX "_case_studies_v_created_at_idx" ON "_case_studies_v" USING btree ("created_at");
  CREATE INDEX "_case_studies_v_updated_at_idx" ON "_case_studies_v" USING btree ("updated_at");
  CREATE INDEX "_case_studies_v_latest_idx" ON "_case_studies_v" USING btree ("latest");
  CREATE INDEX "_case_studies_v_rels_order_idx" ON "_case_studies_v_rels" USING btree ("order");
  CREATE INDEX "_case_studies_v_rels_parent_idx" ON "_case_studies_v_rels" USING btree ("parent_id");
  CREATE INDEX "_case_studies_v_rels_path_idx" ON "_case_studies_v_rels" USING btree ("path");
  CREATE INDEX "_case_studies_v_rels_citations_id_idx" ON "_case_studies_v_rels" USING btree ("citations_id");
  CREATE INDEX "ventures_details_order_idx" ON "ventures_details" USING btree ("_order");
  CREATE INDEX "ventures_details_parent_id_idx" ON "ventures_details" USING btree ("_parent_id");
  CREATE INDEX "ventures_stack_order_idx" ON "ventures_stack" USING btree ("_order");
  CREATE INDEX "ventures_stack_parent_id_idx" ON "ventures_stack" USING btree ("_parent_id");
  CREATE INDEX "ventures_seo_schema_types_order_idx" ON "ventures_seo_schema_types" USING btree ("order");
  CREATE INDEX "ventures_seo_schema_types_parent_idx" ON "ventures_seo_schema_types" USING btree ("parent_id");
  CREATE UNIQUE INDEX "ventures_slug_idx" ON "ventures" USING btree ("slug");
  CREATE INDEX "ventures_seo_seo_og_image_idx" ON "ventures" USING btree ("seo_og_image_id");
  CREATE INDEX "ventures_verification_verification_verified_by_idx" ON "ventures" USING btree ("verification_verified_by_id");
  CREATE INDEX "ventures_updated_at_idx" ON "ventures" USING btree ("updated_at");
  CREATE INDEX "ventures_created_at_idx" ON "ventures" USING btree ("created_at");
  CREATE INDEX "ventures__status_idx" ON "ventures" USING btree ("_status");
  CREATE INDEX "ventures_rels_order_idx" ON "ventures_rels" USING btree ("order");
  CREATE INDEX "ventures_rels_parent_idx" ON "ventures_rels" USING btree ("parent_id");
  CREATE INDEX "ventures_rels_path_idx" ON "ventures_rels" USING btree ("path");
  CREATE INDEX "ventures_rels_citations_id_idx" ON "ventures_rels" USING btree ("citations_id");
  CREATE INDEX "_ventures_v_version_details_order_idx" ON "_ventures_v_version_details" USING btree ("_order");
  CREATE INDEX "_ventures_v_version_details_parent_id_idx" ON "_ventures_v_version_details" USING btree ("_parent_id");
  CREATE INDEX "_ventures_v_version_stack_order_idx" ON "_ventures_v_version_stack" USING btree ("_order");
  CREATE INDEX "_ventures_v_version_stack_parent_id_idx" ON "_ventures_v_version_stack" USING btree ("_parent_id");
  CREATE INDEX "_ventures_v_version_seo_schema_types_order_idx" ON "_ventures_v_version_seo_schema_types" USING btree ("order");
  CREATE INDEX "_ventures_v_version_seo_schema_types_parent_idx" ON "_ventures_v_version_seo_schema_types" USING btree ("parent_id");
  CREATE INDEX "_ventures_v_parent_idx" ON "_ventures_v" USING btree ("parent_id");
  CREATE INDEX "_ventures_v_version_version_slug_idx" ON "_ventures_v" USING btree ("version_slug");
  CREATE INDEX "_ventures_v_version_seo_version_seo_og_image_idx" ON "_ventures_v" USING btree ("version_seo_og_image_id");
  CREATE INDEX "_ventures_v_version_verification_version_verification_ve_idx" ON "_ventures_v" USING btree ("version_verification_verified_by_id");
  CREATE INDEX "_ventures_v_version_version_updated_at_idx" ON "_ventures_v" USING btree ("version_updated_at");
  CREATE INDEX "_ventures_v_version_version_created_at_idx" ON "_ventures_v" USING btree ("version_created_at");
  CREATE INDEX "_ventures_v_version_version__status_idx" ON "_ventures_v" USING btree ("version__status");
  CREATE INDEX "_ventures_v_created_at_idx" ON "_ventures_v" USING btree ("created_at");
  CREATE INDEX "_ventures_v_updated_at_idx" ON "_ventures_v" USING btree ("updated_at");
  CREATE INDEX "_ventures_v_latest_idx" ON "_ventures_v" USING btree ("latest");
  CREATE INDEX "_ventures_v_rels_order_idx" ON "_ventures_v_rels" USING btree ("order");
  CREATE INDEX "_ventures_v_rels_parent_idx" ON "_ventures_v_rels" USING btree ("parent_id");
  CREATE INDEX "_ventures_v_rels_path_idx" ON "_ventures_v_rels" USING btree ("path");
  CREATE INDEX "_ventures_v_rels_citations_id_idx" ON "_ventures_v_rels" USING btree ("citations_id");
  CREATE INDEX "testimonials_verification_verification_verified_by_idx" ON "testimonials" USING btree ("verification_verified_by_id");
  CREATE INDEX "testimonials_updated_at_idx" ON "testimonials" USING btree ("updated_at");
  CREATE INDEX "testimonials_created_at_idx" ON "testimonials" USING btree ("created_at");
  CREATE INDEX "testimonials__status_idx" ON "testimonials" USING btree ("_status");
  CREATE INDEX "_testimonials_v_parent_idx" ON "_testimonials_v" USING btree ("parent_id");
  CREATE INDEX "_testimonials_v_version_verification_version_verificatio_idx" ON "_testimonials_v" USING btree ("version_verification_verified_by_id");
  CREATE INDEX "_testimonials_v_version_version_updated_at_idx" ON "_testimonials_v" USING btree ("version_updated_at");
  CREATE INDEX "_testimonials_v_version_version_created_at_idx" ON "_testimonials_v" USING btree ("version_created_at");
  CREATE INDEX "_testimonials_v_version_version__status_idx" ON "_testimonials_v" USING btree ("version__status");
  CREATE INDEX "_testimonials_v_created_at_idx" ON "_testimonials_v" USING btree ("created_at");
  CREATE INDEX "_testimonials_v_updated_at_idx" ON "_testimonials_v" USING btree ("updated_at");
  CREATE INDEX "_testimonials_v_latest_idx" ON "_testimonials_v" USING btree ("latest");
  CREATE INDEX "faqs_verification_verification_verified_by_idx" ON "faqs" USING btree ("verification_verified_by_id");
  CREATE INDEX "faqs_updated_at_idx" ON "faqs" USING btree ("updated_at");
  CREATE INDEX "faqs_created_at_idx" ON "faqs" USING btree ("created_at");
  CREATE INDEX "faqs__status_idx" ON "faqs" USING btree ("_status");
  CREATE INDEX "faqs_rels_order_idx" ON "faqs_rels" USING btree ("order");
  CREATE INDEX "faqs_rels_parent_idx" ON "faqs_rels" USING btree ("parent_id");
  CREATE INDEX "faqs_rels_path_idx" ON "faqs_rels" USING btree ("path");
  CREATE INDEX "faqs_rels_pages_id_idx" ON "faqs_rels" USING btree ("pages_id");
  CREATE INDEX "_faqs_v_parent_idx" ON "_faqs_v" USING btree ("parent_id");
  CREATE INDEX "_faqs_v_version_verification_version_verification_verifi_idx" ON "_faqs_v" USING btree ("version_verification_verified_by_id");
  CREATE INDEX "_faqs_v_version_version_updated_at_idx" ON "_faqs_v" USING btree ("version_updated_at");
  CREATE INDEX "_faqs_v_version_version_created_at_idx" ON "_faqs_v" USING btree ("version_created_at");
  CREATE INDEX "_faqs_v_version_version__status_idx" ON "_faqs_v" USING btree ("version__status");
  CREATE INDEX "_faqs_v_created_at_idx" ON "_faqs_v" USING btree ("created_at");
  CREATE INDEX "_faqs_v_updated_at_idx" ON "_faqs_v" USING btree ("updated_at");
  CREATE INDEX "_faqs_v_latest_idx" ON "_faqs_v" USING btree ("latest");
  CREATE INDEX "_faqs_v_rels_order_idx" ON "_faqs_v_rels" USING btree ("order");
  CREATE INDEX "_faqs_v_rels_parent_idx" ON "_faqs_v_rels" USING btree ("parent_id");
  CREATE INDEX "_faqs_v_rels_path_idx" ON "_faqs_v_rels" USING btree ("path");
  CREATE INDEX "_faqs_v_rels_pages_id_idx" ON "_faqs_v_rels" USING btree ("pages_id");
  CREATE UNIQUE INDEX "glossary_terms_slug_idx" ON "glossary_terms" USING btree ("slug");
  CREATE UNIQUE INDEX "glossary_terms_anchor_idx" ON "glossary_terms" USING btree ("anchor");
  CREATE INDEX "glossary_terms_verification_verification_verified_by_idx" ON "glossary_terms" USING btree ("verification_verified_by_id");
  CREATE INDEX "glossary_terms_updated_at_idx" ON "glossary_terms" USING btree ("updated_at");
  CREATE INDEX "glossary_terms_created_at_idx" ON "glossary_terms" USING btree ("created_at");
  CREATE INDEX "glossary_terms__status_idx" ON "glossary_terms" USING btree ("_status");
  CREATE INDEX "_glossary_terms_v_parent_idx" ON "_glossary_terms_v" USING btree ("parent_id");
  CREATE INDEX "_glossary_terms_v_version_version_slug_idx" ON "_glossary_terms_v" USING btree ("version_slug");
  CREATE INDEX "_glossary_terms_v_version_version_anchor_idx" ON "_glossary_terms_v" USING btree ("version_anchor");
  CREATE INDEX "_glossary_terms_v_version_verification_version_verificat_idx" ON "_glossary_terms_v" USING btree ("version_verification_verified_by_id");
  CREATE INDEX "_glossary_terms_v_version_version_updated_at_idx" ON "_glossary_terms_v" USING btree ("version_updated_at");
  CREATE INDEX "_glossary_terms_v_version_version_created_at_idx" ON "_glossary_terms_v" USING btree ("version_created_at");
  CREATE INDEX "_glossary_terms_v_version_version__status_idx" ON "_glossary_terms_v" USING btree ("version__status");
  CREATE INDEX "_glossary_terms_v_created_at_idx" ON "_glossary_terms_v" USING btree ("created_at");
  CREATE INDEX "_glossary_terms_v_updated_at_idx" ON "_glossary_terms_v" USING btree ("updated_at");
  CREATE INDEX "_glossary_terms_v_latest_idx" ON "_glossary_terms_v" USING btree ("latest");
  CREATE INDEX "citations_verification_verification_verified_by_idx" ON "citations" USING btree ("verification_verified_by_id");
  CREATE INDEX "citations_updated_at_idx" ON "citations" USING btree ("updated_at");
  CREATE INDEX "citations_created_at_idx" ON "citations" USING btree ("created_at");
  CREATE INDEX "evidence_stats_citation_idx" ON "evidence_stats" USING btree ("citation_id");
  CREATE INDEX "evidence_stats_verification_verification_verified_by_idx" ON "evidence_stats" USING btree ("verification_verified_by_id");
  CREATE INDEX "evidence_stats_updated_at_idx" ON "evidence_stats" USING btree ("updated_at");
  CREATE INDEX "evidence_stats_created_at_idx" ON "evidence_stats" USING btree ("created_at");
  CREATE INDEX "evidence_stats__status_idx" ON "evidence_stats" USING btree ("_status");
  CREATE INDEX "_evidence_stats_v_parent_idx" ON "_evidence_stats_v" USING btree ("parent_id");
  CREATE INDEX "_evidence_stats_v_version_version_citation_idx" ON "_evidence_stats_v" USING btree ("version_citation_id");
  CREATE INDEX "_evidence_stats_v_version_verification_version_verificat_idx" ON "_evidence_stats_v" USING btree ("version_verification_verified_by_id");
  CREATE INDEX "_evidence_stats_v_version_version_updated_at_idx" ON "_evidence_stats_v" USING btree ("version_updated_at");
  CREATE INDEX "_evidence_stats_v_version_version_created_at_idx" ON "_evidence_stats_v" USING btree ("version_created_at");
  CREATE INDEX "_evidence_stats_v_version_version__status_idx" ON "_evidence_stats_v" USING btree ("version__status");
  CREATE INDEX "_evidence_stats_v_created_at_idx" ON "_evidence_stats_v" USING btree ("created_at");
  CREATE INDEX "_evidence_stats_v_updated_at_idx" ON "_evidence_stats_v" USING btree ("updated_at");
  CREATE INDEX "_evidence_stats_v_latest_idx" ON "_evidence_stats_v" USING btree ("latest");
  CREATE INDEX "ctas_image_idx" ON "ctas" USING btree ("image_id");
  CREATE INDEX "ctas_updated_at_idx" ON "ctas" USING btree ("updated_at");
  CREATE INDEX "ctas_created_at_idx" ON "ctas" USING btree ("created_at");
  CREATE INDEX "ctas__status_idx" ON "ctas" USING btree ("_status");
  CREATE INDEX "_ctas_v_parent_idx" ON "_ctas_v" USING btree ("parent_id");
  CREATE INDEX "_ctas_v_version_version_image_idx" ON "_ctas_v" USING btree ("version_image_id");
  CREATE INDEX "_ctas_v_version_version_updated_at_idx" ON "_ctas_v" USING btree ("version_updated_at");
  CREATE INDEX "_ctas_v_version_version_created_at_idx" ON "_ctas_v" USING btree ("version_created_at");
  CREATE INDEX "_ctas_v_version_version__status_idx" ON "_ctas_v" USING btree ("version__status");
  CREATE INDEX "_ctas_v_created_at_idx" ON "_ctas_v" USING btree ("created_at");
  CREATE INDEX "_ctas_v_updated_at_idx" ON "_ctas_v" USING btree ("updated_at");
  CREATE INDEX "_ctas_v_latest_idx" ON "_ctas_v" USING btree ("latest");
  CREATE INDEX "simulator_prompts_before_sources_order_idx" ON "simulator_prompts_before_sources" USING btree ("_order");
  CREATE INDEX "simulator_prompts_before_sources_parent_id_idx" ON "simulator_prompts_before_sources" USING btree ("_parent_id");
  CREATE INDEX "simulator_prompts_after_sources_order_idx" ON "simulator_prompts_after_sources" USING btree ("_order");
  CREATE INDEX "simulator_prompts_after_sources_parent_id_idx" ON "simulator_prompts_after_sources" USING btree ("_parent_id");
  CREATE INDEX "simulator_prompts_updated_at_idx" ON "simulator_prompts" USING btree ("updated_at");
  CREATE INDEX "simulator_prompts_created_at_idx" ON "simulator_prompts" USING btree ("created_at");
  CREATE INDEX "simulator_prompts__status_idx" ON "simulator_prompts" USING btree ("_status");
  CREATE INDEX "_simulator_prompts_v_version_before_sources_order_idx" ON "_simulator_prompts_v_version_before_sources" USING btree ("_order");
  CREATE INDEX "_simulator_prompts_v_version_before_sources_parent_id_idx" ON "_simulator_prompts_v_version_before_sources" USING btree ("_parent_id");
  CREATE INDEX "_simulator_prompts_v_version_after_sources_order_idx" ON "_simulator_prompts_v_version_after_sources" USING btree ("_order");
  CREATE INDEX "_simulator_prompts_v_version_after_sources_parent_id_idx" ON "_simulator_prompts_v_version_after_sources" USING btree ("_parent_id");
  CREATE INDEX "_simulator_prompts_v_parent_idx" ON "_simulator_prompts_v" USING btree ("parent_id");
  CREATE INDEX "_simulator_prompts_v_version_version_updated_at_idx" ON "_simulator_prompts_v" USING btree ("version_updated_at");
  CREATE INDEX "_simulator_prompts_v_version_version_created_at_idx" ON "_simulator_prompts_v" USING btree ("version_created_at");
  CREATE INDEX "_simulator_prompts_v_version_version__status_idx" ON "_simulator_prompts_v" USING btree ("version__status");
  CREATE INDEX "_simulator_prompts_v_created_at_idx" ON "_simulator_prompts_v" USING btree ("created_at");
  CREATE INDEX "_simulator_prompts_v_updated_at_idx" ON "_simulator_prompts_v" USING btree ("updated_at");
  CREATE INDEX "_simulator_prompts_v_latest_idx" ON "_simulator_prompts_v" USING btree ("latest");
  CREATE INDEX "scorecard_questions_options_order_idx" ON "scorecard_questions_options" USING btree ("_order");
  CREATE INDEX "scorecard_questions_options_parent_id_idx" ON "scorecard_questions_options" USING btree ("_parent_id");
  CREATE INDEX "scorecard_questions_updated_at_idx" ON "scorecard_questions" USING btree ("updated_at");
  CREATE INDEX "scorecard_questions_created_at_idx" ON "scorecard_questions" USING btree ("created_at");
  CREATE INDEX "scorecard_questions__status_idx" ON "scorecard_questions" USING btree ("_status");
  CREATE INDEX "_scorecard_questions_v_version_options_order_idx" ON "_scorecard_questions_v_version_options" USING btree ("_order");
  CREATE INDEX "_scorecard_questions_v_version_options_parent_id_idx" ON "_scorecard_questions_v_version_options" USING btree ("_parent_id");
  CREATE INDEX "_scorecard_questions_v_parent_idx" ON "_scorecard_questions_v" USING btree ("parent_id");
  CREATE INDEX "_scorecard_questions_v_version_version_updated_at_idx" ON "_scorecard_questions_v" USING btree ("version_updated_at");
  CREATE INDEX "_scorecard_questions_v_version_version_created_at_idx" ON "_scorecard_questions_v" USING btree ("version_created_at");
  CREATE INDEX "_scorecard_questions_v_version_version__status_idx" ON "_scorecard_questions_v" USING btree ("version__status");
  CREATE INDEX "_scorecard_questions_v_created_at_idx" ON "_scorecard_questions_v" USING btree ("created_at");
  CREATE INDEX "_scorecard_questions_v_updated_at_idx" ON "_scorecard_questions_v" USING btree ("updated_at");
  CREATE INDEX "_scorecard_questions_v_latest_idx" ON "_scorecard_questions_v" USING btree ("latest");
  CREATE INDEX "scorecard_bands_updated_at_idx" ON "scorecard_bands" USING btree ("updated_at");
  CREATE INDEX "scorecard_bands_created_at_idx" ON "scorecard_bands" USING btree ("created_at");
  CREATE INDEX "scorecard_bands__status_idx" ON "scorecard_bands" USING btree ("_status");
  CREATE INDEX "_scorecard_bands_v_parent_idx" ON "_scorecard_bands_v" USING btree ("parent_id");
  CREATE INDEX "_scorecard_bands_v_version_version_updated_at_idx" ON "_scorecard_bands_v" USING btree ("version_updated_at");
  CREATE INDEX "_scorecard_bands_v_version_version_created_at_idx" ON "_scorecard_bands_v" USING btree ("version_created_at");
  CREATE INDEX "_scorecard_bands_v_version_version__status_idx" ON "_scorecard_bands_v" USING btree ("version__status");
  CREATE INDEX "_scorecard_bands_v_created_at_idx" ON "_scorecard_bands_v" USING btree ("created_at");
  CREATE INDEX "_scorecard_bands_v_updated_at_idx" ON "_scorecard_bands_v" USING btree ("updated_at");
  CREATE INDEX "_scorecard_bands_v_latest_idx" ON "_scorecard_bands_v" USING btree ("latest");
  CREATE UNIQUE INDEX "revenue_model_programs_key_idx" ON "revenue_model_programs" USING btree ("key");
  CREATE INDEX "revenue_model_programs_verification_verification_verifie_idx" ON "revenue_model_programs" USING btree ("verification_verified_by_id");
  CREATE INDEX "revenue_model_programs_updated_at_idx" ON "revenue_model_programs" USING btree ("updated_at");
  CREATE INDEX "revenue_model_programs_created_at_idx" ON "revenue_model_programs" USING btree ("created_at");
  CREATE INDEX "revenue_model_programs__status_idx" ON "revenue_model_programs" USING btree ("_status");
  CREATE INDEX "_revenue_model_programs_v_parent_idx" ON "_revenue_model_programs_v" USING btree ("parent_id");
  CREATE INDEX "_revenue_model_programs_v_version_version_key_idx" ON "_revenue_model_programs_v" USING btree ("version_key");
  CREATE INDEX "_revenue_model_programs_v_version_verification_version_v_idx" ON "_revenue_model_programs_v" USING btree ("version_verification_verified_by_id");
  CREATE INDEX "_revenue_model_programs_v_version_version_updated_at_idx" ON "_revenue_model_programs_v" USING btree ("version_updated_at");
  CREATE INDEX "_revenue_model_programs_v_version_version_created_at_idx" ON "_revenue_model_programs_v" USING btree ("version_created_at");
  CREATE INDEX "_revenue_model_programs_v_version_version__status_idx" ON "_revenue_model_programs_v" USING btree ("version__status");
  CREATE INDEX "_revenue_model_programs_v_created_at_idx" ON "_revenue_model_programs_v" USING btree ("created_at");
  CREATE INDEX "_revenue_model_programs_v_updated_at_idx" ON "_revenue_model_programs_v" USING btree ("updated_at");
  CREATE INDEX "_revenue_model_programs_v_latest_idx" ON "_revenue_model_programs_v" USING btree ("latest");
  CREATE INDEX "notices_updated_at_idx" ON "notices" USING btree ("updated_at");
  CREATE INDEX "notices_created_at_idx" ON "notices" USING btree ("created_at");
  CREATE INDEX "notices__status_idx" ON "notices" USING btree ("_status");
  CREATE INDEX "_notices_v_parent_idx" ON "_notices_v" USING btree ("parent_id");
  CREATE INDEX "_notices_v_version_version_updated_at_idx" ON "_notices_v" USING btree ("version_updated_at");
  CREATE INDEX "_notices_v_version_version_created_at_idx" ON "_notices_v" USING btree ("version_created_at");
  CREATE INDEX "_notices_v_version_version__status_idx" ON "_notices_v" USING btree ("version__status");
  CREATE INDEX "_notices_v_created_at_idx" ON "_notices_v" USING btree ("created_at");
  CREATE INDEX "_notices_v_updated_at_idx" ON "_notices_v" USING btree ("updated_at");
  CREATE INDEX "_notices_v_latest_idx" ON "_notices_v" USING btree ("latest");
  CREATE UNIQUE INDEX "schema_entities_schema_id_idx" ON "schema_entities" USING btree ("schema_id");
  CREATE INDEX "schema_entities_verification_verification_verified_by_idx" ON "schema_entities" USING btree ("verification_verified_by_id");
  CREATE INDEX "schema_entities_updated_at_idx" ON "schema_entities" USING btree ("updated_at");
  CREATE INDEX "schema_entities_created_at_idx" ON "schema_entities" USING btree ("created_at");
  CREATE INDEX "seo_templates_applies_to_order_idx" ON "seo_templates_applies_to" USING btree ("order");
  CREATE INDEX "seo_templates_applies_to_parent_idx" ON "seo_templates_applies_to" USING btree ("parent_id");
  CREATE INDEX "seo_templates_updated_at_idx" ON "seo_templates" USING btree ("updated_at");
  CREATE INDEX "seo_templates_created_at_idx" ON "seo_templates" USING btree ("created_at");
  CREATE UNIQUE INDEX "redirects_from_idx" ON "redirects" USING btree ("from");
  CREATE INDEX "redirects_updated_at_idx" ON "redirects" USING btree ("updated_at");
  CREATE INDEX "redirects_created_at_idx" ON "redirects" USING btree ("created_at");
  CREATE INDEX "forms_fields_options_order_idx" ON "forms_fields_options" USING btree ("_order");
  CREATE INDEX "forms_fields_options_parent_id_idx" ON "forms_fields_options" USING btree ("_parent_id");
  CREATE INDEX "forms_fields_order_idx" ON "forms_fields" USING btree ("_order");
  CREATE INDEX "forms_fields_parent_id_idx" ON "forms_fields" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "forms_key_idx" ON "forms" USING btree ("key");
  CREATE INDEX "forms_updated_at_idx" ON "forms" USING btree ("updated_at");
  CREATE INDEX "forms_created_at_idx" ON "forms" USING btree ("created_at");
  CREATE INDEX "submissions_form_idx" ON "submissions" USING btree ("form_id");
  CREATE INDEX "submissions_email_idx" ON "submissions" USING btree ("email");
  CREATE INDEX "submissions_fingerprint_idx" ON "submissions" USING btree ("fingerprint");
  CREATE INDEX "submissions_contact_idx" ON "submissions" USING btree ("contact_id");
  CREATE INDEX "submissions_lead_idx" ON "submissions" USING btree ("lead_id");
  CREATE INDEX "submissions_updated_at_idx" ON "submissions" USING btree ("updated_at");
  CREATE INDEX "submissions_created_at_idx" ON "submissions" USING btree ("created_at");
  CREATE INDEX "subscribers_tags_order_idx" ON "subscribers_tags" USING btree ("_order");
  CREATE INDEX "subscribers_tags_parent_id_idx" ON "subscribers_tags" USING btree ("_parent_id");
  CREATE INDEX "subscribers_history_order_idx" ON "subscribers_history" USING btree ("_order");
  CREATE INDEX "subscribers_history_parent_id_idx" ON "subscribers_history" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "subscribers_external_id_idx" ON "subscribers" USING btree ("external_id");
  CREATE UNIQUE INDEX "subscribers_email_idx" ON "subscribers" USING btree ("email");
  CREATE INDEX "subscribers_dedupe_key_idx" ON "subscribers" USING btree ("dedupe_key");
  CREATE INDEX "subscribers_status_idx" ON "subscribers" USING btree ("status");
  CREATE INDEX "subscribers_updated_at_idx" ON "subscribers" USING btree ("updated_at");
  CREATE INDEX "subscribers_created_at_idx" ON "subscribers" USING btree ("created_at");
  CREATE INDEX "companies_domain_idx" ON "companies" USING btree ("domain");
  CREATE INDEX "companies_industry_idx" ON "companies" USING btree ("industry_id");
  CREATE INDEX "companies_location_idx" ON "companies" USING btree ("location_id");
  CREATE INDEX "companies_updated_at_idx" ON "companies" USING btree ("updated_at");
  CREATE INDEX "companies_created_at_idx" ON "companies" USING btree ("created_at");
  CREATE UNIQUE INDEX "contacts_email_idx" ON "contacts" USING btree ("email");
  CREATE INDEX "contacts_email_normalized_idx" ON "contacts" USING btree ("email_normalized");
  CREATE INDEX "contacts_company_idx" ON "contacts" USING btree ("company_id");
  CREATE INDEX "contacts_updated_at_idx" ON "contacts" USING btree ("updated_at");
  CREATE INDEX "contacts_created_at_idx" ON "contacts" USING btree ("created_at");
  CREATE INDEX "leads_contact_idx" ON "leads" USING btree ("contact_id");
  CREATE INDEX "leads_company_idx" ON "leads" USING btree ("company_id");
  CREATE INDEX "leads_owner_idx" ON "leads" USING btree ("owner_id");
  CREATE INDEX "leads_ai_insight_ai_insight_reviewed_by_idx" ON "leads" USING btree ("ai_insight_reviewed_by_id");
  CREATE INDEX "leads_updated_at_idx" ON "leads" USING btree ("updated_at");
  CREATE INDEX "leads_created_at_idx" ON "leads" USING btree ("created_at");
  CREATE INDEX "activities_contact_idx" ON "activities" USING btree ("contact_id");
  CREATE INDEX "activities_lead_idx" ON "activities" USING btree ("lead_id");
  CREATE INDEX "activities_submission_idx" ON "activities" USING btree ("submission_id");
  CREATE INDEX "activities_actor_idx" ON "activities" USING btree ("actor_id");
  CREATE INDEX "activities_updated_at_idx" ON "activities" USING btree ("updated_at");
  CREATE INDEX "activities_created_at_idx" ON "activities" USING btree ("created_at");
  CREATE INDEX "tasks_lead_idx" ON "tasks" USING btree ("lead_id");
  CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_id");
  CREATE INDEX "tasks_updated_at_idx" ON "tasks" USING btree ("updated_at");
  CREATE INDEX "tasks_created_at_idx" ON "tasks" USING btree ("created_at");
  CREATE INDEX "lead_score_rules_verification_verification_verified_by_idx" ON "lead_score_rules" USING btree ("verification_verified_by_id");
  CREATE INDEX "lead_score_rules_updated_at_idx" ON "lead_score_rules" USING btree ("updated_at");
  CREATE INDEX "lead_score_rules_created_at_idx" ON "lead_score_rules" USING btree ("created_at");
  CREATE UNIQUE INDEX "outbox_idempotency_key_idx" ON "outbox" USING btree ("idempotency_key");
  CREATE INDEX "outbox_lead_idx" ON "outbox" USING btree ("lead_id");
  CREATE INDEX "outbox_updated_at_idx" ON "outbox" USING btree ("updated_at");
  CREATE INDEX "outbox_created_at_idx" ON "outbox" USING btree ("created_at");
  CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");
  CREATE INDEX "audit_log_collection_idx" ON "audit_log" USING btree ("collection");
  CREATE INDEX "audit_log_doc_id_idx" ON "audit_log" USING btree ("doc_id");
  CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor");
  CREATE INDEX "audit_log_updated_at_idx" ON "audit_log" USING btree ("updated_at");
  CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");
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
  CREATE INDEX "payload_locked_documents_rels_private_files_id_idx" ON "payload_locked_documents_rels" USING btree ("private_files_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("posts_id");
  CREATE INDEX "payload_locked_documents_rels_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("categories_id");
  CREATE INDEX "payload_locked_documents_rels_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("tags_id");
  CREATE INDEX "payload_locked_documents_rels_topics_id_idx" ON "payload_locked_documents_rels" USING btree ("topics_id");
  CREATE INDEX "payload_locked_documents_rels_industries_id_idx" ON "payload_locked_documents_rels" USING btree ("industries_id");
  CREATE INDEX "payload_locked_documents_rels_locations_id_idx" ON "payload_locked_documents_rels" USING btree ("locations_id");
  CREATE INDEX "payload_locked_documents_rels_people_id_idx" ON "payload_locked_documents_rels" USING btree ("people_id");
  CREATE INDEX "payload_locked_documents_rels_services_id_idx" ON "payload_locked_documents_rels" USING btree ("services_id");
  CREATE INDEX "payload_locked_documents_rels_offices_id_idx" ON "payload_locked_documents_rels" USING btree ("offices_id");
  CREATE INDEX "payload_locked_documents_rels_case_studies_id_idx" ON "payload_locked_documents_rels" USING btree ("case_studies_id");
  CREATE INDEX "payload_locked_documents_rels_ventures_id_idx" ON "payload_locked_documents_rels" USING btree ("ventures_id");
  CREATE INDEX "payload_locked_documents_rels_testimonials_id_idx" ON "payload_locked_documents_rels" USING btree ("testimonials_id");
  CREATE INDEX "payload_locked_documents_rels_faqs_id_idx" ON "payload_locked_documents_rels" USING btree ("faqs_id");
  CREATE INDEX "payload_locked_documents_rels_glossary_terms_id_idx" ON "payload_locked_documents_rels" USING btree ("glossary_terms_id");
  CREATE INDEX "payload_locked_documents_rels_citations_id_idx" ON "payload_locked_documents_rels" USING btree ("citations_id");
  CREATE INDEX "payload_locked_documents_rels_evidence_stats_id_idx" ON "payload_locked_documents_rels" USING btree ("evidence_stats_id");
  CREATE INDEX "payload_locked_documents_rels_ctas_id_idx" ON "payload_locked_documents_rels" USING btree ("ctas_id");
  CREATE INDEX "payload_locked_documents_rels_simulator_prompts_id_idx" ON "payload_locked_documents_rels" USING btree ("simulator_prompts_id");
  CREATE INDEX "payload_locked_documents_rels_scorecard_questions_id_idx" ON "payload_locked_documents_rels" USING btree ("scorecard_questions_id");
  CREATE INDEX "payload_locked_documents_rels_scorecard_bands_id_idx" ON "payload_locked_documents_rels" USING btree ("scorecard_bands_id");
  CREATE INDEX "payload_locked_documents_rels_revenue_model_programs_id_idx" ON "payload_locked_documents_rels" USING btree ("revenue_model_programs_id");
  CREATE INDEX "payload_locked_documents_rels_notices_id_idx" ON "payload_locked_documents_rels" USING btree ("notices_id");
  CREATE INDEX "payload_locked_documents_rels_schema_entities_id_idx" ON "payload_locked_documents_rels" USING btree ("schema_entities_id");
  CREATE INDEX "payload_locked_documents_rels_seo_templates_id_idx" ON "payload_locked_documents_rels" USING btree ("seo_templates_id");
  CREATE INDEX "payload_locked_documents_rels_redirects_id_idx" ON "payload_locked_documents_rels" USING btree ("redirects_id");
  CREATE INDEX "payload_locked_documents_rels_forms_id_idx" ON "payload_locked_documents_rels" USING btree ("forms_id");
  CREATE INDEX "payload_locked_documents_rels_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("submissions_id");
  CREATE INDEX "payload_locked_documents_rels_subscribers_id_idx" ON "payload_locked_documents_rels" USING btree ("subscribers_id");
  CREATE INDEX "payload_locked_documents_rels_companies_id_idx" ON "payload_locked_documents_rels" USING btree ("companies_id");
  CREATE INDEX "payload_locked_documents_rels_contacts_id_idx" ON "payload_locked_documents_rels" USING btree ("contacts_id");
  CREATE INDEX "payload_locked_documents_rels_leads_id_idx" ON "payload_locked_documents_rels" USING btree ("leads_id");
  CREATE INDEX "payload_locked_documents_rels_activities_id_idx" ON "payload_locked_documents_rels" USING btree ("activities_id");
  CREATE INDEX "payload_locked_documents_rels_tasks_id_idx" ON "payload_locked_documents_rels" USING btree ("tasks_id");
  CREATE INDEX "payload_locked_documents_rels_lead_score_rules_id_idx" ON "payload_locked_documents_rels" USING btree ("lead_score_rules_id");
  CREATE INDEX "payload_locked_documents_rels_outbox_id_idx" ON "payload_locked_documents_rels" USING btree ("outbox_id");
  CREATE INDEX "payload_locked_documents_rels_audit_log_id_idx" ON "payload_locked_documents_rels" USING btree ("audit_log_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");
  CREATE INDEX "site_settings_stats_order_idx" ON "site_settings_stats" USING btree ("_order");
  CREATE INDEX "site_settings_stats_parent_id_idx" ON "site_settings_stats" USING btree ("_parent_id");
  CREATE INDEX "site_settings_stats_verification_verification_verified_b_idx" ON "site_settings_stats" USING btree ("verification_verified_by_id");
  CREATE INDEX "site_settings_hero_status_verification_hero_status_verif_idx" ON "site_settings" USING btree ("hero_status_verification_verified_by_id");
  CREATE INDEX "brand_settings_logo_idx" ON "brand_settings" USING btree ("logo_id");
  CREATE INDEX "brand_settings_monogram_idx" ON "brand_settings" USING btree ("monogram_id");
  CREATE INDEX "brand_settings_og_default_idx" ON "brand_settings" USING btree ("og_default_id");
  CREATE INDEX "header_primary_order_idx" ON "header_primary" USING btree ("_order");
  CREATE INDEX "header_primary_parent_id_idx" ON "header_primary" USING btree ("_parent_id");
  CREATE INDEX "header_utility_order_idx" ON "header_utility" USING btree ("_order");
  CREATE INDEX "header_utility_parent_id_idx" ON "header_utility" USING btree ("_parent_id");
  CREATE INDEX "header_palette_order_idx" ON "header_palette" USING btree ("_order");
  CREATE INDEX "header_palette_parent_id_idx" ON "header_palette" USING btree ("_parent_id");
  CREATE INDEX "footer_columns_links_order_idx" ON "footer_columns_links" USING btree ("_order");
  CREATE INDEX "footer_columns_links_parent_id_idx" ON "footer_columns_links" USING btree ("_parent_id");
  CREATE INDEX "footer_columns_order_idx" ON "footer_columns" USING btree ("_order");
  CREATE INDEX "footer_columns_parent_id_idx" ON "footer_columns" USING btree ("_parent_id");
  CREATE INDEX "footer_legal_order_idx" ON "footer_legal" USING btree ("_order");
  CREATE INDEX "footer_legal_parent_id_idx" ON "footer_legal" USING btree ("_parent_id");
  CREATE INDEX "contact_legal_social_profiles_order_idx" ON "contact_legal_social_profiles" USING btree ("_order");
  CREATE INDEX "contact_legal_social_profiles_parent_id_idx" ON "contact_legal_social_profiles" USING btree ("_parent_id");
  CREATE INDEX "contact_legal_privacy_page_idx" ON "contact_legal" USING btree ("privacy_page_id");
  CREATE INDEX "contact_legal_terms_page_idx" ON "contact_legal" USING btree ("terms_page_id");
  CREATE INDEX "contact_legal_accessibility_statement_page_idx" ON "contact_legal" USING btree ("accessibility_statement_page_id");
  CREATE INDEX "contact_legal_verification_verification_verified_by_idx" ON "contact_legal" USING btree ("verification_verified_by_id");
  CREATE INDEX "contact_legal_rels_order_idx" ON "contact_legal_rels" USING btree ("order");
  CREATE INDEX "contact_legal_rels_parent_idx" ON "contact_legal_rels" USING btree ("parent_id");
  CREATE INDEX "contact_legal_rels_path_idx" ON "contact_legal_rels" USING btree ("path");
  CREATE INDEX "contact_legal_rels_offices_id_idx" ON "contact_legal_rels" USING btree ("offices_id");
  CREATE INDEX "seo_defaults_default_og_image_idx" ON "seo_defaults" USING btree ("default_og_image_id");
  CREATE INDEX "seo_defaults_organization_entity_idx" ON "seo_defaults" USING btree ("organization_entity_id");
  CREATE INDEX "seo_defaults_website_entity_idx" ON "seo_defaults" USING btree ("website_entity_id");
  CREATE INDEX "seo_defaults_person_entity_idx" ON "seo_defaults" USING btree ("person_entity_id");
  CREATE INDEX "integrations_ai_features_order_idx" ON "integrations_ai_features" USING btree ("order");
  CREATE INDEX "integrations_ai_features_parent_idx" ON "integrations_ai_features" USING btree ("parent_id");
  CREATE INDEX "chat_config_greetings_order_idx" ON "chat_config_greetings" USING btree ("_order");
  CREATE INDEX "chat_config_greetings_parent_id_idx" ON "chat_config_greetings" USING btree ("_parent_id");
  CREATE INDEX "chat_config_brief_steps_chips_order_idx" ON "chat_config_brief_steps_chips" USING btree ("_order");
  CREATE INDEX "chat_config_brief_steps_chips_parent_id_idx" ON "chat_config_brief_steps_chips" USING btree ("_parent_id");
  CREATE INDEX "chat_config_brief_steps_order_idx" ON "chat_config_brief_steps" USING btree ("_order");
  CREATE INDEX "chat_config_brief_steps_parent_id_idx" ON "chat_config_brief_steps" USING btree ("_parent_id");
  CREATE INDEX "chat_config_roadmap_steps_chips_order_idx" ON "chat_config_roadmap_steps_chips" USING btree ("_order");
  CREATE INDEX "chat_config_roadmap_steps_chips_parent_id_idx" ON "chat_config_roadmap_steps_chips" USING btree ("_parent_id");
  CREATE INDEX "chat_config_roadmap_steps_order_idx" ON "chat_config_roadmap_steps" USING btree ("_order");
  CREATE INDEX "chat_config_roadmap_steps_parent_id_idx" ON "chat_config_roadmap_steps" USING btree ("_parent_id");
  CREATE INDEX "roadmap_config_ai_agents_order_idx" ON "roadmap_config_ai_agents" USING btree ("_order");
  CREATE INDEX "roadmap_config_ai_agents_parent_id_idx" ON "roadmap_config_ai_agents" USING btree ("_parent_id");
  CREATE INDEX "roadmap_config_findings_order_idx" ON "roadmap_config_findings" USING btree ("_order");
  CREATE INDEX "roadmap_config_findings_parent_id_idx" ON "roadmap_config_findings" USING btree ("_parent_id");
  CREATE INDEX "roadmap_config_plan_phases_order_idx" ON "roadmap_config_plan_phases" USING btree ("_order");
  CREATE INDEX "roadmap_config_plan_phases_parent_id_idx" ON "roadmap_config_plan_phases" USING btree ("_parent_id");
  CREATE INDEX "spam_config_phrases_order_idx" ON "spam_config_phrases" USING btree ("_order");
  CREATE INDEX "spam_config_phrases_parent_id_idx" ON "spam_config_phrases" USING btree ("_parent_id");
  CREATE INDEX "spam_config_throwaway_domains_order_idx" ON "spam_config_throwaway_domains" USING btree ("_order");
  CREATE INDEX "spam_config_throwaway_domains_parent_id_idx" ON "spam_config_throwaway_domains" USING btree ("_parent_id");
  CREATE INDEX "spam_config_disposable_domains_order_idx" ON "spam_config_disposable_domains" USING btree ("_order");
  CREATE INDEX "spam_config_disposable_domains_parent_id_idx" ON "spam_config_disposable_domains" USING btree ("_parent_id");
  CREATE INDEX "spam_config_known_good_domains_order_idx" ON "spam_config_known_good_domains" USING btree ("_order");
  CREATE INDEX "spam_config_known_good_domains_parent_id_idx" ON "spam_config_known_good_domains" USING btree ("_parent_id");
  CREATE INDEX "spam_config_role_local_parts_order_idx" ON "spam_config_role_local_parts" USING btree ("_order");
  CREATE INDEX "spam_config_role_local_parts_parent_id_idx" ON "spam_config_role_local_parts" USING btree ("_parent_id");
  CREATE INDEX "form_config_selects_options_order_idx" ON "form_config_selects_options" USING btree ("_order");
  CREATE INDEX "form_config_selects_options_parent_id_idx" ON "form_config_selects_options" USING btree ("_parent_id");
  CREATE INDEX "form_config_selects_order_idx" ON "form_config_selects" USING btree ("_order");
  CREATE INDEX "form_config_selects_parent_id_idx" ON "form_config_selects" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_roles" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "private_files" CASCADE;
  DROP TABLE "pages_blocks_rich_text" CASCADE;
  DROP TABLE "pages_seo_schema_types" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "pages_rels" CASCADE;
  DROP TABLE "_pages_v_blocks_rich_text" CASCADE;
  DROP TABLE "_pages_v_version_seo_schema_types" CASCADE;
  DROP TABLE "_pages_v" CASCADE;
  DROP TABLE "_pages_v_rels" CASCADE;
  DROP TABLE "posts_update_history" CASCADE;
  DROP TABLE "posts_seo_schema_types" CASCADE;
  DROP TABLE "posts" CASCADE;
  DROP TABLE "posts_rels" CASCADE;
  DROP TABLE "_posts_v_version_update_history" CASCADE;
  DROP TABLE "_posts_v_version_seo_schema_types" CASCADE;
  DROP TABLE "_posts_v" CASCADE;
  DROP TABLE "_posts_v_rels" CASCADE;
  DROP TABLE "categories_seo_schema_types" CASCADE;
  DROP TABLE "categories" CASCADE;
  DROP TABLE "categories_rels" CASCADE;
  DROP TABLE "tags_seo_schema_types" CASCADE;
  DROP TABLE "tags" CASCADE;
  DROP TABLE "tags_rels" CASCADE;
  DROP TABLE "topics_seo_schema_types" CASCADE;
  DROP TABLE "topics" CASCADE;
  DROP TABLE "topics_rels" CASCADE;
  DROP TABLE "industries_seo_schema_types" CASCADE;
  DROP TABLE "industries" CASCADE;
  DROP TABLE "industries_rels" CASCADE;
  DROP TABLE "locations_seo_schema_types" CASCADE;
  DROP TABLE "locations" CASCADE;
  DROP TABLE "locations_rels" CASCADE;
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
  DROP TABLE "services_offer_includes" CASCADE;
  DROP TABLE "services_seo_schema_types" CASCADE;
  DROP TABLE "services" CASCADE;
  DROP TABLE "services_rels" CASCADE;
  DROP TABLE "_services_v_version_offer_includes" CASCADE;
  DROP TABLE "_services_v_version_seo_schema_types" CASCADE;
  DROP TABLE "_services_v" CASCADE;
  DROP TABLE "_services_v_rels" CASCADE;
  DROP TABLE "offices_hours_days" CASCADE;
  DROP TABLE "offices_hours" CASCADE;
  DROP TABLE "offices" CASCADE;
  DROP TABLE "_offices_v_version_hours_days" CASCADE;
  DROP TABLE "_offices_v_version_hours" CASCADE;
  DROP TABLE "_offices_v" CASCADE;
  DROP TABLE "case_studies_diagnostics" CASCADE;
  DROP TABLE "case_studies_plays" CASCADE;
  DROP TABLE "case_studies_phases" CASCADE;
  DROP TABLE "case_studies_results" CASCADE;
  DROP TABLE "case_studies_kpis" CASCADE;
  DROP TABLE "case_studies_stack" CASCADE;
  DROP TABLE "case_studies_sources" CASCADE;
  DROP TABLE "case_studies_seo_schema_types" CASCADE;
  DROP TABLE "case_studies" CASCADE;
  DROP TABLE "case_studies_rels" CASCADE;
  DROP TABLE "_case_studies_v_version_diagnostics" CASCADE;
  DROP TABLE "_case_studies_v_version_plays" CASCADE;
  DROP TABLE "_case_studies_v_version_phases" CASCADE;
  DROP TABLE "_case_studies_v_version_results" CASCADE;
  DROP TABLE "_case_studies_v_version_kpis" CASCADE;
  DROP TABLE "_case_studies_v_version_stack" CASCADE;
  DROP TABLE "_case_studies_v_version_sources" CASCADE;
  DROP TABLE "_case_studies_v_version_seo_schema_types" CASCADE;
  DROP TABLE "_case_studies_v" CASCADE;
  DROP TABLE "_case_studies_v_rels" CASCADE;
  DROP TABLE "ventures_details" CASCADE;
  DROP TABLE "ventures_stack" CASCADE;
  DROP TABLE "ventures_seo_schema_types" CASCADE;
  DROP TABLE "ventures" CASCADE;
  DROP TABLE "ventures_rels" CASCADE;
  DROP TABLE "_ventures_v_version_details" CASCADE;
  DROP TABLE "_ventures_v_version_stack" CASCADE;
  DROP TABLE "_ventures_v_version_seo_schema_types" CASCADE;
  DROP TABLE "_ventures_v" CASCADE;
  DROP TABLE "_ventures_v_rels" CASCADE;
  DROP TABLE "testimonials" CASCADE;
  DROP TABLE "_testimonials_v" CASCADE;
  DROP TABLE "faqs" CASCADE;
  DROP TABLE "faqs_rels" CASCADE;
  DROP TABLE "_faqs_v" CASCADE;
  DROP TABLE "_faqs_v_rels" CASCADE;
  DROP TABLE "glossary_terms" CASCADE;
  DROP TABLE "_glossary_terms_v" CASCADE;
  DROP TABLE "citations" CASCADE;
  DROP TABLE "evidence_stats" CASCADE;
  DROP TABLE "_evidence_stats_v" CASCADE;
  DROP TABLE "ctas" CASCADE;
  DROP TABLE "_ctas_v" CASCADE;
  DROP TABLE "simulator_prompts_before_sources" CASCADE;
  DROP TABLE "simulator_prompts_after_sources" CASCADE;
  DROP TABLE "simulator_prompts" CASCADE;
  DROP TABLE "_simulator_prompts_v_version_before_sources" CASCADE;
  DROP TABLE "_simulator_prompts_v_version_after_sources" CASCADE;
  DROP TABLE "_simulator_prompts_v" CASCADE;
  DROP TABLE "scorecard_questions_options" CASCADE;
  DROP TABLE "scorecard_questions" CASCADE;
  DROP TABLE "_scorecard_questions_v_version_options" CASCADE;
  DROP TABLE "_scorecard_questions_v" CASCADE;
  DROP TABLE "scorecard_bands" CASCADE;
  DROP TABLE "_scorecard_bands_v" CASCADE;
  DROP TABLE "revenue_model_programs" CASCADE;
  DROP TABLE "_revenue_model_programs_v" CASCADE;
  DROP TABLE "notices" CASCADE;
  DROP TABLE "_notices_v" CASCADE;
  DROP TABLE "schema_entities" CASCADE;
  DROP TABLE "seo_templates_applies_to" CASCADE;
  DROP TABLE "seo_templates" CASCADE;
  DROP TABLE "redirects" CASCADE;
  DROP TABLE "forms_fields_options" CASCADE;
  DROP TABLE "forms_fields" CASCADE;
  DROP TABLE "forms" CASCADE;
  DROP TABLE "submissions" CASCADE;
  DROP TABLE "subscribers_tags" CASCADE;
  DROP TABLE "subscribers_history" CASCADE;
  DROP TABLE "subscribers" CASCADE;
  DROP TABLE "companies" CASCADE;
  DROP TABLE "contacts" CASCADE;
  DROP TABLE "leads" CASCADE;
  DROP TABLE "activities" CASCADE;
  DROP TABLE "tasks" CASCADE;
  DROP TABLE "lead_score_rules" CASCADE;
  DROP TABLE "outbox" CASCADE;
  DROP TABLE "audit_log" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_jobs_log" CASCADE;
  DROP TABLE "payload_jobs" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "site_settings_stats" CASCADE;
  DROP TABLE "site_settings" CASCADE;
  DROP TABLE "brand_settings" CASCADE;
  DROP TABLE "header_primary" CASCADE;
  DROP TABLE "header_utility" CASCADE;
  DROP TABLE "header_palette" CASCADE;
  DROP TABLE "header" CASCADE;
  DROP TABLE "footer_columns_links" CASCADE;
  DROP TABLE "footer_columns" CASCADE;
  DROP TABLE "footer_legal" CASCADE;
  DROP TABLE "footer" CASCADE;
  DROP TABLE "contact_legal_social_profiles" CASCADE;
  DROP TABLE "contact_legal" CASCADE;
  DROP TABLE "contact_legal_rels" CASCADE;
  DROP TABLE "seo_defaults" CASCADE;
  DROP TABLE "integrations_ai_features" CASCADE;
  DROP TABLE "integrations" CASCADE;
  DROP TABLE "chat_config_greetings" CASCADE;
  DROP TABLE "chat_config_brief_steps_chips" CASCADE;
  DROP TABLE "chat_config_brief_steps" CASCADE;
  DROP TABLE "chat_config_roadmap_steps_chips" CASCADE;
  DROP TABLE "chat_config_roadmap_steps" CASCADE;
  DROP TABLE "chat_config" CASCADE;
  DROP TABLE "roadmap_config_ai_agents" CASCADE;
  DROP TABLE "roadmap_config_findings" CASCADE;
  DROP TABLE "roadmap_config_plan_phases" CASCADE;
  DROP TABLE "roadmap_config" CASCADE;
  DROP TABLE "email_templates" CASCADE;
  DROP TABLE "spam_config_phrases" CASCADE;
  DROP TABLE "spam_config_throwaway_domains" CASCADE;
  DROP TABLE "spam_config_disposable_domains" CASCADE;
  DROP TABLE "spam_config_known_good_domains" CASCADE;
  DROP TABLE "spam_config_role_local_parts" CASCADE;
  DROP TABLE "spam_config" CASCADE;
  DROP TABLE "form_config_selects_options" CASCADE;
  DROP TABLE "form_config_selects" CASCADE;
  DROP TABLE "form_config" CASCADE;
  DROP TYPE "public"."enum_users_roles";
  DROP TYPE "public"."enum_media_rights";
  DROP TYPE "public"."enum_pages_blocks_rich_text_measure";
  DROP TYPE "public"."enum_pages_seo_schema_types";
  DROP TYPE "public"."enum_pages_page_type";
  DROP TYPE "public"."enum_pages_verification_status";
  DROP TYPE "public"."enum_pages_status";
  DROP TYPE "public"."enum__pages_v_blocks_rich_text_measure";
  DROP TYPE "public"."enum__pages_v_version_seo_schema_types";
  DROP TYPE "public"."enum__pages_v_version_page_type";
  DROP TYPE "public"."enum__pages_v_version_verification_status";
  DROP TYPE "public"."enum__pages_v_version_status";
  DROP TYPE "public"."enum_posts_seo_schema_types";
  DROP TYPE "public"."enum_posts_verification_status";
  DROP TYPE "public"."enum_posts_status";
  DROP TYPE "public"."enum__posts_v_version_seo_schema_types";
  DROP TYPE "public"."enum__posts_v_version_verification_status";
  DROP TYPE "public"."enum__posts_v_version_status";
  DROP TYPE "public"."enum_categories_seo_schema_types";
  DROP TYPE "public"."enum_tags_seo_schema_types";
  DROP TYPE "public"."enum_topics_seo_schema_types";
  DROP TYPE "public"."enum_industries_seo_schema_types";
  DROP TYPE "public"."enum_locations_seo_schema_types";
  DROP TYPE "public"."enum_people_seo_schema_types";
  DROP TYPE "public"."enum_people_verification_status";
  DROP TYPE "public"."enum_people_status";
  DROP TYPE "public"."enum__people_v_version_seo_schema_types";
  DROP TYPE "public"."enum__people_v_version_verification_status";
  DROP TYPE "public"."enum__people_v_version_status";
  DROP TYPE "public"."enum_services_seo_schema_types";
  DROP TYPE "public"."enum_services_offer_billing";
  DROP TYPE "public"."enum_services_offer_availability";
  DROP TYPE "public"."enum_services_verification_status";
  DROP TYPE "public"."enum_services_status";
  DROP TYPE "public"."enum__services_v_version_seo_schema_types";
  DROP TYPE "public"."enum__services_v_version_offer_billing";
  DROP TYPE "public"."enum__services_v_version_offer_availability";
  DROP TYPE "public"."enum__services_v_version_verification_status";
  DROP TYPE "public"."enum__services_v_version_status";
  DROP TYPE "public"."enum_offices_hours_days";
  DROP TYPE "public"."enum_offices_verification_status";
  DROP TYPE "public"."enum_offices_status";
  DROP TYPE "public"."enum__offices_v_version_hours_days";
  DROP TYPE "public"."enum__offices_v_version_verification_status";
  DROP TYPE "public"."enum__offices_v_version_status";
  DROP TYPE "public"."enum_case_studies_seo_schema_types";
  DROP TYPE "public"."enum_case_studies_kind";
  DROP TYPE "public"."enum_case_studies_verification_status";
  DROP TYPE "public"."enum_case_studies_status";
  DROP TYPE "public"."enum__case_studies_v_version_seo_schema_types";
  DROP TYPE "public"."enum__case_studies_v_version_kind";
  DROP TYPE "public"."enum__case_studies_v_version_verification_status";
  DROP TYPE "public"."enum__case_studies_v_version_status";
  DROP TYPE "public"."enum_ventures_seo_schema_types";
  DROP TYPE "public"."enum_ventures_status";
  DROP TYPE "public"."enum_ventures_verification_status";
  DROP TYPE "public"."enum__ventures_v_version_seo_schema_types";
  DROP TYPE "public"."enum__ventures_v_version_status";
  DROP TYPE "public"."enum__ventures_v_version_verification_status";
  DROP TYPE "public"."enum_testimonials_verification_status";
  DROP TYPE "public"."enum_testimonials_status";
  DROP TYPE "public"."enum__testimonials_v_version_verification_status";
  DROP TYPE "public"."enum__testimonials_v_version_status";
  DROP TYPE "public"."enum_faqs_verification_status";
  DROP TYPE "public"."enum_faqs_status";
  DROP TYPE "public"."enum__faqs_v_version_verification_status";
  DROP TYPE "public"."enum__faqs_v_version_status";
  DROP TYPE "public"."enum_glossary_terms_verification_status";
  DROP TYPE "public"."enum_glossary_terms_status";
  DROP TYPE "public"."enum__glossary_terms_v_version_verification_status";
  DROP TYPE "public"."enum__glossary_terms_v_version_status";
  DROP TYPE "public"."enum_citations_verification_status";
  DROP TYPE "public"."enum_evidence_stats_verification_status";
  DROP TYPE "public"."enum_evidence_stats_status";
  DROP TYPE "public"."enum__evidence_stats_v_version_verification_status";
  DROP TYPE "public"."enum__evidence_stats_v_version_status";
  DROP TYPE "public"."enum_ctas_primary_chat_mode";
  DROP TYPE "public"."enum_ctas_status";
  DROP TYPE "public"."enum__ctas_v_version_primary_chat_mode";
  DROP TYPE "public"."enum__ctas_v_version_status";
  DROP TYPE "public"."enum_simulator_prompts_status";
  DROP TYPE "public"."enum__simulator_prompts_v_version_status";
  DROP TYPE "public"."enum_scorecard_questions_status";
  DROP TYPE "public"."enum__scorecard_questions_v_version_status";
  DROP TYPE "public"."enum_scorecard_bands_status";
  DROP TYPE "public"."enum__scorecard_bands_v_version_status";
  DROP TYPE "public"."enum_revenue_model_programs_verification_status";
  DROP TYPE "public"."enum_revenue_model_programs_status";
  DROP TYPE "public"."enum__revenue_model_programs_v_version_verification_status";
  DROP TYPE "public"."enum__revenue_model_programs_v_version_status";
  DROP TYPE "public"."enum_notices_placement";
  DROP TYPE "public"."enum_notices_status";
  DROP TYPE "public"."enum__notices_v_version_placement";
  DROP TYPE "public"."enum__notices_v_version_status";
  DROP TYPE "public"."enum_schema_entities_verification_status";
  DROP TYPE "public"."enum_seo_templates_applies_to";
  DROP TYPE "public"."enum_redirects_status_code";
  DROP TYPE "public"."enum_redirects_source";
  DROP TYPE "public"."enum_forms_fields_type";
  DROP TYPE "public"."enum_submissions_mode";
  DROP TYPE "public"."enum_submissions_source";
  DROP TYPE "public"."enum_submissions_status";
  DROP TYPE "public"."enum_subscribers_status";
  DROP TYPE "public"."enum_subscribers_source";
  DROP TYPE "public"."enum_subscribers_consent_method";
  DROP TYPE "public"."enum_contacts_provenance";
  DROP TYPE "public"."enum_leads_stage";
  DROP TYPE "public"."enum_leads_source";
  DROP TYPE "public"."enum_leads_ai_insight_review_action";
  DROP TYPE "public"."enum_activities_type";
  DROP TYPE "public"."enum_tasks_status";
  DROP TYPE "public"."enum_lead_score_rules_factor";
  DROP TYPE "public"."enum_lead_score_rules_verification_status";
  DROP TYPE "public"."enum_outbox_kind";
  DROP TYPE "public"."enum_outbox_status";
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE "public"."enum_payload_jobs_log_state";
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  DROP TYPE "public"."enum_site_settings_stats_verification_status";
  DROP TYPE "public"."enum_site_settings_hero_status_verification_status";
  DROP TYPE "public"."enum_contact_legal_verification_status";
  DROP TYPE "public"."enum_integrations_ai_features";
  DROP TYPE "public"."enum_integrations_analytics_provider";
  DROP TYPE "public"."enum_integrations_email_provider";
  DROP TYPE "public"."enum_chat_config_brief_steps_type";
  DROP TYPE "public"."enum_chat_config_roadmap_steps_type";
  DROP TYPE "public"."enum_roadmap_config_ai_agents_kind";
  DROP TYPE "public"."enum_roadmap_config_findings_severity";`)
}
