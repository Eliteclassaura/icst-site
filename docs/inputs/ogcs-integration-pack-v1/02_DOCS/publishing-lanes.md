# Publishing lanes — how OGCS pushes changes live

The owner's requirement: "be able to push my changes for my clients live." Two lanes satisfy it with different safety properties. The lane is chosen by *what kind of change it is*, never by convenience.

## Lane A — structural, through the blueprint

**Use for:** creating or removing a public URL; any redirect; slug or parent changes; noindex/canonical changes on locked pages; information-architecture changes; new or changed Payload collections; anything that a PRUNE / REDIRECT / CONSOLIDATE / NOINDEX / REPOSITION-with-URL-change decision produces; every migration.

**Path:** OGCS emits `page-decisions` (contract) → `tools/wordpress-import` (migration) or `tools/decisions-apply` (steady state) rewrites `apps/<client>/content/<client>.blueprint.json` → PR → CI: schema validation, `seed.ts --dry-run` diff, threat tests, build, e2e, **parity gate** against the declared baseline with `parity.accept` taken from the decisions → merge → deploy → `seed.ts` upserts → `deploy-event` + `qa-report` return to OGCS.

**Why a PR:** structural changes are the ones that lose SEO equity when wrong. The parity gate (`tools/parity/compare.mjs`) already blocks on missing routes, wrong canonicals, lost schema types, redirect chains and internal-link removals; the PR is where a human sees the diff. The blueprint is data, so `git revert` is a complete rollback.

**Idempotency:** `page-decisions.run_id` is written to each affected page's `migration.decisionsVersion`; re-applying the same run is a no-op; an older run than the one applied is refused unless `--force-rollback`.

## Lane B — content, through a scoped service account

**Use for:** `seo.title`, `seo.description`, OG/Twitter text, body copy in existing blocks, internal links inside rich text, `relatedLinks`, image `alt`, new `posts`/articles under existing routes, `schema-entities.data` updates, `seo.schemaExtra` on an existing page, FAQ items, glossary terms, `contentUpdatedAt`.

**Path:** OGCS → `POST/PATCH https://<client>/api/<collection>/<id>` with header `Authorization: service-accounts API-Key <key>` and `X-OGCS-Run-Id: <ulid>` → Payload access + hooks → document version saved → `audit-log` row (actor = service account) → OGCS records the change-set (before/after) on its `experiment`/`task`.

**Service account definition** (sketch in `04_FACTORY_CHANGE_SKETCHES/service-accounts.ts`):

- Collection `service-accounts`, `auth: { useAPIKey: true, disableLocalStrategy: true }`; fields `name`, `client` (label), `roles: ['automation']` (fixed), `enabled`, `lastUsedAt`, `notes`.
- Create/update/delete: admins only; read: self or admin. Appears in `SENSITIVE_COLLECTIONS`.
- New role `automation`; new group `AUTOMATION_WRITERS = ['platform-admin','client-admin','editor','automation']` used by `pages`, `posts`, `media`, `redirects`, `faqs`, `glossary-terms`, `schema-entities`, `citations` for **create/update only**. `automation` is not in `ADMINS`, `CRM_USERS`, `SEARCH_USERS`, or any delete rule.
- `redirects` create by `automation` is allowed **only** with `source: 'automation'` and is advisory: `proxy.ts` serves it, but Lane-A reconciliation on the next blueprint apply either adopts it into `redirects[]` or removes it. This keeps redirects visible in git without blocking a same-day fix for a broken link.

**Hooks that constrain Lane B regardless of role:**

| Hook | Collection | Rule |
|---|---|---|
| `beforeChange` | pages, posts | If `req.user.collection === 'service-accounts'` and `data.slug !== originalDoc.slug` → throw ("slug changes are structural; use page-decisions"). |
| `beforeChange` | pages, posts | If `data._status === 'published'` and `verification.status !== 'verified'` → throw. Applies to humans too (ADR-016 finally enforced). |
| `beforeChange` | pages, posts | If `seo.lock === true` and (`seo.noindex` becomes true or `seo.canonical` changes) → throw unless `req.user` is an admin. |
| `beforeChange` | any | If `req.user.collection === 'service-accounts'` and operation is `delete` → access already denies; hook logs the attempt to `audit-log` as `automation-delete-refused`. |
| `afterChange` | any | Existing `auditAfterChange` records `changedKeys` and actor; add `runId` from `X-OGCS-Run-Id`. |

**Rollback:** Payload versions (`maxPerDoc: 50`, `drafts` enabled) — restore a version in admin, or OGCS `PATCH`es the recorded `before` state. Disabling the service account (`enabled: false`) or rotating its key stops all Lane-B writes for that client immediately.

**Rate limits:** `securityDefaults()` already sets `rateLimit` 300/min; OGCS self-limits to a per-project daily budget (default 10 page writes/day for green tactics) and never writes during the client's declared freeze windows (stored in OGCS `project.constraints`).

## Choosing the lane — decision table

| Change | Lane |
|---|---|
| Rewrite a title/meta | B |
| Add internal links in body | B |
| Publish a new article at `/resources/<slug>/` where `/resources/` exists | B (the post's slug is new, not changed) |
| Move `/blog/x/` to `/resources/x/` | A |
| Remove an off-topic post | A (PRUNE with gate) |
| Set canonical from a duplicate to its master | A if `seo.lock`, else B with admin approval |
| Add FAQPage schema to an existing service page | B |
| Add a `Parts` collection | A |
| Fix a 404 found in GSC today with a 301 | B (advisory redirect) then A reconciles |
| Change hreflang mapping | A |

## What this means for the Factory's threat model

New row `automation` in the role × collection matrix (`apps/syed-ai/test/threat-model.test.ts`): can create/update the AUTOMATION_WRITERS collections, cannot read `contacts/leads/companies/activities/submissions/subscribers/users/service-accounts/integrations/audit-log`, cannot delete anything, cannot create `users` or `service-accounts`, cannot change its own `roles`. Tests: API-key auth works with `disableLocalStrategy`; a disabled account is refused; slug-change and unverified-publish hooks throw for the service account; audit rows carry the service account as actor and the run id.
