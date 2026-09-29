# CRM_CURRENT_STATE — H2O / ICS CRM-1, Pass 1 reconnaissance

Prepared 2026-09-24 by H2O CRM Factory (Claude). Pass 1 was completed before any CRM source was
written. Everything below was read from the worktree or the attached authorities. Nothing is assumed.

## 1. Workspace identity

| Item                        | Value                                                                                                             | How established                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Worktree                    | `/Users/sb/.agency-factory/worktrees/h2o-crm-factory`                                                             | granted folder, listed                                                                                                                          |
| `.git` pointer              | `gitdir: …/agency-site-factory-OPERATIONAL-CLEAN/.git/worktrees/h2o-crm-factory`                                  | read `.git` file                                                                                                                                |
| Branch / base commit        | `h2o/crm-factory-2026-09-24` / `f56d0d8812d8cb651235e2124aaceb57c5892c7b`                                         | **NOT_VERIFIED_BY_COMMIT_ID**. Git metadata is outside the granted folder, and no git command was run. The values rest on the Commander report. |
| Forbidden tree `…-H2O-2A1B` | not accessed                                                                                                      | —                                                                                                                                               |
| Baseline source snapshot    | 867 files (the `apps/h2o/public` and `apps/h2o/content` binaries are excluded); tarball SHA-256 `437f258e…edad18` | `BASELINE_MANIFEST.sha256` in the package                                                                                                       |
| Content text snapshot       | 1,379 text files from `apps/h2o/content`; tarball SHA-256 `9acc2042…3ec2ff`                                       | used only to run the existing H2O tests                                                                                                         |

The snapshot was copied into the Factory cloud workspace. Install, typecheck, lint and tests ran on
that copy. The worktree itself received only the final source files, which are listed in
`CHANGED_FILES.tsv`.

## 2. Toolchain (Factory workspace)

- Node `22.22.2` (the repo requires `>=22.12.0`) and pnpm `10.28.0`, via corepack.
- `pnpm install --frozen-lockfile` exited 0. The lockfile is byte-identical afterwards.
- Payload `3.88.0`, `@payloadcms/db-postgres` `3.88.0`, Next `16.3.4`, TypeScript `5.9.3`, vitest `5.0.0`.

## 3. Baseline gates, measured before any change

