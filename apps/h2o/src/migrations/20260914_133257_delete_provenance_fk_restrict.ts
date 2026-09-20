import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * H2O 2A.3 R2.3-R1 — DELETE-PROVENANCE DATABASE BACKSTOP
 *
 * AUTHORITY
 *   Control Tower ruling: H2O_DELETE_PROVENANCE_FK_RESTRICT = AUTHORIZED.
 *   This migration is the single authorized database-schema change. It exists because the
 *   application-layer `beforeDelete` guard (`forbidReferencedOriginalDelete`) cannot close the
 *   delete/insert race on its own: Payload 3.88.0 issues a plain non-locking SELECT in its find
 *   path, so under READ COMMITTED a derivative row can be inserted after the guard's reference
 *   check has already returned zero rows and before the delete commits.
 *
 * WHAT THIS CHANGES
 *   Exactly one thing: the DELETE action of the self-referential foreign key
 *     product_media.original_asset_id -> product_media.id
 *   named `product_media_original_asset_id_product_media_id_fk`, from
 *     ON DELETE SET NULL  ->  ON DELETE RESTRICT
 *   The UPDATE action (`ON UPDATE NO ACTION`), the constraint name, the referencing and
 *   referenced columns, the referenced table, deferrability and validity are all preserved.
 *
 * WHY RESTRICT AND NOT NO ACTION
 *   RESTRICT is checked immediately and is not deferrable, so it cannot be postponed to commit
 *   time by a `SET CONSTRAINTS ... DEFERRED`. NO ACTION would be semantically equivalent here
 *   today but weaker in principle. RESTRICT takes a row lock on the referenced row for the
 *   duration of the referencing insert, which is what serialises the race in the correct
 *   direction: a concurrent `INSERT` naming this row as its original blocks the `DELETE`, and
 *   whichever transaction commits second fails rather than silently severing provenance.
 *
 * WHAT THIS DOES NOT DO — NO DATA REWRITE
 *   No row is inserted, updated or deleted by this migration. No `original_asset_id` value is
 *   nulled, re-pointed or recreated. No `image_state` value is touched. No media binary is
 *   touched. No identifier is rewritten. `ALTER TABLE ... ADD CONSTRAINT` re-validates existing
 *   rows with a read-only scan; because the same columns were already constrained by the same
 *   foreign key, that validation cannot fail on referential grounds and changes nothing.
 *
 * FAIL-CLOSED BASELINE ASSERTION
 *   Both directions verify the full identity of the constraint before touching it — name,
 *   constraint type, referencing table, referencing column, referenced table, referenced column,
 *   update action and delete action — and raise (aborting the surrounding migration transaction)
 *   if any of it differs from what is expected. There is no broad `IF EXISTS` swallow.
 *
 *   The one enumerated tolerance, declared here for review rather than hidden: if the delete
 *   action is ALREADY `RESTRICT` and every other attribute matches, UP emits a NOTICE and makes
 *   no change, and DOWN behaves symmetrically for `SET NULL`. This keeps the migration
 *   re-entrant against a database where the constraint was already brought to the target state
 *   out of band. It is not a drift swallow: the target state is asserted exactly, and every
 *   other deviation still aborts.
 *
 * LOCKING
 *   `DROP CONSTRAINT` / `ADD CONSTRAINT` take ACCESS EXCLUSIVE on `product_media` (and, because
 *   the key is self-referential, that is also the referenced side). The migration runs inside the
 *   single transaction Payload opens per migration file, so the table is briefly unavailable.
 *   Schedule accordingly.
 *
 * SCHEMA SNAPSHOT / GENERATED-MIGRATION DRIFT
 *   This migration is intentionally shipped WITHOUT a paired `.json` drizzle snapshot.
 *   `buildCreateMigration` (@payloadcms/drizzle 3.88.0, dist/utilities/buildCreateMigration.js:57)
 *   selects the lexicographically greatest `.json` in the migrations directory as the "before"
 *   snapshot and diffs it against the schema generated from the Payload config. The Payload
 *   config generates `ON DELETE set null` for this relationship, and the newest snapshot
 *   (20260913_012440.json) also records `set null`; before and after therefore agree and no
 *   revert statement is generated. Writing a snapshot that recorded RESTRICT would invert that
 *   and cause the next `migrate:create` to emit a migration reverting this FK to SET NULL.
 *
 *   If a future generated migration is nevertheless observed to contain a statement dropping or
 *   re-adding `product_media_original_asset_id_product_media_id_fk`, that migration must NOT be
 *   applied. STOP and report: H2O_DELETE_PROVENANCE_FK_SCHEMA_DRIFT.
 *   `verify/migration-contract.test.mjs` enforces this statically over every migration in the
 *   directory.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
DO $$
DECLARE
  v_oid              oid;
  v_contype          "char";
  v_confdeltype      "char";
  v_confupdtype      "char";
  v_condeferrable    boolean;
  v_convalidated     boolean;
  v_conkey           int2[];
  v_confkey          int2[];
  v_confrelid        oid;
  v_expected_conkey  int2[];
  v_expected_confkey int2[];
  v_after_deltype    "char";
  v_after_updtype    "char";
