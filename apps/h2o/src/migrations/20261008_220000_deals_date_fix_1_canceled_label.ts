import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * DATE-FIX-1 (L08, data only, no schema change): the CRM uses US English, so the seeded deal stage label "Cancelled" becomes
 * "Canceled". Only a row still exactly as seeded is touched; a label an admin has already edited is left alone. The stage
 * key (CANCELLED) is an internal value and does not change. Down puts the old wording back on the same condition.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "crm_deal_stages" SET "label" = 'Canceled'
    WHERE "key" = 'CANCELLED'::"public"."enum_crm_deal_stages_key" AND "label" = 'Cancelled';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "crm_deal_stages" SET "label" = 'Cancelled'
    WHERE "key" = 'CANCELLED'::"public"."enum_crm_deal_stages_key" AND "label" = 'Canceled';`)
}
