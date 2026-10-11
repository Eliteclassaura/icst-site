import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * SIGNATURES-1: the organisation's standard signature (one global row) and each person's own signature + "use the
 * standard" switch. Additive and reversible. The seed is idempotent: it inserts the pre-written "ICS Sales Team"
 * signature only when the table has no row, so a re-run never overwrites an admin's edit. No phone, no address.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE IF NOT EXISTS "crm_signatures" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"standard_text" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );

  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signature_text" varchar;
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signature_use_standard" boolean DEFAULT true;

  INSERT INTO "crm_signatures" ("standard_text", "updated_at", "created_at")
  SELECT E'ICS Sales Team\nIndustrial Cooling Solutions', now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "crm_signatures");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE IF EXISTS "crm_signatures" CASCADE;
  ALTER TABLE "users" DROP COLUMN IF EXISTS "signature_text";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "signature_use_standard";`)
}
