# Factory change sketches

These are **sketches**, not PRs: they show the intended shape against the real helper names in `packages/agency-core` at HEAD `88f5469` (`hasRole`, `isAdmin`, `selfOrAdmin`, `adminFieldOnly`, `auditAfterChange`, `seoFields()`, `verificationFields()`). The Factory team should adapt naming, generate migrations (`pnpm --filter @factory/syed-ai migrate:create`), and extend `apps/syed-ai/test/threat-model.test.ts` as described in `02_DOCS/factory-prerequisites.md`.

| File | Prerequisite |
|---|---|
| `roles.patch.md` | P6 — `automation` role and `AUTOMATION_WRITERS` group |
| `service-accounts.ts` | P6 — API-key auth collection |
| `automation-hooks.ts` | P6 — slug / locked-noindex / verified-publish guards |
| `migration-fields.ts` | P3 — `migration` provenance group |
| `proxy-redirects.md` | P1 — serving the `redirects` collection |
| `seed-redirects.md` | P1 — seeding `blueprint.redirects[]` |
| `seo-contracts-package.md` | P2 — package skeleton and zod entry points |
| `wordpress-import-spec.md` | P5 — importer specification |
| `emit-webhook-task.ts` | P8 — outbox-pattern webhook job (v2) |
