import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
import { uuidv7 } from '../crm/ids'

/**
 * OPP-1.1: seed the default deal stages in the migration, so a fresh database has them before the first read.
 * The wording and order are frozen here on purpose (a migration never follows later edits to the app's labels).
 * `ON CONFLICT ("key") DO NOTHING` makes it safe to run on a database whose stages were already created lazily by
 * OPP-1: an existing row (and any admin edit to it) is left alone. The app still creates a missing row on first read.
 */
const DEFAULT_STAGES: Array<[key: string, label: string]> = [
  ['NEW', 'New'],
  ['QUALIFYING', 'Qualifying'],
  ['QUALIFIED', 'Qualified'],
  ['PROPOSAL', 'Proposal'],
  ['NEGOTIATION', 'Negotiation'],
  ['DELAYED', 'Delayed'],
  ['WON', 'Won'],
  ['LOST', 'Lost'],
  ['CANCELLED', 'Cancelled'],
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [i, [key, label]] of DEFAULT_STAGES.entries()) {
    await db.execute(sql`
      INSERT INTO "crm_deal_stages" ("canonical_id", "key", "label", "sort_order", "enabled")
      VALUES (${uuidv7()}, ${key}::"public"."enum_crm_deal_stages_key", ${label}, ${i * 10}, true)
      ON CONFLICT ("key") DO NOTHING;`)
  }
}

/** Removes the default rows that are still exactly as seeded (an admin-edited row is left; the table itself goes with OPP-1's down). */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const [i, [key, label]] of DEFAULT_STAGES.entries()) {
    await db.execute(sql`
      DELETE FROM "crm_deal_stages"
      WHERE "key" = ${key}::"public"."enum_crm_deal_stages_key" AND "label" = ${label} AND "sort_order" = ${i * 10} AND "enabled" = true;`)
  }
}
