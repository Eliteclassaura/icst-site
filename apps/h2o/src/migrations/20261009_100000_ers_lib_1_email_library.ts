import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_email_library_program" AS ENUM('E1.1', 'E1.2', 'E1.3', 'E1.4', 'E2', 'T-series', 'CUSTOM');
  CREATE TYPE "public"."enum_crm_email_library_type" AS ENUM('EMAIL', 'TASK');
  CREATE TYPE "public"."enum_crm_email_library_status" AS ENUM('IMPORTED_EXACT', 'SKELETON', 'LINKED', 'EDITED');
  CREATE TYPE "public"."enum_crm_email_library_approval_recommended" AS ENUM('REQUIRED', 'RULE_BASED', 'AUTO');
  CREATE TYPE "public"."enum_crm_email_library_approval_mode" AS ENUM('REQUIRED', 'RULE_BASED', 'AUTO');
  CREATE TYPE "public"."enum_crm_email_library_lint_badge" AS ENUM('PASS', 'NOTES', 'REVIEW', 'BLOCKED', 'NOT_RUN');
  CREATE TABLE "crm_email_library" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"key" varchar NOT NULL,
  	"program" "enum_crm_email_library_program" NOT NULL,
  	"sequence_code" varchar NOT NULL,
  	"sequence_label" varchar NOT NULL,
  	"step" numeric NOT NULL,
  	"step_code" varchar NOT NULL,
  	"type" "enum_crm_email_library_type" NOT NULL,
  	"timing" varchar,
  	"subject_variants" jsonb,
  	"copy_variants" jsonb,
  	"role_variants" jsonb,
  	"merge_fields" jsonb,
  	"missing_merge_fields" jsonb,
  	"placeholders" jsonb,
  	"evidence_fields" jsonb,
  	"stop_conditions" jsonb,
  	"pause_conditions" jsonb,
  	"reply_handling" varchar,
  	"task_creation" varchar,
  	"status" "enum_crm_email_library_status" DEFAULT 'IMPORTED_EXACT' NOT NULL,
  	"sendable" boolean DEFAULT true,
  	"version" numeric DEFAULT 1 NOT NULL,
  	"supersedes_id" uuid,
  	"approval_recommended" "enum_crm_email_library_approval_recommended" DEFAULT 'REQUIRED' NOT NULL,
  	"approval_mode" "enum_crm_email_library_approval_mode" DEFAULT 'AUTO' NOT NULL,
  	"approval_reason" varchar,
  	"approval_changed_at" timestamp(3) with time zone,
  	"approval_changed_by_id" uuid,
  	"source_ref" varchar,
  	"source_line" numeric,
  	"source_hash" varchar,
  	"source_file_sha256" varchar,
  	"linked_template_id" uuid,
  	"lint" jsonb,
  	"lint_badge" "enum_crm_email_library_lint_badge" DEFAULT 'NOT_RUN' NOT NULL,
  	"lint_rule_set" varchar,
  	"lint_run_at" timestamp(3) with time zone,
  	"flags" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_email_library_id" uuid;
  ALTER TABLE "crm_email_library" ADD CONSTRAINT "crm_email_library_supersedes_id_crm_email_library_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."crm_email_library"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_email_library" ADD CONSTRAINT "crm_email_library_approval_changed_by_id_users_id_fk" FOREIGN KEY ("approval_changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_email_library" ADD CONSTRAINT "crm_email_library_linked_template_id_crm_email_templates_id_fk" FOREIGN KEY ("linked_template_id") REFERENCES "public"."crm_email_templates"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "crm_email_library_canonical_id_idx" ON "crm_email_library" USING btree ("canonical_id");
  CREATE UNIQUE INDEX "crm_email_library_key_idx" ON "crm_email_library" USING btree ("key");
  CREATE INDEX "crm_email_library_program_idx" ON "crm_email_library" USING btree ("program");
  CREATE INDEX "crm_email_library_sequence_code_idx" ON "crm_email_library" USING btree ("sequence_code");
  CREATE INDEX "crm_email_library_status_idx" ON "crm_email_library" USING btree ("status");
  CREATE INDEX "crm_email_library_supersedes_idx" ON "crm_email_library" USING btree ("supersedes_id");
  CREATE INDEX "crm_email_library_approval_mode_idx" ON "crm_email_library" USING btree ("approval_mode");
  CREATE INDEX "crm_email_library_approval_changed_by_idx" ON "crm_email_library" USING btree ("approval_changed_by_id");
  CREATE INDEX "crm_email_library_source_hash_idx" ON "crm_email_library" USING btree ("source_hash");
  CREATE INDEX "crm_email_library_linked_template_idx" ON "crm_email_library" USING btree ("linked_template_id");
  CREATE INDEX "crm_email_library_lint_badge_idx" ON "crm_email_library" USING btree ("lint_badge");
  CREATE INDEX "crm_email_library_updated_at_idx" ON "crm_email_library" USING btree ("updated_at");
  CREATE INDEX "crm_email_library_created_at_idx" ON "crm_email_library" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_email_library_fk" FOREIGN KEY ("crm_email_library_id") REFERENCES "public"."crm_email_library"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_crm_email_library_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_email_library_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_email_library" DISABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS "crm_email_library" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_crm_email_library_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_crm_email_library_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "crm_email_library_id";
  DROP TYPE IF EXISTS "public"."enum_crm_email_library_program";
  DROP TYPE IF EXISTS "public"."enum_crm_email_library_type";
  DROP TYPE IF EXISTS "public"."enum_crm_email_library_status";
  DROP TYPE IF EXISTS "public"."enum_crm_email_library_approval_recommended";
  DROP TYPE IF EXISTS "public"."enum_crm_email_library_approval_mode";
  DROP TYPE IF EXISTS "public"."enum_crm_email_library_lint_badge";`)
}
