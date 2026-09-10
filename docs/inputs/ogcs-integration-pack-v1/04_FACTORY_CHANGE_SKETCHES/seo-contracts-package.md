# P2 — `packages/seo-contracts` skeleton

```
packages/seo-contracts/
  package.json        { "name": "@factory/seo-contracts", "version": "1.0.0", "type": "module",
                        "exports": { ".": "./dist/index.js", "./json-schema/*": "./json-schema/*" },
                        "dependencies": { "zod": "<same pin as design-contract>" },
                        "scripts": { "build", "test", "typecheck", "lint", "emit:json-schema", "validate": "tsx src/cli.ts" } }
  src/envelope.ts     export const envelope = <P extends z.ZodTypeAny>(name: string, payload: P) => z.object({ contract: z.literal(`factory.seo/${name}`), contract_version: z.string().regex(/^\d+\.\d+\.\d+$/), produced_by: z.object({ system: z.enum([...]), version: z.string() }), produced_at: z.string().datetime(), project_id: z.string().min(1), run_id: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/), inputs: z.array(z.object({ artefact: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })), payload }).strict()
  src/evidence-bundle.ts   // mirrors 03_CONTRACTS/schemas/evidence-bundle.schema.json
  src/page-decisions.ts    // includes .superRefine for PRUNE⇒!prune_blocked, REDIRECT⇒target_url, approved⇒approved_by
  src/blueprint-v2.ts      // v1 shape + decision_ref + migration + parity (required)
  src/qa-report.ts
  src/deploy-event.ts
  src/index.ts             export * ; export function validate<T>(schema: z.ZodType<T>, data: unknown): { ok: true; data: T } | { ok: false; errors: { path: string; message: string }[] }
  src/cli.ts               seo-contracts validate <file> [--contract name] → exit 1 with JSON-pointer errors
  scripts/emit-json-schema.ts   zod-to-json-schema → json-schema/*.schema.json (committed; CI diff like design contract)
  fixtures/valid/*.json, fixtures/invalid/*.json + *.expect.json
  test/contracts.test.ts   every valid fixture passes; every invalid fixture fails at the expected path
```

ESLint (`tools/eslint-config`): `no-restricted-imports` in this package for `@factory/agency-core`, `payload`, `react`, `next`; in `agency-core` for `@factory/seo-contracts`. `versions.md`: add the package. `turbo.json`: nothing new (build/test/typecheck/lint already generic).

Consumers inside the Factory: `apps/*/src/seed.ts` (blueprint v2), `tools/legacy-extract`, `tools/wordpress-import`, `tools/parity/compare.mjs` (qa-report), the future plugin. Consumer outside: the OGCS repo (`npm i @factory/seo-contracts` from the private registry or a git tag).