| Gate                                     | Result                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/h2o` `tsc --noEmit`                | exit 0                                                                                                                                                                                                                                                                                                                |
| `apps/h2o` `eslint src --max-warnings 0` | exit 0                                                                                                                                                                                                                                                                                                                |
| `apps/h2o` `vitest run`                  | 571 passed, **28 failed**. All 28 failures are `ENOENT` on `apps/h2o/public/**` binaries (517 MB), which were not transferred, plus one timeout inside the same media suite. The failing test names are recorded in `BASELINE_FAILING_TESTS.txt`. The post-change run must fail on exactly this set and nothing else. |

## 4. Repository structure relevant to CRM

- `apps/h2o/src/payload.config.ts` registers `foundationCollections` (`users`, `media`,
  `audit-log`, `citations`, `people`, `locations`, `pages`), `manufacturers`, and 8 catalog
  collections. It **does not register the agency-core CRM layer.**
  - Configuration: `push:false`, `idType:'uuid'`, `requireEnv` fail-closed on `PAYLOAD_SECRET` and
    `DATABASE_URI`, and `securityDefaults` (GraphQL disabled unless `PAYLOAD_GRAPHQL=1`, CORS/CSRF
    origin lists).
- The roles are fixed in `packages/agency-core/src/cms/access/roles.ts`: `platform-admin`,
  `client-admin`, `editor`, `search-analyst`, `sales`, `viewer`.
  - Groups: `ADMINS` = platform-admin and client-admin. `CRM_USERS` = ADMINS plus sales.
    `CONTENT_READERS` = all six roles.
  - **No `technical_reviewer` role exists.**
- Users are invite-only (`create: isAdmin`). They use DB sessions, an 8-hour token, and a lockout
  after 5 failed attempts lasting 15 minutes. Roles are writable by admins only (`adminFieldOnly`).
- Audit: the `audit-log` collection (foundation) has `read: isAdmin` and create/update/delete
  `nobody`. Its fields are `action`, `collection`, `docId`, `actor`, `actorEmail`, `ip`,
  `changedKeys`, `summary` and `detail`.
  - `auditAfterChange` redacts values only for the slugs `submissions`, `subscribers`, `contacts`,
    `leads`, `activities` and `users`. For every other slug it writes
    `summary = title ?? name ?? slug ?? email`.
  - Consequence: **a new CRM slug not in that set would leak a contact's name or email into
    `audit-log.summary`.** CRM-1 therefore writes its own PII-safe audit entries to the same
    collection and does not use `auditAfterChange` on CRM collections (see the reuse matrix).
- Existing H2O migrations: `20260912_202131`, `20260913_012440` (with its `.json` snapshot) and
  `20260914_133257_delete_provenance_fk_restrict` (hand-written, no snapshot).
- The public site is **static**. `release/prepare.mjs` copies only `src/app/(site)` (with `api/`
  filtered out), `src/site`, `src/conversion`, `content` and `public` into `.public-renderer`, and
  builds with `output:'export'`. `PAYLOAD_SECRET` and `DATABASE_URI` are deleted from the build
  environment. Any code under `src/crm/` is therefore never part of the public export.

## 5. agency-core CRM layer (`packages/agency-core/src/cms/collections/crm.ts`)

The layer contains 13 collections: `private-files`, `redirects`, `forms`, `submissions`,
`subscribers`, `companies`, `contacts`, `leads`, `activities`, `tasks`, `lead-score-rules`, `outbox`
and `rate-events`. Findings:

- **`contacts`**:
  - `email` is `unique` and required.
  - `emailNormalized` is documented as "+tag stripped, gmail dots folded". **This conflicts with
    E0.1**, whose `email_match_key` must be lowercase with "provider-specific alias collapsing
    forbidden".
  - There is a single `name` field.
  - `suppressed` is a boolean, which cannot represent E0.1's orthogonal suppression dimensions or
    reason precedence.
  - `preferences.transactional` defaults to `true`. That is an asserted state where E0.1 requires
    UNKNOWN.
- **`companies`**: `name`, a single `domain`, `industry → industries` (editorial layer),
  `location`, `notes`. There are no aliases, no domain statuses, no parent, no relationship state
  and no provenance.
- **`activities`**: create-only (update/delete `nobody`). Its type enum is web-lead oriented
  (`submission`, `email-sent`, `stage-change`, …). It has no RFQ, opportunity, site or asset
  relations.
- **`tasks`**: `lead`, `assignee`, `dueAt`, `status`. Delete is allowed to sales. There is no
  audit hook.
- **`leads`**: a single `stage` enum (`new/qualified/proposal/won/lost/nurture`) with no value,
  currency, motion or site. It is not the ICS Opportunity.
- **Registering this layer drags in** `industries` (editorial) plus redirects, forms, submissions,
  subscribers, outbox, rate-events and lead-score-rules, none of which CRM-1 needs. The
  2A.1B/boundary analysis already recorded this edge.
- **Absent entirely:** Account (as an ICS object), Plant/Site, Asset, Opportunity, RFQ, RFQItem,
  BuyingGroupMembership, Suppression (as a durable ledger), IntakeEvent, IdentityReview,
  Attribution and Assignment.

The historical findings (Contact PARTIAL, Company PARTIAL, Activity ENUM_INCOMPATIBLE, RFQ /
RFQItem / Attribution / Assignment / FollowUp absent) are **re-confirmed against current source**.

## 6. Typeform / conversion architecture (current source)

- `apps/h2o/src/conversion/config.ts` defines the approved host `form.typeform.com` and the form-id
  pattern `^[A-Za-z0-9]{6,32}$`. The form id comes from env `H2O_TYPEFORM_FORM_ID` with no default.
- `context.ts` defines `SAFE_CONTEXT_KEYS`: `product_id`, `product_slug`, `product_path`,
  `product_title`, `page_path`, `cta_placement` and `utm_source|medium|campaign|term|content`.
  The allowlist is enforced by `buildSafeContext`.
- `site/RfqMount.tsx` (product mount) sends `page_path`, `product_slug`, `product_id` and
  `cta_placement`.
  - **`product_id` is the legacy route/source number** (`routeId.split('-').at(-1)`). It is not a
    Payload `products` UUID.
  - `product_slug` is the legacy product slug.
- The content authority is `content/2d-launch-cohort/TYPEFORM_CONVERSION_MOUNT_CONTRACT.json`
  (R1.3.2). Its mounts carry only allowlisted keys. `product_detail_primary` and `sticky_floating`
  carry the product keys; all others carry `page_path` and `cta_placement`.
- `events.ts` states that `form_submitted` is a conversion, **not lead and not revenue**. This
  agrees with E3.
- There is **no webhook receiver, no signing-secret variable, no field-ref map for `F22cAgx3`, and no
  RFQ persistence anywhere in source.** The answer fields of the live form are not known to the
  Factory. They are an owner/Commander input: `TYPEFORM_FIELD_REF_MAP`.
- `site/__tests__/integration-boundary.test.ts` restricts which files may import
  `src/conversion/**`. CRM ingestion must not import the adapter. It re-declares the context-key
  allowlist and is tested for equality against the adapter's list instead.

## 7. RFQ remnants

There are no `rfq`/`rfq_number` collections or fields in source. `products.completeness_checks`
contains the enum values `RFQ_CTA`, `CRM_ROUTE` and `ATTRIBUTION` as completeness flags only.

The frozen RFQ rules come from the accepted Sprint 4P R1 `access_control_invariant` and the 2A
boundary analysis. Their full text is not in this worktree:

- create-only across REST, GraphQL and the Local API;
- no anonymous read, list, update or delete;
- uploads not enumerable;
- client fields never trusted;
- `rfq_number` stability;
- forbidden scoring inputs.

CRM-1 enforces the reconcilable subset in hooks, so the Local API with `overrideAccess` cannot
bypass it. The unavailable rule text is recorded as `RFQ_RULE_TEXT_NOT_IN_WORKTREE`, which is **not**
a conflict. Nothing in the Revenue Engine contradicts these rules.

## 8. Product entities

- `products` has a unique legacy `slug`.
- `public_price` has field access `adminFieldOnly` on create, read and update.
- `pricing-observations` is admin-only on every operation.
- RFQ items reference a product only through the source strings, plus an optional relationship
  resolved by **exact** `products.slug` match. They never carry price.

## 9. Attached authorities

| Authority   | Expected SHA-256                                                   | Observed                                                           | Internal manifest           |
| ----------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------- |
| E0.1 R1     | `7c3cd0f04f569cb8f010b280a10cf37c478cc9bd19e1027426a2c928e16a9cc8` | match                                                              | `MANIFEST_SHA256.txt` 43/43 |
| E1.1 R2     | `9988b2f305a1d19382fe8ad1d7f6cb99c17bea96a701713480e5943f6819f562` | match                                                              | 26/26                       |
| E1.2 R1     | `c8763e1b08706f775d5e17b7aa6bbf224da6b1543786175e48ac4a3baef78a9f` | match                                                              | 41/41                       |
| E1.3 R1     | `e0ba01c5cfc2309f323ab4097a1c3f3e99e9b42ff9b92f96b4577cdba8302fc8` | match                                                              | 46/46                       |
| E1.4 R1     | `d0b7a5be9896a0cf6a735c274cb558db3b6a47e7fea3bed1fdf34ec5d2ae37fe` | match                                                              | 57/57                       |
| E2 R1       | `1ae52d9d14d208616f0c01335882357766f2e3dd80a6394357b9c69d7e77c413` | match                                                              | 56/56                       |
| E3 R1       | _(none supplied)_                                                  | `d97f80e7ae9445aeb5f963e37ca9f0e4ccc4e846ca8c119e60fde9fd4943063f` | 51/51                       |
| E0 baseline | _(none supplied)_                                                  | **not in the bundle**                                              | —                           |

Bundle SHA-256: `dff1358752323c0343d7b938729a26518ad106b08c8848841121e0ccd010b302`.

- E3 declares its frozen dependencies E0.1 through E2 at exactly the hashes above.
- E0 (strategy baseline) is not present. Its data-model content is restated and superseded by
  E0.1 R1 (E0.1 R1 §"What remains accepted"), so no CRM-1 decision depends on E0 alone. Status:
  `E0_ABSENT_NOT_BLOCKING`.
- No `DEPENDENCY_IDENTITY_BLOCKED` condition was found.

## 10. Reconciliations made in Pass 1 (not conflicts)

1. **Opportunity stage.** E0.1 `opportunity.schema.json` defines the commercial `stage`
   (`NEW, QUALIFYING, QUALIFIED, PROPOSAL, NEGOTIATION, DELAYED, WON, LOST, CANCELLED`). E1.4 uses
   a separate `project_stage` (`EARLY_SIGNAL … NO_CURRENT_DECISION`) and `project_states` for
   eligibility. These are **two dimensions, not competing enums.** CRM-1 stores both: `stage` is
   frozen from E0.1, and `project_stage` is a nullable E1.4 taxonomy.
2. **Motion.**
   - E0.1 `motion` has 7 values (`REBUILD_REPLACEMENT`).
   - E1.4 `project_type` uses `NEW_TOWER`, `MAJOR_REBUILD_REPLACEMENT` and
     `CAPACITY_EXPANSION_MODERNIZATION`.
   - Control Tower's 12 motions (thermal, mechanical, structural and performance upgrades,
     critical spares, installed-base expansion) are subdivisions.
   - CRM-1 stores `motion` (frozen E0.1 enum), `project_type` (E1.4, nullable) and `motion_detail`
     (a controlled sub-taxonomy that maps each Control Tower motion onto exactly one E0.1 motion).
3. **Opportunity owner.** E0.1 requires `sales_owner_id` on an Opportunity. An RFQ does **not**
   require an owner: unassigned RFQs route to the assignment queue (E1.1). CRM-1 therefore requires
   an owner to create an Opportunity. A default-owner rule is `DEFERRED_OWNER_INPUT`.
4. **Economics.** E3 `opportunity_economics.json` defines `amount_status`, `outcome_status` and
   `revenue_verification_state`, which extends E0.1 `value_amount`/`currency`. The two are adopted
   together.
