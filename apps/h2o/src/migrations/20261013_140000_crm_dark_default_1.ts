import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * CRM-DARK-DEFAULT-1 changes only the database default for future users. Existing light, dark and system values are
 * intentionally untouched, so an explicit preference continues to win.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "users" ALTER COLUMN "crm_theme" SET DEFAULT 'dark';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "users" ALTER COLUMN "crm_theme" SET DEFAULT 'system';`)
}
