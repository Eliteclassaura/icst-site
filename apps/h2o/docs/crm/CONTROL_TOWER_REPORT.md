# CONTROL_TOWER_REPORT — H2O / ICS CRM Factory · CRM-1 Foundation · R1

`H2O_CRM_CRM1_FOUNDATION_R1_READY_FOR_CONTROL_TOWER_REVIEW`

## Identity

- **Worktree:** `/Users/sb/.agency-factory/worktrees/h2o-crm-factory`.
- **Base commit:** `f56d0d8812d8cb651235e2124aaceb57c5892c7b`, branch `h2o/crm-factory-2026-09-24`.
  - Status: **NOT_VERIFIED_BY_COMMIT_ID**. Git metadata is outside the granted folder, and no git command
    was run. The baseline was verified _by content_: `BASELINE_MANIFEST.sha256` covers 867 files.
- **Authorities:**
  - E0.1 R1, E1.1 R2, E1.2 R1, E1.3 R1, E1.4 R1 and E2 R1 all match the expected SHA-256.
  - E3 R1 had no expected hash supplied. Observed `d97f80e7…4063f`; its internal manifest is 51/51, and
    it pins E0.1–E2 at the same hashes.
  - E0 is absent from the bundle. It is superseded in substance by E0.1 R1, so this is not blocking.
  - No `DEPENDENCY_IDENTITY_BLOCKED`.

## A. Implemented

- **14 H2O-local, private Payload collections:**
  - Accounts, Contacts, Plants/Sites, Cooling Tower Assets, Opportunities, Buying-group members;
  - RFQs, RFQ items, Activities (append-only), Notes, Tasks/follow-up;
  - Suppressions (append-only do-not-email ledger), Intake events (raw verified events), Identity reviews
    (POSSIBLE_DUPLICATE queue).
- **Canonical identity.** A server-generated UUIDv7 `canonical_id` on every record. `rfq_number` is
  stable and write-once.
- **Invariants in hooks**, so they hold on REST, GraphQL and the Local API with override:
  - write-once receipt fields, append-only ledgers, delete refusal, server-owned provenance;
  - scope binding (no cross-account or cross-project links; NEW_TOWER has no asset);
  - evidence rules (asset facts, project state, buying-group verification);
  - E3 economics (UNKNOWN ≠ 0, no default currency, derived revenue truth, admin-only confirmation);
  - suppression and eligibility gates;
  - evidence-driven stage changes.
- **Typeform ingestion service.**
  - HMAC verification on raw bytes (unverified → nothing stored).
  - Quarantine for malformed, unsupported and foreign-form events.
  - Transport idempotency, business uniqueness per response, and conflicting-replay quarantine.
  - An atomic processing lease and a retry-safe, idempotent pipeline.
  - Conservative contact/account resolution with review instead of merge.
  - PII-free logging.
  - The handler is **not mounted**, and it fails closed without config or the flag.
- **PII-safe audit** of every CRM create, update and delete (enum/id transitions only) in the existing
  `audit-log`.
- **Private UI:** the Payload admin CRM group with columns, search and joins, plus a **CRM Overview** view
  and nav link. Both are role-checked server-side and always carry a non-production data label.
- **One additive migration**, regenerated types and import map, synthetic fixtures, 33 unit/static tests,
  120 DB tests, a 23-mutation discrimination harness, and 19 docs (this report included).

## B. Reused

- As-is: `users`/auth/sessions, the 6-role enum, `audit-log`, `products` (read-only relation, with
  `public_price` still admin-only), and the public Typeform adapter (contract mirrored, not imported).
- With an H2O adapter: the kernel access primitives, the audit hook (a PII-safe adapter), and the Payload
  admin (custom view).

## C. H2O-local

- 15 matrix rows (`CRM_REUSE_MATRIX.md`).
- Agency-core `contacts`/`companies`/`activities`/`tasks` were re-verified as unsuitable.
  - The contact normaliser folds aliases, which contradicts E0.1.
  - The activity enum is incompatible.
  - Registering that layer would drag in the editorial layer.

## D. Shared changes required

**None (0).** Two shared-layer observations are recorded as non-blocking in
`CRM_SHARED_CHANGE_REQUESTS.md`: O-1 alias folding, and O-2 the audit redaction set.

## E. Deferred

- Merge tooling (review states only).
- Attribution windows and credit, revenue-event ledger, quote/proposal object.
- The whole sequence/sending engine: sequences, enrollments, drafts, sends, threads, replies, sending
  identities, health, kill switch, conversation locks.
- Webhook activation and notifications.
- Legacy import, multi-tenant data plane, bulk export feature, and a separate SalesOwnership/Assignment
  entity (ownership is fields plus timeline plus audit).