BEGIN
  SELECT ARRAY[a.attnum] INTO v_expected_conkey
    FROM pg_attribute a
   WHERE a.attrelid = 'public.product_media'::regclass
     AND a.attname = 'original_asset_id'
     AND NOT a.attisdropped;

  SELECT ARRAY[a.attnum] INTO v_expected_confkey
    FROM pg_attribute a
   WHERE a.attrelid = 'public.product_media'::regclass
     AND a.attname = 'id'
     AND NOT a.attisdropped;

  IF v_expected_conkey IS NULL OR v_expected_confkey IS NULL THEN
    RAISE EXCEPTION
      'H2O_DELETE_PROVENANCE_BASELINE_DRIFT: public.product_media is missing original_asset_id and/or id; refusing to alter delete provenance.';
  END IF;

  SELECT c.oid, c.contype, c.confdeltype, c.confupdtype, c.condeferrable, c.convalidated,
         c.conkey, c.confkey, c.confrelid
    INTO v_oid, v_contype, v_confdeltype, v_confupdtype, v_condeferrable, v_convalidated,
         v_conkey, v_confkey, v_confrelid
    FROM pg_constraint c
   WHERE c.conname = 'product_media_original_asset_id_product_media_id_fk'
     AND c.conrelid = 'public.product_media'::regclass;

  IF v_oid IS NULL THEN
    RAISE EXCEPTION
      'H2O_DELETE_PROVENANCE_BASELINE_DRIFT: constraint product_media_original_asset_id_product_media_id_fk is absent on public.product_media; refusing to continue.';
  END IF;

  IF v_contype <> 'f' THEN
    RAISE EXCEPTION
      'H2O_DELETE_PROVENANCE_BASELINE_DRIFT: product_media_original_asset_id_product_media_id_fk has contype %, expected f.', v_contype;
  END IF;

  IF v_confrelid <> 'public.product_media'::regclass THEN
    RAISE EXCEPTION
      'H2O_DELETE_PROVENANCE_BASELINE_DRIFT: product_media_original_asset_id_product_media_id_fk references %, expected public.product_media.', v_confrelid::regclass;
  END IF;

  IF v_conkey <> v_expected_conkey OR v_confkey <> v_expected_confkey THEN
    RAISE EXCEPTION
      'H2O_DELETE_PROVENANCE_BASELINE_DRIFT: product_media_original_asset_id_product_media_id_fk column mapping is % -> %, expected % -> %.',
      v_conkey, v_confkey, v_expected_conkey, v_expected_confkey;
  END IF;

  IF v_condeferrable THEN
    RAISE EXCEPTION
      'H2O_DELETE_PROVENANCE_BASELINE_DRIFT: product_media_original_asset_id_product_media_id_fk is DEFERRABLE, expected NOT DEFERRABLE.';
  END IF;

  IF NOT v_convalidated THEN
    RAISE EXCEPTION
      'H2O_DELETE_PROVENANCE_BASELINE_DRIFT: product_media_original_asset_id_product_media_id_fk is NOT VALID, expected VALIDATED.';
  END IF;

  IF v_confupdtype <> 'a' THEN
    RAISE EXCEPTION
      'H2O_DELETE_PROVENANCE_BASELINE_DRIFT: product_media_original_asset_id_product_media_id_fk has ON UPDATE confupdtype %, expected a (NO ACTION).', v_confupdtype;
  END IF;

  IF v_confdeltype = 'r' THEN
    RAISE NOTICE
      'H2O_DELETE_PROVENANCE_ALREADY_RESTRICT: product_media_original_asset_id_product_media_id_fk is already ON DELETE RESTRICT with a matching definition; no change made.';
    RETURN;
  END IF;

  IF v_confdeltype <> 'n' THEN
    RAISE EXCEPTION
      'H2O_DELETE_PROVENANCE_BASELINE_DRIFT: product_media_original_asset_id_product_media_id_fk has ON DELETE confdeltype %, expected n (SET NULL) or r (RESTRICT).', v_confdeltype;
  END IF;

  ALTER TABLE "public"."product_media"
    DROP CONSTRAINT "product_media_original_asset_id_product_media_id_fk";

  ALTER TABLE "public"."product_media"
    ADD CONSTRAINT "product_media_original_asset_id_product_media_id_fk"
    FOREIGN KEY ("original_asset_id") REFERENCES "public"."product_media"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION;

  SELECT c.confdeltype, c.confupdtype
    INTO v_after_deltype, v_after_updtype
    FROM pg_constraint c
   WHERE c.conname = 'product_media_original_asset_id_product_media_id_fk'
     AND c.conrelid = 'public.product_media'::regclass;

  IF v_after_deltype IS DISTINCT FROM 'r' OR v_after_updtype IS DISTINCT FROM 'a' THEN
    RAISE EXCEPTION
      'H2O_DELETE_PROVENANCE_POSTCONDITION_FAILED: after ALTER, confdeltype=% confupdtype=%, expected r / a.',
      v_after_deltype, v_after_updtype;
  END IF;

  RAISE NOTICE
    'H2O_DELETE_PROVENANCE_FK_RESTRICT_APPLIED: product_media_original_asset_id_product_media_id_fk is now ON DELETE RESTRICT ON UPDATE NO ACTION.';
