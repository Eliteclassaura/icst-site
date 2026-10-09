import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_sequences_readiness" AS ENUM('NOT_READY', 'READY');
  CREATE TYPE "public"."enum_crm_sequence_triggers_key" AS ENUM('RFQ_RECEIVED', 'RFQ_NEEDS_INFO', 'DEAL_QUOTE_SENT', 'NO_ACTIVITY');
  CREATE TABLE "crm_sequence_triggers" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"key" "enum_crm_sequence_triggers_key" NOT NULL,
  	"enabled" boolean DEFAULT false,
  	"sequence_id" uuid,
  	"idle_days" numeric,
  	"skip_in_sequence" boolean DEFAULT true,
  	"skip_open_deal" boolean DEFAULT true,
  	"skip_recent_days" numeric DEFAULT 7,
  	"last_matched_at" timestamp(3) with time zone,
  	"changed_at" timestamp(3) with time zone,
  	"changed_by_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_ers_simulations" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"sequence_id" uuid NOT NULL,
  	"version_hash" varchar NOT NULL,
  	"snapshot_hash" varchar NOT NULL,
  	"counts" jsonb,
  	"approved_at" timestamp(3) with time zone NOT NULL,
  	"approved_by_id" uuid NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "crm_sequences" ADD COLUMN "readiness" "enum_crm_sequences_readiness" DEFAULT 'NOT_READY' NOT NULL;
  ALTER TABLE "crm_sequences" ADD COLUMN "ready_at" timestamp(3) with time zone;
  ALTER TABLE "crm_sequences" ADD COLUMN "ready_by_id" uuid;
  ALTER TABLE "crm_sequences" ADD COLUMN "library_source" jsonb;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_sequence_triggers_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_ers_simulations_id" uuid;
  ALTER TABLE "crm_sequence_triggers" ADD CONSTRAINT "crm_sequence_triggers_sequence_id_crm_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."crm_sequences"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_sequence_triggers" ADD CONSTRAINT "crm_sequence_triggers_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_ers_simulations" ADD CONSTRAINT "crm_ers_simulations_sequence_id_crm_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."crm_sequences"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_ers_simulations" ADD CONSTRAINT "crm_ers_simulations_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "crm_sequence_triggers_canonical_id_idx" ON "crm_sequence_triggers" USING btree ("canonical_id");
  CREATE UNIQUE INDEX "crm_sequence_triggers_key_idx" ON "crm_sequence_triggers" USING btree ("key");
  CREATE INDEX "crm_sequence_triggers_enabled_idx" ON "crm_sequence_triggers" USING btree ("enabled");
  CREATE INDEX "crm_sequence_triggers_sequence_idx" ON "crm_sequence_triggers" USING btree ("sequence_id");
  CREATE INDEX "crm_sequence_triggers_changed_by_idx" ON "crm_sequence_triggers" USING btree ("changed_by_id");
  CREATE INDEX "crm_sequence_triggers_updated_at_idx" ON "crm_sequence_triggers" USING btree ("updated_at");
  CREATE INDEX "crm_sequence_triggers_created_at_idx" ON "crm_sequence_triggers" USING btree ("created_at");
  CREATE UNIQUE INDEX "crm_ers_simulations_canonical_id_idx" ON "crm_ers_simulations" USING btree ("canonical_id");
  CREATE INDEX "crm_ers_simulations_sequence_idx" ON "crm_ers_simulations" USING btree ("sequence_id");
  CREATE INDEX "crm_ers_simulations_snapshot_hash_idx" ON "crm_ers_simulations" USING btree ("snapshot_hash");
  CREATE INDEX "crm_ers_simulations_approved_by_idx" ON "crm_ers_simulations" USING btree ("approved_by_id");
  CREATE INDEX "crm_ers_simulations_updated_at_idx" ON "crm_ers_simulations" USING btree ("updated_at");
  CREATE INDEX "crm_ers_simulations_created_at_idx" ON "crm_ers_simulations" USING btree ("created_at");
  ALTER TABLE "crm_sequences" ADD CONSTRAINT "crm_sequences_ready_by_id_users_id_fk" FOREIGN KEY ("ready_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_sequence_triggers_fk" FOREIGN KEY ("crm_sequence_triggers_id") REFERENCES "public"."crm_sequence_triggers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_ers_simulations_fk" FOREIGN KEY ("crm_ers_simulations_id") REFERENCES "public"."crm_ers_simulations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "crm_sequences_readiness_idx" ON "crm_sequences" USING btree ("readiness");
  CREATE INDEX "crm_sequences_ready_by_idx" ON "crm_sequences" USING btree ("ready_by_id");
  CREATE INDEX "payload_locked_documents_rels_crm_sequence_triggers_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_sequence_triggers_id");
  CREATE INDEX "payload_locked_documents_rels_crm_ers_simulations_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_ers_simulations_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_sequence_triggers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_ers_simulations" DISABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS "crm_sequence_triggers" CASCADE;
  DROP TABLE IF EXISTS "crm_ers_simulations" CASCADE;
  ALTER TABLE "crm_sequences" DROP CONSTRAINT IF EXISTS "crm_sequences_ready_by_id_users_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_crm_sequence_triggers_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_crm_ers_simulations_fk";
  
  DROP INDEX IF EXISTS "crm_sequences_readiness_idx";
  DROP INDEX IF EXISTS "crm_sequences_ready_by_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_crm_sequence_triggers_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_crm_ers_simulations_id_idx";
  ALTER TABLE "crm_sequences" DROP COLUMN IF EXISTS "readiness";
  ALTER TABLE "crm_sequences" DROP COLUMN IF EXISTS "ready_at";
  ALTER TABLE "crm_sequences" DROP COLUMN IF EXISTS "ready_by_id";
  ALTER TABLE "crm_sequences" DROP COLUMN IF EXISTS "library_source";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "crm_sequence_triggers_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "crm_ers_simulations_id";
  DROP TYPE IF EXISTS "public"."enum_crm_sequences_readiness";
  DROP TYPE IF EXISTS "public"."enum_crm_sequence_triggers_key";`)
}
