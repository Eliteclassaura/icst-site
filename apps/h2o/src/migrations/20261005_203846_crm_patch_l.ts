import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
import { HOLIDAY_SEED } from '../crm/data/holidays'
import { officeForCountry } from '../crm/offices'

/**
 * CRM Patch L (pre-cutover gate). Additive only: new enums, columns, tables and indexes; no existing column changes.
 *   - L1: users.crm_office / users.time_zone; crm_rfqs.office / office_source; the crm-office-settings global (routing
 *     overrides + holidays). Data step: seed the 2026–2027 holidays (owner-approved standard lists) and backfill
 *     the new RFQ office columns from the derived country.
 *   - L2: users.mfa_* (two-factor state; every secret column holds AES-256-GCM ciphertext or HMAC digests only).
 *   - L4: crm_rfqs.attribution_{gclid,gbraid,wbraid,ga_client_id,landing_page,referrer}.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_crm_office" AS ENUM('US', 'TH');
  CREATE TYPE "public"."enum_users_time_zone" AS ENUM('America/Denver', 'America/Los_Angeles', 'America/Chicago', 'America/New_York', 'Asia/Bangkok', 'Asia/Tokyo', 'Asia/Singapore', 'UTC');
  CREATE TYPE "public"."enum_crm_rfqs_office" AS ENUM('US', 'TH');
  CREATE TYPE "public"."enum_crm_rfqs_office_source" AS ENUM('COUNTRY_RULE', 'OWNER_OVERRIDE', 'DEFAULT', 'MANUAL');
  CREATE TYPE "public"."enum_crm_office_settings_routing_overrides_office" AS ENUM('US', 'TH');
  CREATE TYPE "public"."enum_crm_office_settings_holidays_office" AS ENUM('US', 'TH');
  CREATE TABLE "crm_office_settings_routing_overrides" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"country_code" varchar NOT NULL,
  	"office" "enum_crm_office_settings_routing_overrides_office" NOT NULL,
  	"note" varchar
  );
  
  CREATE TABLE "crm_office_settings_holidays" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"office" "enum_crm_office_settings_holidays_office" NOT NULL,
  	"date" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"confirmed" boolean DEFAULT false,
  	"note" varchar
  );
  
  CREATE TABLE "crm_office_settings" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "users" ADD COLUMN "crm_office" "enum_users_crm_office" DEFAULT 'US';
  ALTER TABLE "users" ADD COLUMN "time_zone" "enum_users_time_zone";
  ALTER TABLE "users" ADD COLUMN "mfa_enabled" boolean DEFAULT false;
  ALTER TABLE "users" ADD COLUMN "mfa_enrolled_at" timestamp(3) with time zone;
  ALTER TABLE "users" ADD COLUMN "mfa_reset" boolean DEFAULT false;
  ALTER TABLE "users" ADD COLUMN "mfa_secret" varchar;
  ALTER TABLE "users" ADD COLUMN "mfa_pending_secret" varchar;
  ALTER TABLE "users" ADD COLUMN "mfa_pending_at" timestamp(3) with time zone;
  ALTER TABLE "users" ADD COLUMN "mfa_recovery" jsonb;
  ALTER TABLE "users" ADD COLUMN "mfa_last_step" numeric;
  ALTER TABLE "users" ADD COLUMN "mfa_sessions" jsonb;
  ALTER TABLE "users" ADD COLUMN "mfa_failures" numeric DEFAULT 0;
  ALTER TABLE "users" ADD COLUMN "mfa_locked_until" timestamp(3) with time zone;
  ALTER TABLE "crm_rfqs" ADD COLUMN "office" "enum_crm_rfqs_office";
  ALTER TABLE "crm_rfqs" ADD COLUMN "office_source" "enum_crm_rfqs_office_source";
  ALTER TABLE "crm_rfqs" ADD COLUMN "attribution_gclid" varchar;
  ALTER TABLE "crm_rfqs" ADD COLUMN "attribution_gbraid" varchar;
  ALTER TABLE "crm_rfqs" ADD COLUMN "attribution_wbraid" varchar;
  ALTER TABLE "crm_rfqs" ADD COLUMN "attribution_ga_client_id" varchar;
  ALTER TABLE "crm_rfqs" ADD COLUMN "attribution_landing_page" varchar;
  ALTER TABLE "crm_rfqs" ADD COLUMN "attribution_referrer" varchar;
  ALTER TABLE "crm_office_settings_routing_overrides" ADD CONSTRAINT "crm_office_settings_routing_overrides_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."crm_office_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "crm_office_settings_holidays" ADD CONSTRAINT "crm_office_settings_holidays_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."crm_office_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "crm_office_settings_routing_overrides_order_idx" ON "crm_office_settings_routing_overrides" USING btree ("_order");
  CREATE INDEX "crm_office_settings_routing_overrides_parent_id_idx" ON "crm_office_settings_routing_overrides" USING btree ("_parent_id");
  CREATE INDEX "crm_office_settings_holidays_order_idx" ON "crm_office_settings_holidays" USING btree ("_order");
  CREATE INDEX "crm_office_settings_holidays_parent_id_idx" ON "crm_office_settings_holidays" USING btree ("_parent_id");
  CREATE INDEX "crm_rfqs_office_idx" ON "crm_rfqs" USING btree ("office");`)

  // ── Patch L data step: new tables/columns only ──────────────────────────────────────────────────────────────────
  // L1 (a) Seed the office settings with the 2026–2027 holiday seed (owner-approved standard lists: confirmed),
  //        only when the settings record does not exist yet (a re-run, or an owner-edited record, is left alone).
  const existing = (await db.execute(sql`SELECT count(*)::int AS n FROM "crm_office_settings"`)) as unknown as { rows: Array<{ n: number }> }
  let seeded = 0
  if ((existing.rows[0]?.n ?? 0) === 0) {
    const parent = (await db.execute(sql`INSERT INTO "crm_office_settings" ("updated_at", "created_at") VALUES (now(), now()) RETURNING "id"`)) as unknown as {
      rows: Array<{ id: string }>
    }
    const parentId = parent.rows[0]!.id
    let order = 0
    for (const h of HOLIDAY_SEED) {
      order++
      await db.execute(sql`INSERT INTO "crm_office_settings_holidays" ("_order", "_parent_id", "id", "office", "date", "name", "confirmed", "note")
        VALUES (${order}, ${parentId}, ${`seed-${h.office}-${h.date}`}, ${h.office}, ${h.date}, ${h.name}, true, ${h.note ?? (h.office === 'US' ? 'US federal holiday' : 'Thai public holiday')})`)
      seeded++
    }
  }
  // L1 (b) Backfill the new office columns on existing inquiries from their derived country (the default rule; no
  //        overrides exist yet). Nothing else on the row changes.
  const rfqs = (await db.execute(sql`SELECT "id", "country_code" FROM "crm_rfqs" WHERE "office" IS NULL`)) as unknown as {
    rows: Array<{ id: string; country_code: string | null }>
  }
  const offices: Record<string, number> = {}
  for (const r of rfqs.rows) {
    const routed = officeForCountry(r.country_code)
    await db.execute(sql`UPDATE "crm_rfqs" SET "office" = ${routed.office}, "office_source" = ${routed.source} WHERE "id" = ${r.id}`)
    offices[`${routed.office}:${routed.source}`] = (offices[`${routed.office}:${routed.source}`] ?? 0) + 1
  }
  payload.logger.info({ msg: 'crm_patch_l data step', holidaysSeeded: seeded, rfqsBackfilled: rfqs.rows.length, ...offices })

}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_office_settings_routing_overrides" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_office_settings_holidays" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_office_settings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "crm_office_settings_routing_overrides" CASCADE;
  DROP TABLE "crm_office_settings_holidays" CASCADE;
  DROP TABLE "crm_office_settings" CASCADE;
  DROP INDEX "crm_rfqs_office_idx";
  ALTER TABLE "users" DROP COLUMN "crm_office";
  ALTER TABLE "users" DROP COLUMN "time_zone";
  ALTER TABLE "users" DROP COLUMN "mfa_enabled";
  ALTER TABLE "users" DROP COLUMN "mfa_enrolled_at";
  ALTER TABLE "users" DROP COLUMN "mfa_reset";
  ALTER TABLE "users" DROP COLUMN "mfa_secret";
  ALTER TABLE "users" DROP COLUMN "mfa_pending_secret";
  ALTER TABLE "users" DROP COLUMN "mfa_pending_at";
  ALTER TABLE "users" DROP COLUMN "mfa_recovery";
  ALTER TABLE "users" DROP COLUMN "mfa_last_step";
  ALTER TABLE "users" DROP COLUMN "mfa_sessions";
  ALTER TABLE "users" DROP COLUMN "mfa_failures";
  ALTER TABLE "users" DROP COLUMN "mfa_locked_until";
  ALTER TABLE "crm_rfqs" DROP COLUMN "office";
  ALTER TABLE "crm_rfqs" DROP COLUMN "office_source";
  ALTER TABLE "crm_rfqs" DROP COLUMN "attribution_gclid";
  ALTER TABLE "crm_rfqs" DROP COLUMN "attribution_gbraid";
  ALTER TABLE "crm_rfqs" DROP COLUMN "attribution_wbraid";
  ALTER TABLE "crm_rfqs" DROP COLUMN "attribution_ga_client_id";
  ALTER TABLE "crm_rfqs" DROP COLUMN "attribution_landing_page";
  ALTER TABLE "crm_rfqs" DROP COLUMN "attribution_referrer";
  DROP TYPE "public"."enum_users_crm_office";
  DROP TYPE "public"."enum_users_time_zone";
  DROP TYPE "public"."enum_crm_rfqs_office";
  DROP TYPE "public"."enum_crm_rfqs_office_source";
  DROP TYPE "public"."enum_crm_office_settings_routing_overrides_office";
  DROP TYPE "public"."enum_crm_office_settings_holidays_office";`)
}
