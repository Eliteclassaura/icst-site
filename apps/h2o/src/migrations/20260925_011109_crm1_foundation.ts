import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_accounts_domains_domain_status" AS ENUM('VERIFIED_OWNED', 'VERIFIED_ALIAS', 'CANDIDATE', 'RETIRED');
  CREATE TYPE "public"."enum_crm_accounts_strategic_tier" AS ENUM('TIER_1', 'TIER_2', 'TIER_3', 'UNRATED');
  CREATE TYPE "public"."enum_crm_accounts_relationship_state" AS ENUM('VERIFIED_CUSTOMER', 'VERIFIED_PAST_CUSTOMER', 'PROSPECT', 'CANDIDATE', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_accounts_account_state" AS ENUM('ACTIVE', 'DORMANT', 'ARCHIVED', 'MERGED');
  CREATE TYPE "public"."enum_crm_accounts_provenance_source_system" AS ENUM('TYPEFORM', 'MANUAL_ENTRY', 'LEGACY_IMPORT', 'SYSTEM_DERIVED', 'SYNTHETIC_FIXTURE', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_accounts_provenance_verification_state" AS ENUM('VERIFIED', 'REVIEWED_UNVERIFIED', 'UNVERIFIED', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_contacts_phones_kind" AS ENUM('PRIMARY', 'MOBILE', 'OFFICE', 'OTHER', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_contacts_contact_function" AS ENUM('ENGINEERING_TECHNICAL', 'PLANT_OPERATIONS', 'MAINTENANCE_RELIABILITY', 'PROCUREMENT_SOURCING', 'PROJECT_MANAGEMENT', 'EXECUTIVE_MANAGEMENT', 'EPC_CONSULTANT_THIRD_PARTY', 'OTHER', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_contacts_account_link_confidence" AS ENUM('VERIFIED', 'HIGH_CONFIDENCE', 'LOW_CONFIDENCE', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_contacts_fit_state" AS ENUM('MEGA_INDUSTRIAL_FIT', 'LIKELY_FIT', 'UNKNOWN', 'NON_CORE');
  CREATE TYPE "public"."enum_crm_contacts_record_state" AS ENUM('ACTIVE', 'ARCHIVED', 'MERGED');
  CREATE TYPE "public"."enum_crm_contacts_marketing_eligibility" AS ENUM('ELIGIBLE', 'INELIGIBLE', 'UNKNOWN', 'REVIEW_REQUIRED');
  CREATE TYPE "public"."enum_crm_contacts_relationship_evidence" AS ENUM('EXPLICIT_OPT_IN', 'RFQ_REQUEST', 'ACTIVE_CUSTOMER', 'PAST_CUSTOMER', 'DIRECT_BUSINESS_RELATIONSHIP', 'PROFESSIONAL_CONTACT', 'NON_PERSONAL_BUSINESS_ADDRESS', 'OTHER_VERIFIED', 'NONE', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_contacts_jurisdiction" AS ENUM('VERIFIED_US', 'VERIFIED_JAPAN', 'VERIFIED_MALAYSIA', 'VERIFIED_VIETNAM', 'VERIFIED_OTHER', 'COUNTRY_UNKNOWN', 'LEGAL_REVIEW_REQUIRED');
  CREATE TYPE "public"."enum_crm_contacts_provenance_source_system" AS ENUM('TYPEFORM', 'MANUAL_ENTRY', 'LEGACY_IMPORT', 'SYSTEM_DERIVED', 'SYNTHETIC_FIXTURE', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_contacts_provenance_verification_state" AS ENUM('VERIFIED', 'REVIEWED_UNVERIFIED', 'UNVERIFIED', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_sites_site_link_confidence" AS ENUM('VERIFIED', 'HIGH_CONFIDENCE', 'LOW_CONFIDENCE', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_sites_site_state" AS ENUM('ACTIVE', 'INACTIVE', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_sites_provenance_source_system" AS ENUM('TYPEFORM', 'MANUAL_ENTRY', 'LEGACY_IMPORT', 'SYSTEM_DERIVED', 'SYNTHETIC_FIXTURE', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_sites_provenance_verification_state" AS ENUM('VERIFIED', 'REVIEWED_UNVERIFIED', 'UNVERIFIED', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_assets_technical_evidence_fact" AS ENUM('manufacturer', 'model', 'tower_type', 'material', 'cell_count', 'commissioned_year', 'condition_state');
  CREATE TYPE "public"."enum_crm_assets_technical_evidence_verification_state" AS ENUM('VERIFIED', 'REVIEWED_UNVERIFIED', 'UNVERIFIED', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_assets_known_dates_date_kind" AS ENUM('INSTALLED', 'COMMISSIONED', 'REBUILT', 'INSPECTED', 'SERVICED', 'OTHER');
  CREATE TYPE "public"."enum_crm_assets_condition_state" AS ENUM('NORMAL', 'WATCH', 'REPAIR_CANDIDATE', 'UPGRADE_CANDIDATE', 'REBUILD_CANDIDATE', 'REPLACEMENT_CANDIDATE', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_assets_asset_state" AS ENUM('ACTIVE', 'RETIRED', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_assets_provenance_source_system" AS ENUM('TYPEFORM', 'MANUAL_ENTRY', 'LEGACY_IMPORT', 'SYSTEM_DERIVED', 'SYNTHETIC_FIXTURE', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_assets_provenance_verification_state" AS ENUM('VERIFIED', 'REVIEWED_UNVERIFIED', 'UNVERIFIED', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_opportunities_motion" AS ENUM('NEW_TOWER', 'REBUILD_REPLACEMENT', 'REPAIR', 'UPGRADE_RETROFIT', 'MAINTENANCE_INSPECTION', 'PARTS', 'OTHER_APPROVED');
  CREATE TYPE "public"."enum_crm_opportunities_motion_detail" AS ENUM('NEW_LARGE_MEGA_TOWER', 'MAJOR_REBUILD_REPLACEMENT', 'REPAIR', 'THERMAL_UPGRADE', 'MECHANICAL_UPGRADE', 'STRUCTURAL_UPGRADE', 'PERFORMANCE_UPGRADE_RETROFIT', 'MAINTENANCE', 'INSPECTION', 'COOLING_TOWER_PARTS', 'CRITICAL_SPARES', 'INSTALLED_BASE_LIFECYCLE_EXPANSION');
  CREATE TYPE "public"."enum_crm_opportunities_project_type" AS ENUM('NEW_TOWER', 'MAJOR_REBUILD_REPLACEMENT', 'CAPACITY_EXPANSION_MODERNIZATION');
  CREATE TYPE "public"."enum_crm_opportunities_stage" AS ENUM('NEW', 'QUALIFYING', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'DELAYED', 'WON', 'LOST', 'CANCELLED');
  CREATE TYPE "public"."enum_crm_opportunities_project_stage" AS ENUM('EARLY_SIGNAL', 'DISCOVERY', 'TECHNICAL_SCOPING', 'STAKEHOLDER_ALIGNMENT', 'BUDGETING_OR_BUSINESS_CASE', 'PROCUREMENT_PREPARATION', 'DELAYED', 'ON_HOLD', 'NO_CURRENT_DECISION');
  CREATE TYPE "public"."enum_crm_opportunities_project_state" AS ENUM('VERIFIED_ACTIVE_CAPITAL_PROJECT', 'VERIFIED_EARLY_PROJECT_SIGNAL', 'VERIFIED_REBUILD_REPLACEMENT_PROJECT', 'KNOWN_ACCOUNT_PROJECT_UNCONFIRMED', 'ASSET_NEED_UNCONFIRMED', 'STALE_PROJECT_SIGNAL', 'PROJECT_ON_HOLD', 'PROJECT_CLOSED_OR_CANCELLED', 'UNKNOWN_PROJECT_STATUS');
  CREATE TYPE "public"."enum_crm_opportunities_outcome_status" AS ENUM('OPEN', 'WON', 'LOST', 'CANCELLED', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_opportunities_amount_status" AS ENUM('KNOWN', 'NOT_ENTERED', 'WITHHELD_OR_NOT_AVAILABLE', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_opportunities_revenue_verification_state" AS ENUM('UNVERIFIED', 'WON_EVENT_RECORDED', 'CONFIRMED', 'CORRECTED', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_opportunities_revenue_truth_state" AS ENUM('REVENUE_UNKNOWN', 'OPPORTUNITY_VALUE_KNOWN', 'WON_REVENUE_CONFIRMED', 'LOST_NO_REVENUE', 'CANCELLED_NO_REVENUE', 'VALUE_NOT_ENTERED', 'VALUE_WITHHELD_OR_NOT_AVAILABLE');
  CREATE TYPE "public"."enum_crm_opportunities_source_category" AS ENUM('EMAIL_SOURCED', 'EMAIL_INFLUENCED', 'NON_EMAIL_SOURCED', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_opportunities_provenance_source_system" AS ENUM('TYPEFORM', 'MANUAL_ENTRY', 'LEGACY_IMPORT', 'SYSTEM_DERIVED', 'SYNTHETIC_FIXTURE', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_opportunities_provenance_verification_state" AS ENUM('VERIFIED', 'REVIEWED_UNVERIFIED', 'UNVERIFIED', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_buying_group_members_membership_class" AS ENUM('ACCOUNT_CONTACT', 'PROJECT_BUYING_GROUP_MEMBER', 'PROJECT_MEMBERSHIP_UNKNOWN');
  CREATE TYPE "public"."enum_crm_buying_group_members_membership_confidence" AS ENUM('CONFIRMED', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_buying_group_members_membership_verification" AS ENUM('VERIFIED', 'REVIEWED_UNVERIFIED', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_buying_group_members_role_class" AS ENUM('ENGINEERING_TECHNICAL', 'PLANT_OPERATIONS', 'MAINTENANCE_RELIABILITY', 'PROCUREMENT_SOURCING', 'PROJECT_MANAGEMENT', 'EXECUTIVE_ECONOMIC_SPONSOR', 'EPC_CONSULTANT_THIRD_PARTY_ENGINEER', 'OTHER', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_buying_group_members_role_confidence" AS ENUM('CONFIRMED', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_buying_group_members_role_verification" AS ENUM('VERIFIED', 'REVIEWED_UNVERIFIED', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_buying_group_members_provenance_source_system" AS ENUM('TYPEFORM', 'MANUAL_ENTRY', 'LEGACY_IMPORT', 'SYSTEM_DERIVED', 'SYNTHETIC_FIXTURE', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_buying_group_members_provenance_verification_state" AS ENUM('VERIFIED', 'REVIEWED_UNVERIFIED', 'UNVERIFIED', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_rfqs_status" AS ENUM('RECEIVED', 'NEEDS_REVIEW', 'IN_REVIEW', 'QUALIFIED', 'REJECTED_NON_CORE', 'DUPLICATE_OF_EXISTING', 'CLOSED');
  CREATE TYPE "public"."enum_crm_rfqs_qualification_state" AS ENUM('UNKNOWN', 'INCOMPLETE', 'COMPLETE');
  CREATE TYPE "public"."enum_crm_rfqs_motion" AS ENUM('NEW_TOWER', 'REBUILD_REPLACEMENT', 'REPAIR', 'UPGRADE_RETROFIT', 'MAINTENANCE_INSPECTION', 'PARTS', 'OTHER_APPROVED');
  CREATE TYPE "public"."enum_crm_rfqs_follow_up_state" AS ENUM('NOT_STARTED', 'TASK_OPEN', 'HUMAN_RESPONDED', 'NOT_REQUIRED');
  CREATE TYPE "public"."enum_crm_rfqs_contact_match_state" AS ENUM('NOT_ATTEMPTED', 'MATCHED_EXACT_EMAIL', 'CREATED_NEW_CONTACT', 'NO_VALID_EMAIL', 'FIELD_MAPPING_MISSING', 'MANUAL');
  CREATE TYPE "public"."enum_crm_rfqs_account_match_state" AS ENUM('NOT_ATTEMPTED', 'MATCHED_VERIFIED_DOMAIN', 'AMBIGUOUS_REVIEW', 'FREE_EMAIL_DOMAIN', 'NO_MATCH', 'CONTACT_ACCOUNT_CONFLICT_REVIEW', 'MANUAL');
  CREATE TYPE "public"."enum_crm_rfqs_notification_state" AS ENUM('NOT_SENT_DISABLED_IN_CRM1');
  CREATE TYPE "public"."enum_crm_rfqs_source_system" AS ENUM('TYPEFORM', 'MANUAL_ENTRY', 'LEGACY_IMPORT', 'SYSTEM_DERIVED', 'SYNTHETIC_FIXTURE', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_rfq_items_product_resolution_state" AS ENUM('NOT_SUPPLIED', 'RESOLVED_EXACT_SLUG', 'UNRESOLVED', 'INVALID_CONTEXT');
  CREATE TYPE "public"."enum_crm_rfq_items_quantity_status" AS ENUM('KNOWN', 'NOT_SUPPLIED');
  CREATE TYPE "public"."enum_crm_rfq_items_provenance_source_system" AS ENUM('TYPEFORM', 'MANUAL_ENTRY', 'LEGACY_IMPORT', 'SYSTEM_DERIVED', 'SYNTHETIC_FIXTURE', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_rfq_items_provenance_verification_state" AS ENUM('VERIFIED', 'REVIEWED_UNVERIFIED', 'UNVERIFIED', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_activities_type" AS ENUM('NOTE_ADDED', 'CALL', 'MEETING', 'EMAIL_REFERENCE', 'REPLY_REFERENCE', 'DOCUMENT_REFERENCE', 'PROJECT_INTERACTION', 'INTAKE_RECEIVED', 'RFQ_CREATED', 'RFQ_STATUS_CHANGED', 'RFQ_ASSIGNED', 'OPPORTUNITY_CREATED', 'OPPORTUNITY_STAGE_CHANGED', 'OPPORTUNITY_OWNER_CHANGED', 'TASK_CREATED', 'TASK_COMPLETED', 'TASK_REASSIGNED', 'SUPPRESSION_RECORDED', 'SUPPRESSION_CLEARED', 'IDENTITY_REVIEW_OPENED');
  CREATE TYPE "public"."enum_crm_activities_actor_kind" AS ENUM('USER', 'SYSTEM', 'INTEGRATION');
  CREATE TYPE "public"."enum_crm_activities_provenance_source_system" AS ENUM('TYPEFORM', 'MANUAL_ENTRY', 'LEGACY_IMPORT', 'SYSTEM_DERIVED', 'SYNTHETIC_FIXTURE', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_activities_provenance_verification_state" AS ENUM('VERIFIED', 'REVIEWED_UNVERIFIED', 'UNVERIFIED', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_tasks_kind" AS ENUM('RFQ_FIRST_RESPONSE', 'FOLLOW_UP', 'MISSING_INFORMATION', 'IDENTITY_REVIEW', 'INTAKE_REVIEW', 'GENERAL');
  CREATE TYPE "public"."enum_crm_tasks_status" AS ENUM('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');
  CREATE TYPE "public"."enum_crm_tasks_priority" AS ENUM('HIGH', 'NORMAL', 'LOW');
  CREATE TYPE "public"."enum_crm_tasks_source" AS ENUM('MANUAL', 'SYSTEM_RULE', 'INTAKE');
  CREATE TYPE "public"."enum_crm_suppressions_action" AS ENUM('APPLY', 'CLEAR');
  CREATE TYPE "public"."enum_crm_suppressions_reason" AS ENUM('DO_NOT_CONTACT', 'LEGAL_PROHIBITION', 'COMPLAINT', 'HARD_BOUNCE', 'INVALID_ADDRESS', 'UNSUBSCRIBED', 'MANUAL_SUPPRESSION', 'SOFT_BOUNCE_HOLD');
  CREATE TYPE "public"."enum_crm_suppressions_scope" AS ENUM('MARKETING_EMAIL', 'ALL_EMAIL', 'ALL_OUTREACH');
  CREATE TYPE "public"."enum_crm_suppressions_source" AS ENUM('MANUAL', 'PROVIDER_EVENT', 'RFC8058_ENDPOINT', 'LEGACY_IMPORT', 'LEGAL_REVIEW', 'SYSTEM');
  CREATE TYPE "public"."enum_crm_intake_events_source_system" AS ENUM('TYPEFORM');
  CREATE TYPE "public"."enum_crm_intake_events_signature_state" AS ENUM('VERIFIED');
  CREATE TYPE "public"."enum_crm_intake_events_processing_state" AS ENUM('PROCESSING', 'PROCESSED', 'PROCESSED_WITH_REVIEW', 'DUPLICATE_OF_EXISTING_SUBMISSION', 'QUARANTINED_MALFORMED', 'QUARANTINED_UNSUPPORTED', 'FAILED_RETRYABLE');
  CREATE TYPE "public"."enum_crm_identity_reviews_subject_type" AS ENUM('CONTACT', 'ACCOUNT', 'SITE', 'ASSET', 'RFQ', 'INTAKE_EVENT');
  CREATE TYPE "public"."enum_crm_identity_reviews_reason" AS ENUM('EMAIL_MATCH_NAME_MISMATCH', 'SAME_NAME_DIFFERENT_EMAIL', 'VERIFIED_DOMAIN_ON_MULTIPLE_ACCOUNTS', 'COMPANY_NAME_MATCH_UNVERIFIED', 'CONTACT_ACCOUNT_CONFLICT', 'POSSIBLE_DUPLICATE_SUBMISSION', 'INTAKE_CONFLICTING_PAYLOAD', 'OTHER');
  CREATE TYPE "public"."enum_crm_identity_reviews_state" AS ENUM('OPEN', 'CONFIRMED_DISTINCT', 'CONFIRMED_DUPLICATE_PENDING_MERGE', 'DISMISSED');
  CREATE TABLE "crm_accounts_aliases" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"alias" varchar NOT NULL,
  	"evidence_ref" varchar
  );
  
  CREATE TABLE "crm_accounts_domains" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"domain" varchar NOT NULL,
  	"domain_status" "enum_crm_accounts_domains_domain_status" DEFAULT 'CANDIDATE' NOT NULL,
  	"evidence_ref" varchar
  );
  
  CREATE TABLE "crm_accounts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"canonical_name" varchar NOT NULL,
  	"legal_name" varchar,
  	"parent_account_id" uuid,
  	"industry" varchar,
  	"strategic_tier" "enum_crm_accounts_strategic_tier" DEFAULT 'UNRATED' NOT NULL,
  	"relationship_state" "enum_crm_accounts_relationship_state" DEFAULT 'UNKNOWN' NOT NULL,
  	"account_state" "enum_crm_accounts_account_state" DEFAULT 'ACTIVE' NOT NULL,
  	"owner_id" uuid,
  	"provenance_source_system" "enum_crm_accounts_provenance_source_system" NOT NULL,
  	"provenance_source_record_id" varchar,
  	"provenance_source_event_id" varchar,
  	"provenance_evidence_ref" varchar,
  	"provenance_first_seen_at" timestamp(3) with time zone,
  	"provenance_last_seen_at" timestamp(3) with time zone,
  	"provenance_import_batch_id" varchar,
  	"provenance_verification_state" "enum_crm_accounts_provenance_verification_state" DEFAULT 'UNKNOWN' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_contacts_phones" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"number_raw" varchar NOT NULL,
  	"kind" "enum_crm_contacts_phones_kind" DEFAULT 'UNKNOWN' NOT NULL
  );
  
  CREATE TABLE "crm_contacts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"email" varchar NOT NULL,
  	"email_original" varchar,
  	"email_match_key" varchar NOT NULL,
  	"email_domain" varchar,
  	"first_name" varchar,
  	"last_name" varchar,
  	"display_name" varchar,
  	"title" varchar,
  	"contact_function" "enum_crm_contacts_contact_function" DEFAULT 'UNKNOWN' NOT NULL,
  	"company_name_original" varchar,
  	"account_id" uuid,
  	"account_link_confidence" "enum_crm_contacts_account_link_confidence" DEFAULT 'UNKNOWN' NOT NULL,
  	"country_code" varchar,
  	"fit_state" "enum_crm_contacts_fit_state" DEFAULT 'UNKNOWN' NOT NULL,
  	"record_state" "enum_crm_contacts_record_state" DEFAULT 'ACTIVE' NOT NULL,
  	"owner_id" uuid,
  	"internal_test_candidate" boolean DEFAULT false,
  	"marketing_eligibility" "enum_crm_contacts_marketing_eligibility" DEFAULT 'UNKNOWN' NOT NULL,
  	"relationship_evidence" "enum_crm_contacts_relationship_evidence" DEFAULT 'UNKNOWN' NOT NULL,
  	"jurisdiction" "enum_crm_contacts_jurisdiction" DEFAULT 'COUNTRY_UNKNOWN' NOT NULL,
  	"provenance_source_system" "enum_crm_contacts_provenance_source_system" NOT NULL,
  	"provenance_source_record_id" varchar,
  	"provenance_source_event_id" varchar,
  	"provenance_evidence_ref" varchar,
  	"provenance_first_seen_at" timestamp(3) with time zone,
  	"provenance_last_seen_at" timestamp(3) with time zone,
  	"provenance_import_batch_id" varchar,
  	"provenance_verification_state" "enum_crm_contacts_provenance_verification_state" DEFAULT 'UNKNOWN' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_sites" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"account_id" uuid NOT NULL,
  	"site_name" varchar NOT NULL,
  	"address" varchar,
  	"city" varchar,
  	"region" varchar,
  	"country_code" varchar,
  	"industry_application" varchar,
  	"sales_region" varchar,
  	"site_link_confidence" "enum_crm_sites_site_link_confidence" DEFAULT 'UNKNOWN' NOT NULL,
  	"site_state" "enum_crm_sites_site_state" DEFAULT 'UNKNOWN' NOT NULL,
  	"provenance_source_system" "enum_crm_sites_provenance_source_system" NOT NULL,
  	"provenance_source_record_id" varchar,
  	"provenance_source_event_id" varchar,
  	"provenance_evidence_ref" varchar,
  	"provenance_first_seen_at" timestamp(3) with time zone,
  	"provenance_last_seen_at" timestamp(3) with time zone,
  	"provenance_import_batch_id" varchar,
  	"provenance_verification_state" "enum_crm_sites_provenance_verification_state" DEFAULT 'UNKNOWN' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_assets_technical_evidence" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"fact" "enum_crm_assets_technical_evidence_fact" NOT NULL,
  	"evidence_ref" varchar NOT NULL,
  	"verification_state" "enum_crm_assets_technical_evidence_verification_state" DEFAULT 'UNKNOWN' NOT NULL,
  	"observed_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "crm_assets_known_dates" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"date_kind" "enum_crm_assets_known_dates_date_kind" NOT NULL,
  	"date_value" timestamp(3) with time zone NOT NULL,
  	"evidence_ref" varchar NOT NULL
  );
  
  CREATE TABLE "crm_assets" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"site_id" uuid NOT NULL,
  	"account_id" uuid,
  	"asset_name" varchar,
  	"internal_reference" varchar,
  	"manufacturer" varchar,
  	"model" varchar,
  	"tower_type" varchar,
  	"material" varchar,
  	"cell_count" numeric,
  	"commissioned_year" numeric,
  	"condition_state" "enum_crm_assets_condition_state" DEFAULT 'UNKNOWN' NOT NULL,
  	"asset_state" "enum_crm_assets_asset_state" DEFAULT 'UNKNOWN' NOT NULL,
  	"provenance_source_system" "enum_crm_assets_provenance_source_system" NOT NULL,
  	"provenance_source_record_id" varchar,
  	"provenance_source_event_id" varchar,
  	"provenance_evidence_ref" varchar,
  	"provenance_first_seen_at" timestamp(3) with time zone,
  	"provenance_last_seen_at" timestamp(3) with time zone,
  	"provenance_import_batch_id" varchar,
  	"provenance_verification_state" "enum_crm_assets_provenance_verification_state" DEFAULT 'UNKNOWN' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_opportunities" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"account_id" uuid NOT NULL,
  	"site_id" uuid,
  	"motion" "enum_crm_opportunities_motion" NOT NULL,
  	"motion_detail" "enum_crm_opportunities_motion_detail",
  	"project_type" "enum_crm_opportunities_project_type",
  	"stage" "enum_crm_opportunities_stage" DEFAULT 'NEW' NOT NULL,
  	"last_stage_change_from" varchar,
  	"last_stage_change_to" varchar,
  	"last_stage_change_at" timestamp(3) with time zone,
  	"last_stage_change_by_id" uuid,
  	"last_stage_change_reason" varchar,
  	"project_stage" "enum_crm_opportunities_project_stage",
  	"project_state" "enum_crm_opportunities_project_state" DEFAULT 'UNKNOWN_PROJECT_STATUS' NOT NULL,
  	"project_evidence_ref" varchar,
  	"outcome_status" "enum_crm_opportunities_outcome_status",
  	"owner_id" uuid NOT NULL,
  	"amount_status" "enum_crm_opportunities_amount_status" DEFAULT 'NOT_ENTERED' NOT NULL,
  	"amount" numeric,
  	"currency" varchar,
  	"source_record_explicit_zero" boolean DEFAULT false,
  	"probability" numeric,
  	"revenue_verification_state" "enum_crm_opportunities_revenue_verification_state" DEFAULT 'UNVERIFIED' NOT NULL,
  	"revenue_truth_state" "enum_crm_opportunities_revenue_truth_state",
  	"amount_display" varchar,
  	"expected_decision_date" timestamp(3) with time zone,
  	"outage_window" varchar,
  	"project_window" varchar,
  	"won_date" timestamp(3) with time zone,
  	"closed_at" timestamp(3) with time zone,
  	"next_step" varchar,
  	"next_step_due_at" timestamp(3) with time zone,
  	"source_category" "enum_crm_opportunities_source_category" DEFAULT 'UNKNOWN' NOT NULL,
  	"source_event_id" varchar,
  	"origin_rfq_id" uuid,
  	"provenance_source_system" "enum_crm_opportunities_provenance_source_system" NOT NULL,
  	"provenance_source_record_id" varchar,
  	"provenance_source_event_id" varchar,
  	"provenance_evidence_ref" varchar,
  	"provenance_first_seen_at" timestamp(3) with time zone,
  	"provenance_last_seen_at" timestamp(3) with time zone,
  	"provenance_import_batch_id" varchar,
  	"provenance_verification_state" "enum_crm_opportunities_provenance_verification_state" DEFAULT 'UNKNOWN' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_opportunities_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"crm_assets_id" uuid
  );
  
  CREATE TABLE "crm_buying_group_members" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"opportunity_id" uuid NOT NULL,
  	"contact_id" uuid NOT NULL,
  	"account_id" uuid,
  	"cross_account" boolean,
  	"membership_class" "enum_crm_buying_group_members_membership_class" DEFAULT 'PROJECT_MEMBERSHIP_UNKNOWN' NOT NULL,
  	"membership_confidence" "enum_crm_buying_group_members_membership_confidence" DEFAULT 'UNKNOWN' NOT NULL,
  	"membership_verification" "enum_crm_buying_group_members_membership_verification" DEFAULT 'UNKNOWN' NOT NULL,
  	"role_class" "enum_crm_buying_group_members_role_class" DEFAULT 'UNKNOWN' NOT NULL,
  	"role_confidence" "enum_crm_buying_group_members_role_confidence" DEFAULT 'UNKNOWN' NOT NULL,
  	"role_verification" "enum_crm_buying_group_members_role_verification" DEFAULT 'UNKNOWN' NOT NULL,
  	"provenance_source_system" "enum_crm_buying_group_members_provenance_source_system" NOT NULL,
  	"provenance_source_record_id" varchar,
  	"provenance_source_event_id" varchar,
  	"provenance_evidence_ref" varchar,
  	"provenance_first_seen_at" timestamp(3) with time zone,
  	"provenance_last_seen_at" timestamp(3) with time zone,
  	"provenance_import_batch_id" varchar,
  	"provenance_verification_state" "enum_crm_buying_group_members_provenance_verification_state" DEFAULT 'UNKNOWN' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_rfqs" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"rfq_number" varchar NOT NULL,
  	"status" "enum_crm_rfqs_status" DEFAULT 'RECEIVED' NOT NULL,
  	"status_reason" varchar,
  	"qualification_state" "enum_crm_rfqs_qualification_state" DEFAULT 'UNKNOWN' NOT NULL,
  	"motion" "enum_crm_rfqs_motion",
  	"assignee_id" uuid,
  	"assigned_at" timestamp(3) with time zone,
  	"follow_up_state" "enum_crm_rfqs_follow_up_state" DEFAULT 'NOT_STARTED' NOT NULL,
  	"contact_id" uuid,
  	"contact_match_state" "enum_crm_rfqs_contact_match_state" DEFAULT 'NOT_ATTEMPTED' NOT NULL,
  	"account_id" uuid,
  	"account_match_state" "enum_crm_rfqs_account_match_state" DEFAULT 'NOT_ATTEMPTED' NOT NULL,
  	"site_id" uuid,
  	"opportunity_id" uuid,
  	"duplicate_of_id" uuid,
  	"notification_state" "enum_crm_rfqs_notification_state" DEFAULT 'NOT_SENT_DISABLED_IN_CRM1' NOT NULL,
  	"received_at" timestamp(3) with time zone NOT NULL,
  	"submitted_at" timestamp(3) with time zone,
  	"source_system" "enum_crm_rfqs_source_system" NOT NULL,
  	"source_form_id" varchar,
  	"source_event_id" varchar,
  	"client_submission_id" varchar,
  	"submission_key" varchar,
  	"raw_payload_hash" varchar,
  	"content_fingerprint" varchar,
  	"intake_event_id" uuid,
  	"submitted_first_name" varchar,
  	"submitted_last_name" varchar,
  	"submitted_email" varchar,
  	"submitted_phone" varchar,
  	"submitted_company" varchar,
  	"submitted_country_code" varchar,
  	"submitted_message" varchar,
  	"submitted_other_answers" jsonb,
  	"attribution_page_path" varchar,
  	"attribution_cta_placement" varchar,
  	"attribution_utm_source" varchar,
  	"attribution_utm_medium" varchar,
  	"attribution_utm_campaign" varchar,
  	"attribution_utm_term" varchar,
  	"attribution_utm_content" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_rfq_items" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"rfq_id" uuid NOT NULL,
  	"line_no" numeric DEFAULT 1 NOT NULL,
  	"product_id_source" varchar,
  	"product_slug_source" varchar,
  	"product_path_source" varchar,
  	"product_title_source" varchar,
  	"product_id" uuid,
  	"product_resolution_state" "enum_crm_rfq_items_product_resolution_state" DEFAULT 'NOT_SUPPLIED' NOT NULL,
  	"requested_quantity" numeric,
  	"quantity_status" "enum_crm_rfq_items_quantity_status" DEFAULT 'NOT_SUPPLIED' NOT NULL,
  	"requested_scope" varchar,
  	"customer_requirements" varchar,
  	"provenance_source_system" "enum_crm_rfq_items_provenance_source_system" NOT NULL,
  	"provenance_source_record_id" varchar,
  	"provenance_source_event_id" varchar,
  	"provenance_evidence_ref" varchar,
  	"provenance_first_seen_at" timestamp(3) with time zone,
  	"provenance_last_seen_at" timestamp(3) with time zone,
  	"provenance_import_batch_id" varchar,
  	"provenance_verification_state" "enum_crm_rfq_items_provenance_verification_state" DEFAULT 'UNKNOWN' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_activities" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"type" "enum_crm_activities_type" NOT NULL,
  	"summary" varchar NOT NULL,
  	"event_name" varchar,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"recorded_at" timestamp(3) with time zone NOT NULL,
  	"actor_id" uuid,
  	"actor_kind" "enum_crm_activities_actor_kind" NOT NULL,
  	"account_id" uuid,
  	"contact_id" uuid,
  	"site_id" uuid,
  	"asset_id" uuid,
  	"opportunity_id" uuid,
  	"rfq_id" uuid,
  	"task_id" uuid,
  	"detail" jsonb,
  	"idempotency_key" varchar,
  	"provenance_source_system" "enum_crm_activities_provenance_source_system" NOT NULL,
  	"provenance_source_record_id" varchar,
  	"provenance_source_event_id" varchar,
  	"provenance_evidence_ref" varchar,
  	"provenance_first_seen_at" timestamp(3) with time zone,
  	"provenance_last_seen_at" timestamp(3) with time zone,
  	"provenance_import_batch_id" varchar,
  	"provenance_verification_state" "enum_crm_activities_provenance_verification_state" DEFAULT 'UNKNOWN' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_notes" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"body" varchar NOT NULL,
  	"author_id" uuid,
  	"account_id" uuid,
  	"contact_id" uuid,
  	"site_id" uuid,
  	"asset_id" uuid,
  	"opportunity_id" uuid,
  	"rfq_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_tasks" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"title" varchar NOT NULL,
  	"kind" "enum_crm_tasks_kind" DEFAULT 'GENERAL' NOT NULL,
  	"status" "enum_crm_tasks_status" DEFAULT 'OPEN' NOT NULL,
  	"priority" "enum_crm_tasks_priority",
  	"assignee_id" uuid,
  	"due_at" timestamp(3) with time zone,
  	"account_id" uuid,
  	"contact_id" uuid,
  	"site_id" uuid,
  	"asset_id" uuid,
  	"opportunity_id" uuid,
  	"rfq_id" uuid,
  	"identity_review_id" uuid,
  	"notes" varchar,
  	"source" "enum_crm_tasks_source" DEFAULT 'MANUAL' NOT NULL,
  	"source_rule" varchar,
  	"idempotency_key" varchar,
  	"completed_at" timestamp(3) with time zone,
  	"completed_by_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_suppressions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"email_match_key" varchar NOT NULL,
  	"contact_id" uuid,
  	"action" "enum_crm_suppressions_action" DEFAULT 'APPLY' NOT NULL,
  	"reason" "enum_crm_suppressions_reason" NOT NULL,
  	"scope" "enum_crm_suppressions_scope",
  	"clears_id" uuid,
  	"source" "enum_crm_suppressions_source" DEFAULT 'MANUAL' NOT NULL,
  	"source_event_id" varchar,
  	"evidence_ref" varchar,
  	"reason_note" varchar,
  	"tenant" varchar DEFAULT 'ICS' NOT NULL,
  	"recorded_by_id" uuid,
  	"recorded_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_intake_events_conflicting_deliveries" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"raw_payload_hash" varchar NOT NULL,
  	"received_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "crm_intake_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"tenant" varchar DEFAULT 'ICS' NOT NULL,
  	"source_system" "enum_crm_intake_events_source_system" NOT NULL,
  	"source_event_id" varchar NOT NULL,
  	"source_event_type" varchar,
  	"source_form_id" varchar,
  	"source_response_token" varchar,
  	"signature_state" "enum_crm_intake_events_signature_state" NOT NULL,
  	"raw_payload_hash" varchar NOT NULL,
  	"raw_payload" jsonb,
  	"received_at" timestamp(3) with time zone NOT NULL,
  	"processing_state" "enum_crm_intake_events_processing_state" DEFAULT 'PROCESSING' NOT NULL,
  	"failure_code" varchar,
  	"normalized_summary" jsonb,
  	"rfq_id" uuid,
  	"processing_lease_until" timestamp(3) with time zone,
  	"replay_count" numeric DEFAULT 0 NOT NULL,
  	"last_replay_at" timestamp(3) with time zone,
  	"processed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_identity_reviews" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"subject_type" "enum_crm_identity_reviews_subject_type" NOT NULL,
  	"reason" "enum_crm_identity_reviews_reason" NOT NULL,
  	"state" "enum_crm_identity_reviews_state" DEFAULT 'OPEN' NOT NULL,
  	"subject_ids" jsonb NOT NULL,
  	"dedupe_key" varchar,
  	"contact_id" uuid,
  	"account_id" uuid,
  	"rfq_id" uuid,
  	"intake_event_id" uuid,
  	"resolution_note" varchar,
  	"resolved_at" timestamp(3) with time zone,
  	"resolved_by_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_accounts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_contacts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_sites_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_assets_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_opportunities_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_buying_group_members_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_rfqs_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_rfq_items_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_activities_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_notes_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_tasks_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_suppressions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_intake_events_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_identity_reviews_id" uuid;
  ALTER TABLE "crm_accounts_aliases" ADD CONSTRAINT "crm_accounts_aliases_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."crm_accounts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "crm_accounts_domains" ADD CONSTRAINT "crm_accounts_domains_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."crm_accounts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "crm_accounts" ADD CONSTRAINT "crm_accounts_parent_account_id_crm_accounts_id_fk" FOREIGN KEY ("parent_account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_accounts" ADD CONSTRAINT "crm_accounts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_contacts_phones" ADD CONSTRAINT "crm_contacts_phones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_sites" ADD CONSTRAINT "crm_sites_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_assets_technical_evidence" ADD CONSTRAINT "crm_assets_technical_evidence_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."crm_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "crm_assets_known_dates" ADD CONSTRAINT "crm_assets_known_dates_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."crm_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "crm_assets" ADD CONSTRAINT "crm_assets_site_id_crm_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."crm_sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_assets" ADD CONSTRAINT "crm_assets_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_site_id_crm_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."crm_sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_last_stage_change_by_id_users_id_fk" FOREIGN KEY ("last_stage_change_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_origin_rfq_id_crm_rfqs_id_fk" FOREIGN KEY ("origin_rfq_id") REFERENCES "public"."crm_rfqs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_opportunities_rels" ADD CONSTRAINT "crm_opportunities_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."crm_opportunities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "crm_opportunities_rels" ADD CONSTRAINT "crm_opportunities_rels_crm_assets_fk" FOREIGN KEY ("crm_assets_id") REFERENCES "public"."crm_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "crm_buying_group_members" ADD CONSTRAINT "crm_buying_group_members_opportunity_id_crm_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."crm_opportunities"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_buying_group_members" ADD CONSTRAINT "crm_buying_group_members_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_buying_group_members" ADD CONSTRAINT "crm_buying_group_members_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_rfqs" ADD CONSTRAINT "crm_rfqs_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_rfqs" ADD CONSTRAINT "crm_rfqs_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_rfqs" ADD CONSTRAINT "crm_rfqs_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_rfqs" ADD CONSTRAINT "crm_rfqs_site_id_crm_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."crm_sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_rfqs" ADD CONSTRAINT "crm_rfqs_opportunity_id_crm_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."crm_opportunities"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_rfqs" ADD CONSTRAINT "crm_rfqs_duplicate_of_id_crm_rfqs_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."crm_rfqs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_rfqs" ADD CONSTRAINT "crm_rfqs_intake_event_id_crm_intake_events_id_fk" FOREIGN KEY ("intake_event_id") REFERENCES "public"."crm_intake_events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_rfq_items" ADD CONSTRAINT "crm_rfq_items_rfq_id_crm_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."crm_rfqs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_rfq_items" ADD CONSTRAINT "crm_rfq_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_site_id_crm_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."crm_sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_asset_id_crm_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."crm_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_opportunity_id_crm_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."crm_opportunities"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_rfq_id_crm_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."crm_rfqs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_task_id_crm_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."crm_tasks"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_site_id_crm_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."crm_sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_asset_id_crm_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."crm_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_opportunity_id_crm_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."crm_opportunities"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_rfq_id_crm_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."crm_rfqs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_site_id_crm_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."crm_sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_asset_id_crm_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."crm_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_opportunity_id_crm_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."crm_opportunities"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_rfq_id_crm_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."crm_rfqs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_identity_review_id_crm_identity_reviews_id_fk" FOREIGN KEY ("identity_review_id") REFERENCES "public"."crm_identity_reviews"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_completed_by_id_users_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_suppressions" ADD CONSTRAINT "crm_suppressions_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_suppressions" ADD CONSTRAINT "crm_suppressions_clears_id_crm_suppressions_id_fk" FOREIGN KEY ("clears_id") REFERENCES "public"."crm_suppressions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_suppressions" ADD CONSTRAINT "crm_suppressions_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_intake_events_conflicting_deliveries" ADD CONSTRAINT "crm_intake_events_conflicting_deliveries_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."crm_intake_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "crm_intake_events" ADD CONSTRAINT "crm_intake_events_rfq_id_crm_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."crm_rfqs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_identity_reviews" ADD CONSTRAINT "crm_identity_reviews_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_identity_reviews" ADD CONSTRAINT "crm_identity_reviews_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_identity_reviews" ADD CONSTRAINT "crm_identity_reviews_rfq_id_crm_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."crm_rfqs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_identity_reviews" ADD CONSTRAINT "crm_identity_reviews_intake_event_id_crm_intake_events_id_fk" FOREIGN KEY ("intake_event_id") REFERENCES "public"."crm_intake_events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_identity_reviews" ADD CONSTRAINT "crm_identity_reviews_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "crm_accounts_aliases_order_idx" ON "crm_accounts_aliases" USING btree ("_order");
  CREATE INDEX "crm_accounts_aliases_parent_id_idx" ON "crm_accounts_aliases" USING btree ("_parent_id");
  CREATE INDEX "crm_accounts_domains_order_idx" ON "crm_accounts_domains" USING btree ("_order");
  CREATE INDEX "crm_accounts_domains_parent_id_idx" ON "crm_accounts_domains" USING btree ("_parent_id");
  CREATE INDEX "crm_accounts_domains_domain_idx" ON "crm_accounts_domains" USING btree ("domain");
  CREATE UNIQUE INDEX "crm_accounts_canonical_id_idx" ON "crm_accounts" USING btree ("canonical_id");
  CREATE INDEX "crm_accounts_canonical_name_idx" ON "crm_accounts" USING btree ("canonical_name");
  CREATE INDEX "crm_accounts_parent_account_idx" ON "crm_accounts" USING btree ("parent_account_id");
  CREATE INDEX "crm_accounts_relationship_state_idx" ON "crm_accounts" USING btree ("relationship_state");
  CREATE INDEX "crm_accounts_account_state_idx" ON "crm_accounts" USING btree ("account_state");
  CREATE INDEX "crm_accounts_owner_idx" ON "crm_accounts" USING btree ("owner_id");
  CREATE INDEX "crm_accounts_provenance_provenance_source_system_idx" ON "crm_accounts" USING btree ("provenance_source_system");
  CREATE INDEX "crm_accounts_provenance_provenance_source_record_id_idx" ON "crm_accounts" USING btree ("provenance_source_record_id");
  CREATE INDEX "crm_accounts_provenance_provenance_source_event_id_idx" ON "crm_accounts" USING btree ("provenance_source_event_id");
  CREATE INDEX "crm_accounts_provenance_provenance_import_batch_id_idx" ON "crm_accounts" USING btree ("provenance_import_batch_id");
  CREATE INDEX "crm_accounts_updated_at_idx" ON "crm_accounts" USING btree ("updated_at");
  CREATE INDEX "crm_accounts_created_at_idx" ON "crm_accounts" USING btree ("created_at");
  CREATE INDEX "crm_contacts_phones_order_idx" ON "crm_contacts_phones" USING btree ("_order");
  CREATE INDEX "crm_contacts_phones_parent_id_idx" ON "crm_contacts_phones" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "crm_contacts_canonical_id_idx" ON "crm_contacts" USING btree ("canonical_id");
  CREATE UNIQUE INDEX "crm_contacts_email_match_key_idx" ON "crm_contacts" USING btree ("email_match_key");
  CREATE INDEX "crm_contacts_email_domain_idx" ON "crm_contacts" USING btree ("email_domain");
  CREATE INDEX "crm_contacts_display_name_idx" ON "crm_contacts" USING btree ("display_name");
  CREATE INDEX "crm_contacts_account_idx" ON "crm_contacts" USING btree ("account_id");
  CREATE INDEX "crm_contacts_record_state_idx" ON "crm_contacts" USING btree ("record_state");
  CREATE INDEX "crm_contacts_owner_idx" ON "crm_contacts" USING btree ("owner_id");
  CREATE INDEX "crm_contacts_provenance_provenance_source_system_idx" ON "crm_contacts" USING btree ("provenance_source_system");
  CREATE INDEX "crm_contacts_provenance_provenance_source_record_id_idx" ON "crm_contacts" USING btree ("provenance_source_record_id");
  CREATE INDEX "crm_contacts_provenance_provenance_source_event_id_idx" ON "crm_contacts" USING btree ("provenance_source_event_id");
  CREATE INDEX "crm_contacts_provenance_provenance_import_batch_id_idx" ON "crm_contacts" USING btree ("provenance_import_batch_id");
  CREATE INDEX "crm_contacts_updated_at_idx" ON "crm_contacts" USING btree ("updated_at");
  CREATE INDEX "crm_contacts_created_at_idx" ON "crm_contacts" USING btree ("created_at");
  CREATE UNIQUE INDEX "crm_sites_canonical_id_idx" ON "crm_sites" USING btree ("canonical_id");
  CREATE INDEX "crm_sites_account_idx" ON "crm_sites" USING btree ("account_id");
  CREATE INDEX "crm_sites_site_name_idx" ON "crm_sites" USING btree ("site_name");
  CREATE INDEX "crm_sites_site_state_idx" ON "crm_sites" USING btree ("site_state");
  CREATE INDEX "crm_sites_provenance_provenance_source_system_idx" ON "crm_sites" USING btree ("provenance_source_system");
  CREATE INDEX "crm_sites_provenance_provenance_source_record_id_idx" ON "crm_sites" USING btree ("provenance_source_record_id");
  CREATE INDEX "crm_sites_provenance_provenance_source_event_id_idx" ON "crm_sites" USING btree ("provenance_source_event_id");
  CREATE INDEX "crm_sites_provenance_provenance_import_batch_id_idx" ON "crm_sites" USING btree ("provenance_import_batch_id");
  CREATE INDEX "crm_sites_updated_at_idx" ON "crm_sites" USING btree ("updated_at");
  CREATE INDEX "crm_sites_created_at_idx" ON "crm_sites" USING btree ("created_at");
  CREATE INDEX "crm_assets_technical_evidence_order_idx" ON "crm_assets_technical_evidence" USING btree ("_order");
  CREATE INDEX "crm_assets_technical_evidence_parent_id_idx" ON "crm_assets_technical_evidence" USING btree ("_parent_id");
  CREATE INDEX "crm_assets_known_dates_order_idx" ON "crm_assets_known_dates" USING btree ("_order");
  CREATE INDEX "crm_assets_known_dates_parent_id_idx" ON "crm_assets_known_dates" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "crm_assets_canonical_id_idx" ON "crm_assets" USING btree ("canonical_id");
  CREATE INDEX "crm_assets_site_idx" ON "crm_assets" USING btree ("site_id");
  CREATE INDEX "crm_assets_account_idx" ON "crm_assets" USING btree ("account_id");
  CREATE INDEX "crm_assets_internal_reference_idx" ON "crm_assets" USING btree ("internal_reference");
  CREATE INDEX "crm_assets_condition_state_idx" ON "crm_assets" USING btree ("condition_state");
  CREATE INDEX "crm_assets_asset_state_idx" ON "crm_assets" USING btree ("asset_state");
  CREATE INDEX "crm_assets_provenance_provenance_source_system_idx" ON "crm_assets" USING btree ("provenance_source_system");
  CREATE INDEX "crm_assets_provenance_provenance_source_record_id_idx" ON "crm_assets" USING btree ("provenance_source_record_id");
  CREATE INDEX "crm_assets_provenance_provenance_source_event_id_idx" ON "crm_assets" USING btree ("provenance_source_event_id");
  CREATE INDEX "crm_assets_provenance_provenance_import_batch_id_idx" ON "crm_assets" USING btree ("provenance_import_batch_id");
  CREATE INDEX "crm_assets_updated_at_idx" ON "crm_assets" USING btree ("updated_at");
  CREATE INDEX "crm_assets_created_at_idx" ON "crm_assets" USING btree ("created_at");
  CREATE UNIQUE INDEX "crm_opportunities_canonical_id_idx" ON "crm_opportunities" USING btree ("canonical_id");
  CREATE INDEX "crm_opportunities_name_idx" ON "crm_opportunities" USING btree ("name");
  CREATE INDEX "crm_opportunities_account_idx" ON "crm_opportunities" USING btree ("account_id");
  CREATE INDEX "crm_opportunities_site_idx" ON "crm_opportunities" USING btree ("site_id");
  CREATE INDEX "crm_opportunities_motion_idx" ON "crm_opportunities" USING btree ("motion");
  CREATE INDEX "crm_opportunities_motion_detail_idx" ON "crm_opportunities" USING btree ("motion_detail");
  CREATE INDEX "crm_opportunities_stage_idx" ON "crm_opportunities" USING btree ("stage");
  CREATE INDEX "crm_opportunities_last_stage_change_last_stage_change_by_idx" ON "crm_opportunities" USING btree ("last_stage_change_by_id");
  CREATE INDEX "crm_opportunities_project_stage_idx" ON "crm_opportunities" USING btree ("project_stage");
  CREATE INDEX "crm_opportunities_outcome_status_idx" ON "crm_opportunities" USING btree ("outcome_status");
  CREATE INDEX "crm_opportunities_owner_idx" ON "crm_opportunities" USING btree ("owner_id");
  CREATE INDEX "crm_opportunities_revenue_truth_state_idx" ON "crm_opportunities" USING btree ("revenue_truth_state");
  CREATE INDEX "crm_opportunities_next_step_due_at_idx" ON "crm_opportunities" USING btree ("next_step_due_at");
  CREATE INDEX "crm_opportunities_origin_rfq_idx" ON "crm_opportunities" USING btree ("origin_rfq_id");
  CREATE INDEX "crm_opportunities_provenance_provenance_source_system_idx" ON "crm_opportunities" USING btree ("provenance_source_system");
  CREATE INDEX "crm_opportunities_provenance_provenance_source_record_id_idx" ON "crm_opportunities" USING btree ("provenance_source_record_id");
  CREATE INDEX "crm_opportunities_provenance_provenance_source_event_id_idx" ON "crm_opportunities" USING btree ("provenance_source_event_id");
  CREATE INDEX "crm_opportunities_provenance_provenance_import_batch_id_idx" ON "crm_opportunities" USING btree ("provenance_import_batch_id");
  CREATE INDEX "crm_opportunities_updated_at_idx" ON "crm_opportunities" USING btree ("updated_at");
  CREATE INDEX "crm_opportunities_created_at_idx" ON "crm_opportunities" USING btree ("created_at");
  CREATE INDEX "crm_opportunities_rels_order_idx" ON "crm_opportunities_rels" USING btree ("order");
  CREATE INDEX "crm_opportunities_rels_parent_idx" ON "crm_opportunities_rels" USING btree ("parent_id");
  CREATE INDEX "crm_opportunities_rels_path_idx" ON "crm_opportunities_rels" USING btree ("path");
  CREATE INDEX "crm_opportunities_rels_crm_assets_id_idx" ON "crm_opportunities_rels" USING btree ("crm_assets_id");
  CREATE UNIQUE INDEX "crm_buying_group_members_canonical_id_idx" ON "crm_buying_group_members" USING btree ("canonical_id");
  CREATE INDEX "crm_buying_group_members_opportunity_idx" ON "crm_buying_group_members" USING btree ("opportunity_id");
  CREATE INDEX "crm_buying_group_members_contact_idx" ON "crm_buying_group_members" USING btree ("contact_id");
  CREATE INDEX "crm_buying_group_members_account_idx" ON "crm_buying_group_members" USING btree ("account_id");
  CREATE INDEX "crm_buying_group_members_provenance_provenance_source_sy_idx" ON "crm_buying_group_members" USING btree ("provenance_source_system");
  CREATE INDEX "crm_buying_group_members_provenance_provenance_source_re_idx" ON "crm_buying_group_members" USING btree ("provenance_source_record_id");
  CREATE INDEX "crm_buying_group_members_provenance_provenance_source_ev_idx" ON "crm_buying_group_members" USING btree ("provenance_source_event_id");
  CREATE INDEX "crm_buying_group_members_provenance_provenance_import_ba_idx" ON "crm_buying_group_members" USING btree ("provenance_import_batch_id");
  CREATE INDEX "crm_buying_group_members_updated_at_idx" ON "crm_buying_group_members" USING btree ("updated_at");
  CREATE INDEX "crm_buying_group_members_created_at_idx" ON "crm_buying_group_members" USING btree ("created_at");
  CREATE UNIQUE INDEX "opportunity_contact_idx" ON "crm_buying_group_members" USING btree ("opportunity_id","contact_id");
  CREATE UNIQUE INDEX "crm_rfqs_canonical_id_idx" ON "crm_rfqs" USING btree ("canonical_id");
  CREATE UNIQUE INDEX "crm_rfqs_rfq_number_idx" ON "crm_rfqs" USING btree ("rfq_number");
  CREATE INDEX "crm_rfqs_status_idx" ON "crm_rfqs" USING btree ("status");
  CREATE INDEX "crm_rfqs_assignee_idx" ON "crm_rfqs" USING btree ("assignee_id");
  CREATE INDEX "crm_rfqs_follow_up_state_idx" ON "crm_rfqs" USING btree ("follow_up_state");
  CREATE INDEX "crm_rfqs_contact_idx" ON "crm_rfqs" USING btree ("contact_id");
  CREATE INDEX "crm_rfqs_account_idx" ON "crm_rfqs" USING btree ("account_id");
  CREATE INDEX "crm_rfqs_site_idx" ON "crm_rfqs" USING btree ("site_id");
  CREATE INDEX "crm_rfqs_opportunity_idx" ON "crm_rfqs" USING btree ("opportunity_id");
  CREATE INDEX "crm_rfqs_duplicate_of_idx" ON "crm_rfqs" USING btree ("duplicate_of_id");
  CREATE INDEX "crm_rfqs_received_at_idx" ON "crm_rfqs" USING btree ("received_at");
  CREATE INDEX "crm_rfqs_source_event_id_idx" ON "crm_rfqs" USING btree ("source_event_id");
  CREATE UNIQUE INDEX "crm_rfqs_submission_key_idx" ON "crm_rfqs" USING btree ("submission_key");
  CREATE INDEX "crm_rfqs_content_fingerprint_idx" ON "crm_rfqs" USING btree ("content_fingerprint");
  CREATE INDEX "crm_rfqs_intake_event_idx" ON "crm_rfqs" USING btree ("intake_event_id");
  CREATE INDEX "crm_rfqs_attribution_attribution_page_path_idx" ON "crm_rfqs" USING btree ("attribution_page_path");
  CREATE INDEX "crm_rfqs_attribution_attribution_cta_placement_idx" ON "crm_rfqs" USING btree ("attribution_cta_placement");
  CREATE INDEX "crm_rfqs_updated_at_idx" ON "crm_rfqs" USING btree ("updated_at");
  CREATE INDEX "crm_rfqs_created_at_idx" ON "crm_rfqs" USING btree ("created_at");
  CREATE UNIQUE INDEX "crm_rfq_items_canonical_id_idx" ON "crm_rfq_items" USING btree ("canonical_id");
  CREATE INDEX "crm_rfq_items_rfq_idx" ON "crm_rfq_items" USING btree ("rfq_id");
  CREATE INDEX "crm_rfq_items_product_slug_source_idx" ON "crm_rfq_items" USING btree ("product_slug_source");
  CREATE INDEX "crm_rfq_items_product_idx" ON "crm_rfq_items" USING btree ("product_id");
  CREATE INDEX "crm_rfq_items_provenance_provenance_source_system_idx" ON "crm_rfq_items" USING btree ("provenance_source_system");
  CREATE INDEX "crm_rfq_items_provenance_provenance_source_record_id_idx" ON "crm_rfq_items" USING btree ("provenance_source_record_id");
  CREATE INDEX "crm_rfq_items_provenance_provenance_source_event_id_idx" ON "crm_rfq_items" USING btree ("provenance_source_event_id");
  CREATE INDEX "crm_rfq_items_provenance_provenance_import_batch_id_idx" ON "crm_rfq_items" USING btree ("provenance_import_batch_id");
  CREATE INDEX "crm_rfq_items_updated_at_idx" ON "crm_rfq_items" USING btree ("updated_at");
  CREATE INDEX "crm_rfq_items_created_at_idx" ON "crm_rfq_items" USING btree ("created_at");
  CREATE UNIQUE INDEX "rfq_line_no_idx" ON "crm_rfq_items" USING btree ("rfq_id","line_no");
  CREATE UNIQUE INDEX "crm_activities_canonical_id_idx" ON "crm_activities" USING btree ("canonical_id");
  CREATE INDEX "crm_activities_type_idx" ON "crm_activities" USING btree ("type");
  CREATE INDEX "crm_activities_event_name_idx" ON "crm_activities" USING btree ("event_name");
  CREATE INDEX "crm_activities_occurred_at_idx" ON "crm_activities" USING btree ("occurred_at");
  CREATE INDEX "crm_activities_actor_idx" ON "crm_activities" USING btree ("actor_id");
  CREATE INDEX "crm_activities_account_idx" ON "crm_activities" USING btree ("account_id");
  CREATE INDEX "crm_activities_contact_idx" ON "crm_activities" USING btree ("contact_id");
  CREATE INDEX "crm_activities_site_idx" ON "crm_activities" USING btree ("site_id");
  CREATE INDEX "crm_activities_asset_idx" ON "crm_activities" USING btree ("asset_id");
  CREATE INDEX "crm_activities_opportunity_idx" ON "crm_activities" USING btree ("opportunity_id");
  CREATE INDEX "crm_activities_rfq_idx" ON "crm_activities" USING btree ("rfq_id");
  CREATE INDEX "crm_activities_task_idx" ON "crm_activities" USING btree ("task_id");
  CREATE UNIQUE INDEX "crm_activities_idempotency_key_idx" ON "crm_activities" USING btree ("idempotency_key");
  CREATE INDEX "crm_activities_provenance_provenance_source_system_idx" ON "crm_activities" USING btree ("provenance_source_system");
  CREATE INDEX "crm_activities_provenance_provenance_source_record_id_idx" ON "crm_activities" USING btree ("provenance_source_record_id");
  CREATE INDEX "crm_activities_provenance_provenance_source_event_id_idx" ON "crm_activities" USING btree ("provenance_source_event_id");
  CREATE INDEX "crm_activities_provenance_provenance_import_batch_id_idx" ON "crm_activities" USING btree ("provenance_import_batch_id");
  CREATE INDEX "crm_activities_updated_at_idx" ON "crm_activities" USING btree ("updated_at");
  CREATE INDEX "crm_activities_created_at_idx" ON "crm_activities" USING btree ("created_at");
  CREATE UNIQUE INDEX "crm_notes_canonical_id_idx" ON "crm_notes" USING btree ("canonical_id");
  CREATE INDEX "crm_notes_author_idx" ON "crm_notes" USING btree ("author_id");
  CREATE INDEX "crm_notes_account_idx" ON "crm_notes" USING btree ("account_id");
  CREATE INDEX "crm_notes_contact_idx" ON "crm_notes" USING btree ("contact_id");
  CREATE INDEX "crm_notes_site_idx" ON "crm_notes" USING btree ("site_id");
  CREATE INDEX "crm_notes_asset_idx" ON "crm_notes" USING btree ("asset_id");
  CREATE INDEX "crm_notes_opportunity_idx" ON "crm_notes" USING btree ("opportunity_id");
  CREATE INDEX "crm_notes_rfq_idx" ON "crm_notes" USING btree ("rfq_id");
  CREATE INDEX "crm_notes_updated_at_idx" ON "crm_notes" USING btree ("updated_at");
  CREATE INDEX "crm_notes_created_at_idx" ON "crm_notes" USING btree ("created_at");
  CREATE UNIQUE INDEX "crm_tasks_canonical_id_idx" ON "crm_tasks" USING btree ("canonical_id");
  CREATE INDEX "crm_tasks_kind_idx" ON "crm_tasks" USING btree ("kind");
  CREATE INDEX "crm_tasks_status_idx" ON "crm_tasks" USING btree ("status");
  CREATE INDEX "crm_tasks_assignee_idx" ON "crm_tasks" USING btree ("assignee_id");
  CREATE INDEX "crm_tasks_due_at_idx" ON "crm_tasks" USING btree ("due_at");
  CREATE INDEX "crm_tasks_account_idx" ON "crm_tasks" USING btree ("account_id");
  CREATE INDEX "crm_tasks_contact_idx" ON "crm_tasks" USING btree ("contact_id");
  CREATE INDEX "crm_tasks_site_idx" ON "crm_tasks" USING btree ("site_id");
  CREATE INDEX "crm_tasks_asset_idx" ON "crm_tasks" USING btree ("asset_id");
  CREATE INDEX "crm_tasks_opportunity_idx" ON "crm_tasks" USING btree ("opportunity_id");
  CREATE INDEX "crm_tasks_rfq_idx" ON "crm_tasks" USING btree ("rfq_id");
  CREATE INDEX "crm_tasks_identity_review_idx" ON "crm_tasks" USING btree ("identity_review_id");
  CREATE UNIQUE INDEX "crm_tasks_idempotency_key_idx" ON "crm_tasks" USING btree ("idempotency_key");
  CREATE INDEX "crm_tasks_completed_by_idx" ON "crm_tasks" USING btree ("completed_by_id");
  CREATE INDEX "crm_tasks_updated_at_idx" ON "crm_tasks" USING btree ("updated_at");
  CREATE INDEX "crm_tasks_created_at_idx" ON "crm_tasks" USING btree ("created_at");
  CREATE UNIQUE INDEX "crm_suppressions_canonical_id_idx" ON "crm_suppressions" USING btree ("canonical_id");
  CREATE INDEX "crm_suppressions_email_match_key_idx" ON "crm_suppressions" USING btree ("email_match_key");
  CREATE INDEX "crm_suppressions_contact_idx" ON "crm_suppressions" USING btree ("contact_id");
  CREATE INDEX "crm_suppressions_reason_idx" ON "crm_suppressions" USING btree ("reason");
  CREATE INDEX "crm_suppressions_clears_idx" ON "crm_suppressions" USING btree ("clears_id");
  CREATE INDEX "crm_suppressions_source_event_id_idx" ON "crm_suppressions" USING btree ("source_event_id");
  CREATE INDEX "crm_suppressions_recorded_by_idx" ON "crm_suppressions" USING btree ("recorded_by_id");
  CREATE INDEX "crm_suppressions_updated_at_idx" ON "crm_suppressions" USING btree ("updated_at");
  CREATE INDEX "crm_suppressions_created_at_idx" ON "crm_suppressions" USING btree ("created_at");
  CREATE INDEX "crm_intake_events_conflicting_deliveries_order_idx" ON "crm_intake_events_conflicting_deliveries" USING btree ("_order");
  CREATE INDEX "crm_intake_events_conflicting_deliveries_parent_id_idx" ON "crm_intake_events_conflicting_deliveries" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "crm_intake_events_canonical_id_idx" ON "crm_intake_events" USING btree ("canonical_id");
  CREATE INDEX "crm_intake_events_source_system_idx" ON "crm_intake_events" USING btree ("source_system");
  CREATE INDEX "crm_intake_events_source_event_id_idx" ON "crm_intake_events" USING btree ("source_event_id");
  CREATE INDEX "crm_intake_events_source_form_id_idx" ON "crm_intake_events" USING btree ("source_form_id");
  CREATE INDEX "crm_intake_events_source_response_token_idx" ON "crm_intake_events" USING btree ("source_response_token");
  CREATE INDEX "crm_intake_events_raw_payload_hash_idx" ON "crm_intake_events" USING btree ("raw_payload_hash");
  CREATE INDEX "crm_intake_events_received_at_idx" ON "crm_intake_events" USING btree ("received_at");
  CREATE INDEX "crm_intake_events_processing_state_idx" ON "crm_intake_events" USING btree ("processing_state");
  CREATE INDEX "crm_intake_events_rfq_idx" ON "crm_intake_events" USING btree ("rfq_id");
  CREATE INDEX "crm_intake_events_updated_at_idx" ON "crm_intake_events" USING btree ("updated_at");
  CREATE INDEX "crm_intake_events_created_at_idx" ON "crm_intake_events" USING btree ("created_at");
  CREATE UNIQUE INDEX "source_system_source_event_id_idx" ON "crm_intake_events" USING btree ("source_system","source_event_id");
  CREATE UNIQUE INDEX "crm_identity_reviews_canonical_id_idx" ON "crm_identity_reviews" USING btree ("canonical_id");
  CREATE INDEX "crm_identity_reviews_subject_type_idx" ON "crm_identity_reviews" USING btree ("subject_type");
  CREATE INDEX "crm_identity_reviews_reason_idx" ON "crm_identity_reviews" USING btree ("reason");
  CREATE INDEX "crm_identity_reviews_state_idx" ON "crm_identity_reviews" USING btree ("state");
  CREATE UNIQUE INDEX "crm_identity_reviews_dedupe_key_idx" ON "crm_identity_reviews" USING btree ("dedupe_key");
  CREATE INDEX "crm_identity_reviews_contact_idx" ON "crm_identity_reviews" USING btree ("contact_id");
  CREATE INDEX "crm_identity_reviews_account_idx" ON "crm_identity_reviews" USING btree ("account_id");
  CREATE INDEX "crm_identity_reviews_rfq_idx" ON "crm_identity_reviews" USING btree ("rfq_id");
  CREATE INDEX "crm_identity_reviews_intake_event_idx" ON "crm_identity_reviews" USING btree ("intake_event_id");
  CREATE INDEX "crm_identity_reviews_resolved_by_idx" ON "crm_identity_reviews" USING btree ("resolved_by_id");
  CREATE INDEX "crm_identity_reviews_updated_at_idx" ON "crm_identity_reviews" USING btree ("updated_at");
  CREATE INDEX "crm_identity_reviews_created_at_idx" ON "crm_identity_reviews" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_accounts_fk" FOREIGN KEY ("crm_accounts_id") REFERENCES "public"."crm_accounts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_contacts_fk" FOREIGN KEY ("crm_contacts_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_sites_fk" FOREIGN KEY ("crm_sites_id") REFERENCES "public"."crm_sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_assets_fk" FOREIGN KEY ("crm_assets_id") REFERENCES "public"."crm_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_opportunities_fk" FOREIGN KEY ("crm_opportunities_id") REFERENCES "public"."crm_opportunities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_buying_group_members_fk" FOREIGN KEY ("crm_buying_group_members_id") REFERENCES "public"."crm_buying_group_members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_rfqs_fk" FOREIGN KEY ("crm_rfqs_id") REFERENCES "public"."crm_rfqs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_rfq_items_fk" FOREIGN KEY ("crm_rfq_items_id") REFERENCES "public"."crm_rfq_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_activities_fk" FOREIGN KEY ("crm_activities_id") REFERENCES "public"."crm_activities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_notes_fk" FOREIGN KEY ("crm_notes_id") REFERENCES "public"."crm_notes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_tasks_fk" FOREIGN KEY ("crm_tasks_id") REFERENCES "public"."crm_tasks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_suppressions_fk" FOREIGN KEY ("crm_suppressions_id") REFERENCES "public"."crm_suppressions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_intake_events_fk" FOREIGN KEY ("crm_intake_events_id") REFERENCES "public"."crm_intake_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_identity_reviews_fk" FOREIGN KEY ("crm_identity_reviews_id") REFERENCES "public"."crm_identity_reviews"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_crm_accounts_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_accounts_id");
  CREATE INDEX "payload_locked_documents_rels_crm_contacts_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_contacts_id");
  CREATE INDEX "payload_locked_documents_rels_crm_sites_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_sites_id");
  CREATE INDEX "payload_locked_documents_rels_crm_assets_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_assets_id");
  CREATE INDEX "payload_locked_documents_rels_crm_opportunities_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_opportunities_id");
  CREATE INDEX "payload_locked_documents_rels_crm_buying_group_members_i_idx" ON "payload_locked_documents_rels" USING btree ("crm_buying_group_members_id");
  CREATE INDEX "payload_locked_documents_rels_crm_rfqs_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_rfqs_id");
  CREATE INDEX "payload_locked_documents_rels_crm_rfq_items_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_rfq_items_id");
  CREATE INDEX "payload_locked_documents_rels_crm_activities_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_activities_id");
  CREATE INDEX "payload_locked_documents_rels_crm_notes_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_notes_id");
  CREATE INDEX "payload_locked_documents_rels_crm_tasks_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_tasks_id");
  CREATE INDEX "payload_locked_documents_rels_crm_suppressions_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_suppressions_id");
  CREATE INDEX "payload_locked_documents_rels_crm_intake_events_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_intake_events_id");
  CREATE INDEX "payload_locked_documents_rels_crm_identity_reviews_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_identity_reviews_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_accounts_aliases" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_accounts_domains" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_accounts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_contacts_phones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_contacts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_sites" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_assets_technical_evidence" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_assets_known_dates" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_assets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_opportunities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_opportunities_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_buying_group_members" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_rfqs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_rfq_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_activities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_notes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_tasks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_suppressions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_intake_events_conflicting_deliveries" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_intake_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_identity_reviews" DISABLE ROW LEVEL SECURITY;
  -- Reordered (CRM-1): drop the lock-table FKs, indexes and columns BEFORE the CRM tables. The generator
  -- emits them after DROP TABLE … CASCADE, which has already removed the FKs, so the generated down fails.
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_accounts_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_contacts_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_sites_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_assets_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_opportunities_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_buying_group_members_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_rfqs_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_rfq_items_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_activities_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_notes_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_tasks_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_suppressions_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_intake_events_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_identity_reviews_fk";
  DROP INDEX "payload_locked_documents_rels_crm_accounts_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_contacts_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_sites_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_assets_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_opportunities_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_buying_group_members_i_idx";
  DROP INDEX "payload_locked_documents_rels_crm_rfqs_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_rfq_items_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_activities_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_notes_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_tasks_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_suppressions_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_intake_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_identity_reviews_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_accounts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_contacts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_sites_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_assets_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_opportunities_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_buying_group_members_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_rfqs_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_rfq_items_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_activities_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_notes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_tasks_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_suppressions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_intake_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_identity_reviews_id";
  DROP TABLE "crm_accounts_aliases" CASCADE;
  DROP TABLE "crm_accounts_domains" CASCADE;
  DROP TABLE "crm_accounts" CASCADE;
  DROP TABLE "crm_contacts_phones" CASCADE;
  DROP TABLE "crm_contacts" CASCADE;
  DROP TABLE "crm_sites" CASCADE;
  DROP TABLE "crm_assets_technical_evidence" CASCADE;
  DROP TABLE "crm_assets_known_dates" CASCADE;
  DROP TABLE "crm_assets" CASCADE;
  DROP TABLE "crm_opportunities" CASCADE;
  DROP TABLE "crm_opportunities_rels" CASCADE;
  DROP TABLE "crm_buying_group_members" CASCADE;
  DROP TABLE "crm_rfqs" CASCADE;
  DROP TABLE "crm_rfq_items" CASCADE;
  DROP TABLE "crm_activities" CASCADE;
  DROP TABLE "crm_notes" CASCADE;
  DROP TABLE "crm_tasks" CASCADE;
  DROP TABLE "crm_suppressions" CASCADE;
  DROP TABLE "crm_intake_events_conflicting_deliveries" CASCADE;
  DROP TABLE "crm_intake_events" CASCADE;
  DROP TABLE "crm_identity_reviews" CASCADE;
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  DROP TYPE "public"."enum_crm_accounts_domains_domain_status";
  DROP TYPE "public"."enum_crm_accounts_strategic_tier";
  DROP TYPE "public"."enum_crm_accounts_relationship_state";
  DROP TYPE "public"."enum_crm_accounts_account_state";
  DROP TYPE "public"."enum_crm_accounts_provenance_source_system";
  DROP TYPE "public"."enum_crm_accounts_provenance_verification_state";
  DROP TYPE "public"."enum_crm_contacts_phones_kind";
  DROP TYPE "public"."enum_crm_contacts_contact_function";
  DROP TYPE "public"."enum_crm_contacts_account_link_confidence";
  DROP TYPE "public"."enum_crm_contacts_fit_state";
  DROP TYPE "public"."enum_crm_contacts_record_state";
  DROP TYPE "public"."enum_crm_contacts_marketing_eligibility";
  DROP TYPE "public"."enum_crm_contacts_relationship_evidence";
  DROP TYPE "public"."enum_crm_contacts_jurisdiction";
  DROP TYPE "public"."enum_crm_contacts_provenance_source_system";
  DROP TYPE "public"."enum_crm_contacts_provenance_verification_state";
  DROP TYPE "public"."enum_crm_sites_site_link_confidence";
  DROP TYPE "public"."enum_crm_sites_site_state";
  DROP TYPE "public"."enum_crm_sites_provenance_source_system";
  DROP TYPE "public"."enum_crm_sites_provenance_verification_state";
  DROP TYPE "public"."enum_crm_assets_technical_evidence_fact";
  DROP TYPE "public"."enum_crm_assets_technical_evidence_verification_state";
  DROP TYPE "public"."enum_crm_assets_known_dates_date_kind";
  DROP TYPE "public"."enum_crm_assets_condition_state";
  DROP TYPE "public"."enum_crm_assets_asset_state";
  DROP TYPE "public"."enum_crm_assets_provenance_source_system";
  DROP TYPE "public"."enum_crm_assets_provenance_verification_state";
  DROP TYPE "public"."enum_crm_opportunities_motion";
  DROP TYPE "public"."enum_crm_opportunities_motion_detail";
  DROP TYPE "public"."enum_crm_opportunities_project_type";
  DROP TYPE "public"."enum_crm_opportunities_stage";
  DROP TYPE "public"."enum_crm_opportunities_project_stage";
  DROP TYPE "public"."enum_crm_opportunities_project_state";
  DROP TYPE "public"."enum_crm_opportunities_outcome_status";
  DROP TYPE "public"."enum_crm_opportunities_amount_status";
  DROP TYPE "public"."enum_crm_opportunities_revenue_verification_state";
  DROP TYPE "public"."enum_crm_opportunities_revenue_truth_state";
  DROP TYPE "public"."enum_crm_opportunities_source_category";
  DROP TYPE "public"."enum_crm_opportunities_provenance_source_system";
  DROP TYPE "public"."enum_crm_opportunities_provenance_verification_state";
  DROP TYPE "public"."enum_crm_buying_group_members_membership_class";
  DROP TYPE "public"."enum_crm_buying_group_members_membership_confidence";
  DROP TYPE "public"."enum_crm_buying_group_members_membership_verification";
  DROP TYPE "public"."enum_crm_buying_group_members_role_class";
  DROP TYPE "public"."enum_crm_buying_group_members_role_confidence";
  DROP TYPE "public"."enum_crm_buying_group_members_role_verification";
  DROP TYPE "public"."enum_crm_buying_group_members_provenance_source_system";
  DROP TYPE "public"."enum_crm_buying_group_members_provenance_verification_state";
  DROP TYPE "public"."enum_crm_rfqs_status";
  DROP TYPE "public"."enum_crm_rfqs_qualification_state";
  DROP TYPE "public"."enum_crm_rfqs_motion";
  DROP TYPE "public"."enum_crm_rfqs_follow_up_state";
  DROP TYPE "public"."enum_crm_rfqs_contact_match_state";
  DROP TYPE "public"."enum_crm_rfqs_account_match_state";
  DROP TYPE "public"."enum_crm_rfqs_notification_state";
  DROP TYPE "public"."enum_crm_rfqs_source_system";
  DROP TYPE "public"."enum_crm_rfq_items_product_resolution_state";
  DROP TYPE "public"."enum_crm_rfq_items_quantity_status";
  DROP TYPE "public"."enum_crm_rfq_items_provenance_source_system";
  DROP TYPE "public"."enum_crm_rfq_items_provenance_verification_state";
  DROP TYPE "public"."enum_crm_activities_type";
  DROP TYPE "public"."enum_crm_activities_actor_kind";
  DROP TYPE "public"."enum_crm_activities_provenance_source_system";
  DROP TYPE "public"."enum_crm_activities_provenance_verification_state";
  DROP TYPE "public"."enum_crm_tasks_kind";
  DROP TYPE "public"."enum_crm_tasks_status";
  DROP TYPE "public"."enum_crm_tasks_priority";
  DROP TYPE "public"."enum_crm_tasks_source";
  DROP TYPE "public"."enum_crm_suppressions_action";
  DROP TYPE "public"."enum_crm_suppressions_reason";
  DROP TYPE "public"."enum_crm_suppressions_scope";
  DROP TYPE "public"."enum_crm_suppressions_source";
  DROP TYPE "public"."enum_crm_intake_events_source_system";
  DROP TYPE "public"."enum_crm_intake_events_signature_state";
  DROP TYPE "public"."enum_crm_intake_events_processing_state";
  DROP TYPE "public"."enum_crm_identity_reviews_subject_type";
  DROP TYPE "public"."enum_crm_identity_reviews_reason";
  DROP TYPE "public"."enum_crm_identity_reviews_state";`)
}
