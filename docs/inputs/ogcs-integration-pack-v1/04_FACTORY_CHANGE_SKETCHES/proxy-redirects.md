# P1 — `apps/syed-ai/src/proxy.ts` serves the `redirects` collection

Today `proxy.ts` handles host canonicalisation, trailing slash, `/index.html` → `/`, legacy `.php` 404/410 and security headers, and does not read the `redirects` collection. The slug-change hook (`hooks/slug-redirect.ts`) writes rows nobody serves.

Sketch:

```ts
// src/lib/redirects.ts
import { getPayload } from 'payload'
import config from '@payload-config'
import { unstable_cache } from 'next/cache'

export const getRedirectMap = unstable_cache(
  async () => {
    const payload = await getPayload({ config })
    const { docs } = await payload.find({ collection: 'redirects', limit: 5000, depth: 0, pagination: false })
    return Object.fromEntries(docs.map((d) => [d.from, { to: d.to, status: d.statusCode as 301 | 308 | 410 }]))
  },
  ['redirects-map'],
  { tags: ['redirects'] },
)
```

```ts
// src/proxy.ts (inside the existing handler, after host/slash canonicalisation, before the .php map)
const map = await getRedirectMap()
const hit = map[url.pathname]
if (hit) {
  if (hit.status === 410) return new Response(null, { status: 410 })
  return NextResponse.redirect(new URL(hit.to!, url), hit.status)
}
```

`makeRevalidateAfterChange` already exists — register it on the `redirects` slug with a `Revalidator` that calls `revalidateTag('redirects')`, so a new row is live without restart.

Guards: refuse loops at write time (already: `beforeValidate` rejects `from === to`) and additionally reject a `to` that itself appears as a `from` (chain) unless `statusCode` is 410. e2e: for every blueprint redirect, one hop, correct status; `/admin` and `/api` excluded (keep the existing comment true).
