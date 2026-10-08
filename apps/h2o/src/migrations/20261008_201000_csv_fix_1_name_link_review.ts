import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_crm_identity_reviews_reason" ADD VALUE 'NAME_CONTAINED_LINK' BEFORE 'OTHER';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Rolling back keeps every review: the new reason becomes OTHER (the old type has no NAME_CONTAINED_LINK).
  await db.execute(sql`
   UPDATE "crm_identity_reviews" SET "reason" = 'OTHER' WHERE "reason" = 'NAME_CONTAINED_LINK';
   ALTER TABLE "crm_identity_reviews" ALTER COLUMN "reason" SET DATA TYPE text;
  DROP TYPE IF EXISTS "public"."enum_crm_identity_reviews_reason";
  CREATE TYPE "public"."enum_crm_identity_reviews_reason" AS ENUM('EMAIL_MATCH_NAME_MISMATCH', 'SAME_NAME_DIFFERENT_EMAIL', 'VERIFIED_DOMAIN_ON_MULTIPLE_ACCOUNTS', 'COMPANY_NAME_MATCH_UNVERIFIED', 'CONTACT_ACCOUNT_CONFLICT', 'POSSIBLE_DUPLICATE_SUBMISSION', 'INTAKE_CONFLICTING_PAYLOAD', 'GENERIC_SHARED_INBOX', 'SUSPECT_ADDRESS_DOMAIN', 'OTHER');
  ALTER TABLE "crm_identity_reviews" ALTER COLUMN "reason" SET DATA TYPE "public"."enum_crm_identity_reviews_reason" USING "reason"::"public"."enum_crm_identity_reviews_reason";`)
}