END
$$;`)
}

/**
 * DOWN restores the exact pre-migration constraint definition (ON DELETE SET NULL,
 * ON UPDATE NO ACTION).
 *
 * This is rollback mechanics only. It does NOT mean SET NULL is safe. Rolling this migration
 * back re-opens ADV-PROV5: deleting an ORIGINAL_VERIFIED asset that is still referenced will
 * once again silently null the derivative's `original_asset` and destroy provenance, and the
 * application-layer guard alone cannot prevent it under concurrency.
 */
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
DO $$
DECLARE
  v_oid              oid;
  v_contype          "char";
  v_confdeltype      "char";
  v_confupdtype      "char";
  v_conkey           int2[];
  v_confkey          int2[];
  v_confrelid        oid;
  v_expected_conkey  int2[];
  v_expected_confkey int2[];
  v_after_deltype    "char";
  v_after_updtype    "char";
BEGIN
  SELECT ARRAY[a.attnum] INTO v_expected_conkey
    FROM pg_attribute a
   WHERE a.attrelid = 'public.product_media'::regclass
     AND a.attname = 'original_asset_id'
     AND NOT a.attisdropped;

  SELECT ARRAY[a.attnum] INTO v_expected_confkey
    FROM pg_attribute a
   WHERE a.attrelid = 'public.product_media'::regclass
     AND a.attname = 'id'
     AND NOT a.attisdropped;

  IF v_expected_conkey IS NULL OR v_expected_confkey IS NULL THEN
    RAISE EXCEPTION
      'H2O_DELETE_PROVENANCE_ROLLBACK_DRIFT: public.product_media is missing original_asset_id and/or id; refusing to roll back.';
  END IF;

  SELECT c.oid, c.contype, c.confdeltype, c.confupdtype, c.conkey, c.confkey, c.confrelid
    INTO v_oid, v_contype, v_confdeltype, v_confupdtype, v_conkey, v_confkey, v_confrelid
    FROM pg_constraint c
   WHERE c.conname = 'product_media_original_asset_id_product_media_id_fk'
     AND c.conrelid = 'public.product_media'::regclass;

  IF v_oid IS NULL THEN
    RAISE EXCEPTION
      'H2O_DELETE_PROVENANCE_ROLLBACK_DRIFT: constraint product_media_original_asset_id_product_media_id_fk is absent on public.product_media; refusing to roll back.';
  END IF;

  IF v_contype <> 'f'
     OR v_confrelid <> 'public.product_media'::regclass
     OR v_conkey <> v_expected_conkey
     OR v_confkey <> v_expected_confkey
     OR v_confupdtype <> 'a' THEN
    RAISE EXCEPTION
      'H2O_DELETE_PROVENANCE_ROLLBACK_DRIFT: product_media_original_asset_id_product_media_id_fk does not match the definition this migration created; refusing to roll back.';
  END IF;

  IF v_confdeltype = 'n' THEN
    RAISE NOTICE
      'H2O_DELETE_PROVENANCE_ALREADY_SET_NULL: product_media_original_asset_id_product_media_id_fk is already ON DELETE SET NULL; no change made.';
    RETURN;
  END IF;

  IF v_confdeltype <> 'r' THEN
    RAISE EXCEPTION
      'H2O_DELETE_PROVENANCE_ROLLBACK_DRIFT: product_media_original_asset_id_product_media_id_fk has ON DELETE confdeltype %, expected r (RESTRICT) or n (SET NULL).', v_confdeltype;
  END IF;

  ALTER TABLE "public"."product_media"
    DROP CONSTRAINT "product_media_original_asset_id_product_media_id_fk";

  ALTER TABLE "public"."product_media"
    ADD CONSTRAINT "product_media_original_asset_id_product_media_id_fk"
    FOREIGN KEY ("original_asset_id") REFERENCES "public"."product_media"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;

  SELECT c.confdeltype, c.confupdtype
    INTO v_after_deltype, v_after_updtype
    FROM pg_constraint c
   WHERE c.conname = 'product_media_original_asset_id_product_media_id_fk'
     AND c.conrelid = 'public.product_media'::regclass;

  IF v_after_deltype IS DISTINCT FROM 'n' OR v_after_updtype IS DISTINCT FROM 'a' THEN
    RAISE EXCEPTION
      'H2O_DELETE_PROVENANCE_ROLLBACK_POSTCONDITION_FAILED: after ALTER, confdeltype=% confupdtype=%, expected n / a.',
      v_after_deltype, v_after_updtype;
  END IF;

  RAISE NOTICE
    'H2O_DELETE_PROVENANCE_FK_SET_NULL_RESTORED: product_media_original_asset_id_product_media_id_fk is back to ON DELETE SET NULL ON UPDATE NO ACTION. Provenance is no longer protected at the database layer.';
END
$$;`)
}
