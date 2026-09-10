# P1 — `apps/syed-ai/src/seed.ts` seeds `blueprint.redirects[]`

The blueprint already carries 12 redirect rows (`/index.html` 308s, `.php` 404/410, `send.php` 410); the seed ignores them and `proxy.ts` hard-codes a subset. Make the blueprint authoritative:

```ts
for (const r of blueprint.redirects) {
  const existing = await payload.find({ collection: 'redirects', where: { from: { equals: r.from } }, limit: 1 })
  const data = { from: r.from, to: r.to, statusCode: r.status, reason: r.reason ?? 'blueprint', source: r.source ?? 'migration' }
  if (existing.docs[0]) await payload.update({ collection: 'redirects', id: existing.docs[0].id, data })
  else await payload.create({ collection: 'redirects', data })
}
```

Idempotent by `from`. Rows with `source: 'automation'` (Lane B advisory redirects) are *not* removed by the seed; a `--reconcile` flag lists them so the next `page-decisions` run can adopt or drop them. Once seeded, the hard-coded `.php` rules in `proxy.ts` can be deleted (they exist in the blueprint) — do this in the same PR and let the parity e2e prove equivalence.
