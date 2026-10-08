import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * MFA-ADMIN-1 (additive, reversible): users.mfa_exempt / mfa_exempt_at (an admin turned two-factor off for a non-admin) and
 * users.security_epoch (a counter that goes up when credentials change, for later token invalidation), plus a plain table
 * owned by src/auth/mfa that keeps the reason an admin gave for each reset / turn-off / turn-on (marked applied only once the change went through). Down drops exactly this.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ADD COLUMN "mfa_exempt" boolean DEFAULT false;
  ALTER TABLE "users" ADD COLUMN "mfa_exempt_at" timestamp(3) with time zone;
  ALTER TABLE "users" ADD COLUMN "security_epoch" numeric DEFAULT 0;
  CREATE TABLE "mfa_admin_actions" (
    "id" bigserial PRIMARY KEY,
    "user_id" text NOT NULL,
    "actor_id" text NOT NULL,
    "action" text NOT NULL,
    "reason" text NOT NULL,
    "applied" boolean NOT NULL DEFAULT false,
    "created_at" timestamp(3) with time zone NOT NULL DEFAULT now()
  );
  CREATE INDEX "mfa_admin_actions_user_idx" ON "mfa_admin_actions" ("user_id", "created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "mfa_admin_actions";
  ALTER TABLE "users" DROP COLUMN "mfa_exempt";
  ALTER TABLE "users" DROP COLUMN "mfa_exempt_at";
  ALTER TABLE "users" DROP COLUMN "security_epoch";`)
}
