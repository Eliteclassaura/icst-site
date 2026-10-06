import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
import { addressQualityOf } from '../crm/address-quality'
import { deriveCountry } from '../crm/countries'
import { deriveType } from '../crm/inquiry-type'

/**
 * Wave 1 facets (owner request + CT ERS readiness, 2026-10-05). Additive: new enums, columns and indexes.
 *   - RFQs: derived country and type (the RFQ hook derives them on every write). The backfill below fills **only** these
 *     new columns on existing rows, with the same derivation, and logs counts only.
 *   - Contacts: `country_source` (how a country is known: submitted, imported or inferred). New column, no backfill.
 *   - Contacts and accounts: `relationship_basis` + `relationship_basis_batch` (owner-attested batch evidence). New, no backfill.
 *   - Contacts: `address_quality` (CT spot-check ruling: own domain, disposable inbox, provider typo, spam pattern). The
 *     backfill fills **only** this new column for existing contacts whose domain is own / disposable / a typo.
 *   - Identity reviews: the additive enum values GENERIC_SHARED_INBOX (E1.3 AR-007) and SUSPECT_ADDRESS_DOMAIN.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_accounts_relationship_basis" AS ENUM('OWNER_ATTESTED_BATCH');
  CREATE TYPE "public"."enum_crm_contacts_relationship_basis" AS ENUM('OWNER_ATTESTED_BATCH');
  CREATE TYPE "public"."enum_crm_contacts_country_source" AS ENUM('SUBMITTED', 'IMPORTED', 'PHONE_INFERRED', 'EMAIL_CCTLD_INFERRED');
  CREATE TYPE "public"."enum_crm_contacts_address_quality" AS ENUM('SUSPECT_TYPO', 'DISPOSABLE', 'SPAM_PATTERN', 'INTERNAL');
  CREATE TYPE "public"."enum_crm_rfqs_country_source" AS ENUM('SUBMITTED', 'DESTINATION_ANSWER', 'PHONE_INFERRED', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_rfqs_inquiry_type" AS ENUM('PARTS', 'NEW_TOWER', 'REPAIR_SERVICE', 'OTHER', 'UNKNOWN');
  CREATE TYPE "public"."enum_crm_rfqs_inquiry_type_source" AS ENUM('STAFF_MOTION', 'CUSTOMER_INTEREST', 'NONE');
  ALTER TYPE "public"."enum_crm_identity_reviews_reason" ADD VALUE 'GENERIC_SHARED_INBOX' BEFORE 'OTHER';
  ALTER TYPE "public"."enum_crm_identity_reviews_reason" ADD VALUE 'SUSPECT_ADDRESS_DOMAIN' BEFORE 'OTHER';
  ALTER TABLE "crm_accounts" ADD COLUMN "relationship_basis" "enum_crm_accounts_relationship_basis";
  ALTER TABLE "crm_accounts" ADD COLUMN "relationship_basis_batch" varchar;
  ALTER TABLE "crm_contacts" ADD COLUMN "relationship_basis" "enum_crm_contacts_relationship_basis";
  ALTER TABLE "crm_contacts" ADD COLUMN "relationship_basis_batch" varchar;
  ALTER TABLE "crm_contacts" ADD COLUMN "country_source" "enum_crm_contacts_country_source";
  ALTER TABLE "crm_contacts" ADD COLUMN "address_quality" "enum_crm_contacts_address_quality";
  ALTER TABLE "crm_rfqs" ADD COLUMN "country_code" varchar;
  ALTER TABLE "crm_rfqs" ADD COLUMN "country_source" "enum_crm_rfqs_country_source";
  ALTER TABLE "crm_rfqs" ADD COLUMN "inquiry_type" "enum_crm_rfqs_inquiry_type";
  ALTER TABLE "crm_rfqs" ADD COLUMN "inquiry_type_source" "enum_crm_rfqs_inquiry_type_source";
  CREATE INDEX "crm_accounts_relationship_basis_idx" ON "crm_accounts" USING btree ("relationship_basis");
  CREATE INDEX "crm_accounts_relationship_basis_batch_idx" ON "crm_accounts" USING btree ("relationship_basis_batch");
  CREATE INDEX "crm_contacts_relationship_basis_idx" ON "crm_contacts" USING btree ("relationship_basis");
  CREATE INDEX "crm_contacts_relationship_basis_batch_idx" ON "crm_contacts" USING btree ("relationship_basis_batch");
  CREATE INDEX "crm_contacts_address_quality_idx" ON "crm_contacts" USING btree ("address_quality");
  CREATE INDEX "crm_rfqs_country_code_idx" ON "crm_rfqs" USING btree ("country_code");
  CREATE INDEX "crm_rfqs_inquiry_type_idx" ON "crm_rfqs" USING btree ("inquiry_type");`)

  const rows = (await db.execute(
    sql`SELECT "id", "motion", "submitted_country_code", "submitted_phone", "submitted_other_answers" FROM "crm_rfqs"`,
  )) as unknown as { rows: Array<Record<string, unknown>> }
  const counts: Record<string, number> = {}
  for (const r of rows.rows) {
    const other = (r.submitted_other_answers && typeof r.submitted_other_answers === 'object' ? r.submitted_other_answers : {}) as Record<string, unknown>
    const c = deriveCountry({ submittedCountry: r.submitted_country_code, destination: other.destination_country, phone: r.submitted_phone })
    const t = deriveType({ motion: r.motion, interest: other.interest })
    await db.execute(sql`UPDATE "crm_rfqs" SET "country_code" = ${c.code}, "country_source" = ${c.source}, "inquiry_type" = ${t.type}, "inquiry_type_source" = ${t.source} WHERE "id" = ${r.id}`)
    counts[`country:${c.source}`] = (counts[`country:${c.source}`] ?? 0) + 1
    counts[`type:${t.type}`] = (counts[`type:${t.type}`] ?? 0) + 1
  }
  const contacts = (await db.execute(sql`SELECT "id", "email_domain" FROM "crm_contacts" WHERE "address_quality" IS NULL`)) as unknown as {
    rows: Array<Record<string, unknown>>
  }
  for (const c of contacts.rows) {
    const q = addressQualityOf(typeof c.email_domain === 'string' ? c.email_domain : null)
    if (!q) continue
    await db.execute(sql`UPDATE "crm_contacts" SET "address_quality" = ${q} WHERE "id" = ${c.id}`)
    counts[`address:${q}`] = (counts[`address:${q}`] ?? 0) + 1
  }
  payload.logger.info({ msg: 'crm_wave1_facets backfill', rows: rows.rows.length, contacts: contacts.rows.length, ...counts })
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_identity_reviews" ALTER COLUMN "reason" SET DATA TYPE text;
  DROP TYPE "public"."enum_crm_identity_reviews_reason";
  CREATE TYPE "public"."enum_crm_identity_reviews_reason" AS ENUM('EMAIL_MATCH_NAME_MISMATCH', 'SAME_NAME_DIFFERENT_EMAIL', 'VERIFIED_DOMAIN_ON_MULTIPLE_ACCOUNTS', 'COMPANY_NAME_MATCH_UNVERIFIED', 'CONTACT_ACCOUNT_CONFLICT', 'POSSIBLE_DUPLICATE_SUBMISSION', 'INTAKE_CONFLICTING_PAYLOAD', 'OTHER');
  ALTER TABLE "crm_identity_reviews" ALTER COLUMN "reason" SET DATA TYPE "public"."enum_crm_identity_reviews_reason" USING "reason"::"public"."enum_crm_identity_reviews_reason";
  DROP INDEX "crm_accounts_relationship_basis_idx";
  DROP INDEX "crm_accounts_relationship_basis_batch_idx";
  DROP INDEX "crm_contacts_relationship_basis_idx";
  DROP INDEX "crm_contacts_relationship_basis_batch_idx";
  DROP INDEX "crm_contacts_address_quality_idx";
  DROP INDEX "crm_rfqs_country_code_idx";
  DROP INDEX "crm_rfqs_inquiry_type_idx";
  ALTER TABLE "crm_accounts" DROP COLUMN "relationship_basis";
  ALTER TABLE "crm_accounts" DROP COLUMN "relationship_basis_batch";
  ALTER TABLE "crm_contacts" DROP COLUMN "relationship_basis";
  ALTER TABLE "crm_contacts" DROP COLUMN "relationship_basis_batch";
  ALTER TABLE "crm_contacts" DROP COLUMN "country_source";
  ALTER TABLE "crm_contacts" DROP COLUMN "address_quality";
  ALTER TABLE "crm_rfqs" DROP COLUMN "country_code";
  ALTER TABLE "crm_rfqs" DROP COLUMN "country_source";
  ALTER TABLE "crm_rfqs" DROP COLUMN "inquiry_type";
  ALTER TABLE "crm_rfqs" DROP COLUMN "inquiry_type_source";
  DROP TYPE "public"."enum_crm_accounts_relationship_basis";
  DROP TYPE "public"."enum_crm_contacts_relationship_basis";
  DROP TYPE "public"."enum_crm_contacts_country_source";
  DROP TYPE "public"."enum_crm_contacts_address_quality";
  DROP TYPE "public"."enum_crm_rfqs_country_source";
  DROP TYPE "public"."enum_crm_rfqs_inquiry_type";
  DROP TYPE "public"."enum_crm_rfqs_inquiry_type_source";`)
}