## F. Tests that actually ran

- H2O `tsc` 0 and `eslint` 0. Prettier PASS.
- CRM unit/static 33/33. CRM DB 120/120, using the Local API plus the app's real REST route handlers
  against isolated synthetic Postgres.
- Discrimination 23/23 caught.
- Full H2O suite: 604 pass, and the 28 failures match the baseline by name (public media not
  transferred).
- agency-core 29/29 and `tsc` 0. syed-ai `tsc` 0.
- `next build` (CMS) exit 0.
- Migrations: create, apply, no drift, and UP→DOWN→UP with an exact schema match.
- Dev-server admin and REST runtime observations.
- `gates:scan` and `lint:css` findings are **equal to baseline** (both red at baseline, with 0 findings in
  CRM files). `skills:verify` and `versions:check` PASS.

## G. Could not run (`NOT_EXECUTED_ENVIRONMENT` → Commander)

- The 28 site tests that read `apps/h2o/public/**` binaries, and `build:public`.
- Docker/native runtime and a real browser, including accessibility.
- Any staging or production database, any live Typeform delivery, any email: `NOT_EXECUTED` by rule.

## H. Owner decisions needed

18 items in `CRM_OPEN_OWNER_INPUTS.md`, all `DEFERRED_OWNER_INPUT`. The first needed for CRM-2 is
**OI-01, the `F22cAgx3` field-ref map**.

## I. Commander-native gates required

1. Apply the source from this package to the worktree and review the diff (75 files, all under
   `apps/h2o/`).
2. `pnpm install --frozen-lockfile`, then `pnpm --filter @factory/h2o typecheck lint test`, with the full
   suite including public media.
3. `pnpm --filter @factory/h2o test:crm-db` with `H2O_CRM_TEST_DATABASE_URI` pointing at a
   Commander-created, isolated, loopback `*_test` database.
4. Native migration proof on a fresh DB and on an existing synthetic-catalog DB: no data rewrite, then
   DOWN/UP with the CRM migration as its own batch.
5. `build:cms` and `build:public`, plus a byte comparison of the public export against the pre-CRM export
   (it must be unchanged).
6. The discrimination harness against the committed tree.
7. A decision on the pre-existing baseline defects in §J.

## J. Public site changed?

**No.**

- `src/site`, `src/conversion`, `src/app/(site)`, `src/proxy.ts`, `release/**`, `content/**` and
  `public/**` are byte-identical to baseline.
- Two static tests keep it that way: no public import of `src/crm`, and a fixed copy list in the static
  renderer.

Two generated or pre-existing matters touched while doing this, both **reported rather than hidden**:

1. **`src/app/(payload)/admin/importMap.js`** was `{}` at baseline, which is stale.
   - `payload generate:importmap` adds the 2 CRM components and 15 entries the admin already referenced
     (Lexical and `CollectionCards`).
   - This is a generated admin-only file, not public.
   - Control Tower may alternatively rule it be regenerated in its own commit.
2. **The accepted migration `20260913_012440` has a generated DOWN that fails**, due to a constraint
   ordering defect. This was observed while proving rollback.
   - It was **not edited**.
   - The same defect was avoided in the CRM-1 migration by reordering its DOWN only; its UP is
     byte-identical to the generator's output.

## K. DB mutated?

- **No staging or production DB was touched.**
- The only databases written were Factory-created, throwaway synthetic Postgres databases at
  `127.0.0.1:55432`: `h2o_crm_synthetic` plus the transient `_base` and `_downtest`.
- The user's machine received only source files. The worktree's git state was not modified by any git
  command.

## L. Network / live integration activated?

**No.**

- No webhook, endpoint, Typeform, DNS, Stalwart, email or deployment action.
- The tests assert `fetch` and `sendEmail` were never called.

## M. Package

The package is `H2O_CRM_FACTORY_CRM1_FOUNDATION_2026-09-24_R1.zip`. Its bytes, SHA-256 and file count are
stated in the final return and in `PACKAGE_METADATA.json`. A package cannot contain its own hash.

## Source change boundary

| Scope                            |                                                                                                                         Files |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------: |
| H2O CRM-local files changed      | **75** (70 added, 5 modified: `package.json`, `payload.config.ts`, `payload-types.ts`, `importMap.js`, `migrations/index.ts`) |
| Agency Core files changed        |                                                                                                                         **0** |
| Syed.ai files changed            |                                                                                                                         **0** |
| Public H2O website files changed |                                                                                                                         **0** |
| Migration files added            |                                                **2** (`20260925_011109_crm1_foundation.ts` / `.json`) and `index.ts` modified |
| Test files added                 |                                         **10** (2 unit/static, 4 DB suites, DB harness and setup, fixtures, DB vitest config) |
