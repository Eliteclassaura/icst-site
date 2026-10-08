import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_crm_theme" AS ENUM('system', 'light', 'dark');
  ALTER TABLE "users" ADD COLUMN "crm_theme" "enum_users_crm_theme" DEFAULT 'system';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DROP COLUMN "crm_theme";
  DROP TYPE "public"."enum_users_crm_theme";`)
}
