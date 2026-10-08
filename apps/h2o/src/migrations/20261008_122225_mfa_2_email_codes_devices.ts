import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * MFA-2 (additive, reversible): four hidden/admin columns on users (send budget, last send, admin "sign out all
 * devices"), plus two plain tables owned by src/auth/mfa (not Payload collections): hashed emailed codes (bound to the
 * login attempt `sid` and a `purpose`) and remembered devices. Both hold digests only (never a code or cookie token).
 * Down drops exactly what up adds.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ADD COLUMN "mfa_devices_clear" boolean DEFAULT false;
  ALTER TABLE "users" ADD COLUMN "mfa_email_sends" numeric;
  ALTER TABLE "users" ADD COLUMN "mfa_email_window_start" timestamp(3) with time zone;
  ALTER TABLE "users" ADD COLUMN "mfa_email_last_sent" timestamp(3) with time zone;
  CREATE TABLE "mfa_email_codes" (
    "id" bigserial PRIMARY KEY,
    "user_id" text NOT NULL,
    "sid" text NOT NULL,
    "purpose" text NOT NULL,
    "code_hash" text NOT NULL,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "used_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone NOT NULL DEFAULT now()
  );
  CREATE INDEX "mfa_email_codes_user_idx" ON "mfa_email_codes" ("user_id", "used_at");
  CREATE INDEX "mfa_email_codes_expires_idx" ON "mfa_email_codes" ("expires_at");
  CREATE TABLE "mfa_trusted_devices" (
    "id" uuid PRIMARY KEY,
    "user_id" text NOT NULL,
    "label" text,
    "token_hash" text NOT NULL,
    "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
    "last_used_at" timestamp(3) with time zone,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "revoked_at" timestamp(3) with time zone
  );
  CREATE INDEX "mfa_trusted_devices_user_idx" ON "mfa_trusted_devices" ("user_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "mfa_trusted_devices";
  DROP TABLE "mfa_email_codes";
  ALTER TABLE "users" DROP COLUMN "mfa_devices_clear";
  ALTER TABLE "users" DROP COLUMN "mfa_email_sends";
  ALTER TABLE "users" DROP COLUMN "mfa_email_window_start";
  ALTER TABLE "users" DROP COLUMN "mfa_email_last_sent";`)
}
