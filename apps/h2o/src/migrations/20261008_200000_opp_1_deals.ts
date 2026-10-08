import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_opportunities_office" AS ENUM('US', 'TH');
  CREATE TYPE "public"."enum_crm_deal_stages_key" AS ENUM('NEW', 'QUALIFYING', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'DELAYED', 'WON', 'LOST', 'CANCELLED');
  CREATE TABLE "crm_deal_stages" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_id" varchar NOT NULL,
  	"key" "enum_crm_deal_stages_key" NOT NULL,
  	"label" varchar NOT NULL,
  	"sort_order" numeric NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "crm_opportunities" ADD COLUMN "qualify_key" varchar;
  ALTER TABLE "crm_opportunities" ADD COLUMN "office" "enum_crm_opportunities_office";
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_deal_stages_id" uuid;
  CREATE UNIQUE INDEX "crm_deal_stages_canonical_id_idx" ON "crm_deal_stages" USING btree ("canonical_id");
  CREATE UNIQUE INDEX "crm_deal_stages_key_idx" ON "crm_deal_stages" USING btree ("key");
  CREATE INDEX "crm_deal_stages_sort_order_idx" ON "crm_deal_stages" USING btree ("sort_order");
  CREATE INDEX "crm_deal_stages_updated_at_idx" ON "crm_deal_stages" USING btree ("updated_at");
  CREATE INDEX "crm_deal_stages_created_at_idx" ON "crm_deal_stages" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_deal_stages_fk" FOREIGN KEY ("crm_deal_stages_id") REFERENCES "public"."crm_deal_stages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "crm_opportunities_qualify_key_idx" ON "crm_opportunities" USING btree ("qualify_key");
  CREATE INDEX "crm_opportunities_office_idx" ON "crm_opportunities" USING btree ("office");
  CREATE INDEX "payload_locked_documents_rels_crm_deal_stages_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_deal_stages_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_deal_stages" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "crm_deal_stages" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_crm_deal_stages_fk";
  
  DROP INDEX IF EXISTS "crm_opportunities_qualify_key_idx";
  DROP INDEX IF EXISTS "crm_opportunities_office_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_crm_deal_stages_id_idx";
  ALTER TABLE "crm_opportunities" DROP COLUMN "qualify_key";
  ALTER TABLE "crm_opportunities" DROP COLUMN "office";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_deal_stages_id";
  DROP TYPE "public"."enum_crm_opportunities_office";
  DROP TYPE "public"."enum_crm_deal_stages_key";`)
}
