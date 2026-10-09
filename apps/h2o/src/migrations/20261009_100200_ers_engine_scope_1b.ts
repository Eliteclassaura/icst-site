import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Backfill for rows that exist before this change (every one is an inquiry response). Idempotent (only rows with no
 * identity yet), one statement, no row is deleted or moved: each row keeps its status and history. The new unique key
 * only lengthens the old one (sequence:contact + purpose, scope, cycle), so it cannot collide. Exported so a test can run
 * it against rows made to look legacy.
 */
export const BACKFILL_SQL = `
UPDATE "crm_enrollments" SET
  "scope_kind" = 'RFQ',
  "scope_ref" = "rfq_id"::text,
  "scope_event_ref" = "rfq_id"::text,
  "identity_base" = "sequence_id"::text || ':' || "contact_id"::text || ':RFQ_RESPONSE:RFQ:' || "rfq_id"::text,
  "coalesce_key" = "sequence_id"::text || ':' || "contact_id"::text || ':RFQ_RESPONSE:RFQ:' || "rfq_id"::text || ':1',
  "cycle" = 1,
  "content_version" = (SELECT v."definition_hash" FROM "crm_sequence_versions" v WHERE v."id" = "crm_enrollments"."version_id")
WHERE "identity_base" IS NULL AND "rfq_id" IS NOT NULL`

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_sequences_purpose" AS ENUM('RFQ_RESPONSE', 'QUOTE_FOLLOWUP', 'RELATIONSHIP', 'COHORT', 'PUBLICATION');
  CREATE TYPE "public"."enum_crm_enrollments_purpose" AS ENUM('RFQ_RESPONSE', 'QUOTE_FOLLOWUP', 'RELATIONSHIP', 'COHORT', 'PUBLICATION');
  CREATE TYPE "public"."enum_crm_enrollments_scope_kind" AS ENUM('RFQ', 'DEAL', 'ACCOUNT', 'LIST', 'PUBLICATION_SLOT');
  ALTER TYPE "public"."enum_crm_enrollments_enrolled_via" ADD VALUE 'RULE';
  ALTER TYPE "public"."enum_crm_enrollments_enrolled_via" ADD VALUE 'PUBLICATION';
  ALTER TYPE "public"."enum_crm_enrollments_exit_reason" ADD VALUE 'MISSED';
  ALTER TABLE "crm_enrollments" ALTER COLUMN "rfq_id" DROP NOT NULL;
  ALTER TABLE "crm_sequences" ADD COLUMN "purpose" "enum_crm_sequences_purpose" DEFAULT 'RFQ_RESPONSE' NOT NULL;
  ALTER TABLE "crm_enrollments" ADD COLUMN "identity_base" varchar;
  ALTER TABLE "crm_enrollments" ADD COLUMN "purpose" "enum_crm_enrollments_purpose" DEFAULT 'RFQ_RESPONSE' NOT NULL;
  ALTER TABLE "crm_enrollments" ADD COLUMN "scope_kind" "enum_crm_enrollments_scope_kind";
  ALTER TABLE "crm_enrollments" ADD COLUMN "scope_ref" varchar;
  ALTER TABLE "crm_enrollments" ADD COLUMN "scope_event_ref" varchar;
  ALTER TABLE "crm_enrollments" ADD COLUMN "cycle" numeric DEFAULT 1 NOT NULL;
  ALTER TABLE "crm_enrollments" ADD COLUMN "content_version" varchar;
  ${sql.raw(BACKFILL_SQL)};
  CREATE INDEX "crm_sequences_purpose_idx" ON "crm_sequences" USING btree ("purpose");
  CREATE INDEX "crm_enrollments_identity_base_idx" ON "crm_enrollments" USING btree ("identity_base");
  CREATE INDEX "crm_enrollments_purpose_idx" ON "crm_enrollments" USING btree ("purpose");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Refuse (changing nothing) when going back would lose information: an enrollment without an inquiry, a non-response
  // purpose, a value the old enums do not have, or two enrollments of one contact in one sequence (a later cycle).
  await db.execute(sql`
  DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM "crm_enrollments" WHERE "rfq_id" IS NULL OR "purpose" <> 'RFQ_RESPONSE' OR "enrolled_via" IN ('RULE', 'PUBLICATION') OR "exit_reason" = 'MISSED') THEN
      RAISE EXCEPTION 'Cannot go back: some enrollments have no inquiry, another purpose, or a value the old schema lacks.';
    END IF;
    IF EXISTS (SELECT 1 FROM "crm_enrollments" GROUP BY "sequence_id", "contact_id" HAVING count(*) > 1) THEN
      RAISE EXCEPTION 'Cannot go back: a contact has more than one enrollment in a sequence.';
    END IF;
  END $$;
  UPDATE "crm_enrollments" SET "coalesce_key" = "sequence_id"::text || ':' || "contact_id"::text;`)
  await db.execute(sql`
   ALTER TABLE "crm_enrollments" ALTER COLUMN "enrolled_via" SET DATA TYPE text;
  DROP TYPE IF EXISTS "public"."enum_crm_enrollments_enrolled_via";
  CREATE TYPE "public"."enum_crm_enrollments_enrolled_via" AS ENUM('MANUAL', 'SAVED_VIEW');
  ALTER TABLE "crm_enrollments" ALTER COLUMN "enrolled_via" SET DATA TYPE "public"."enum_crm_enrollments_enrolled_via" USING "enrolled_via"::"public"."enum_crm_enrollments_enrolled_via";
  ALTER TABLE "crm_enrollments" ALTER COLUMN "exit_reason" SET DATA TYPE text;
  DROP TYPE IF EXISTS "public"."enum_crm_enrollments_exit_reason";
  CREATE TYPE "public"."enum_crm_enrollments_exit_reason" AS ENUM('REPLIED', 'RFQ_SUBMITTED', 'RFQ_CLOSED', 'RFQ_QUALIFIED', 'OWNER_RESPONDED', 'UNSUBSCRIBED', 'BOUNCED', 'COMPLAINT', 'SUPPRESSED', 'MANUAL_STOP');
  ALTER TABLE "crm_enrollments" ALTER COLUMN "exit_reason" SET DATA TYPE "public"."enum_crm_enrollments_exit_reason" USING "exit_reason"::"public"."enum_crm_enrollments_exit_reason";
  DROP INDEX IF EXISTS "crm_sequences_purpose_idx";
  DROP INDEX IF EXISTS "crm_enrollments_identity_base_idx";
  DROP INDEX IF EXISTS "crm_enrollments_purpose_idx";
  ALTER TABLE "crm_enrollments" ALTER COLUMN "rfq_id" SET NOT NULL;
  ALTER TABLE "crm_sequences" DROP COLUMN IF EXISTS "purpose";
  ALTER TABLE "crm_enrollments" DROP COLUMN IF EXISTS "identity_base";
  ALTER TABLE "crm_enrollments" DROP COLUMN IF EXISTS "purpose";
  ALTER TABLE "crm_enrollments" DROP COLUMN IF EXISTS "scope_kind";
  ALTER TABLE "crm_enrollments" DROP COLUMN IF EXISTS "scope_ref";
  ALTER TABLE "crm_enrollments" DROP COLUMN IF EXISTS "scope_event_ref";
  ALTER TABLE "crm_enrollments" DROP COLUMN IF EXISTS "cycle";
  ALTER TABLE "crm_enrollments" DROP COLUMN IF EXISTS "content_version";
  DROP TYPE IF EXISTS "public"."enum_crm_sequences_purpose";
  DROP TYPE IF EXISTS "public"."enum_crm_enrollments_purpose";
  DROP TYPE IF EXISTS "public"."enum_crm_enrollments_scope_kind";`)
}
