import type { CollectionAfterChangeHook } from 'payload'

/** When a published document's slug changes, create a permanent redirect from the old URL (master prompt: never silently change a ranking URL). */
export const makeSlugRedirectHook =
  (urlFor: (slug: string, collectionSlug: string) => string): CollectionAfterChangeHook =>
  async ({ doc, previousDoc, collection, req, operation }) => {
    if (operation !== 'update') return doc
    const prev = previousDoc as { slug?: string; _status?: string } | undefined
    const cur = doc as { slug?: string; _status?: string }
    if (!prev?.slug || !cur.slug || prev.slug === cur.slug) return doc
    if (prev._status !== 'published') return doc
    const from = urlFor(prev.slug, collection.slug)
    const to = urlFor(cur.slug, collection.slug)
    const existing = await req.payload.find({
      collection: 'redirects',
      where: { from: { equals: from } },
      limit: 1,
      overrideAccess: true,
    })
    if (!existing.docs.length) {
      await req.payload.create({
        collection: 'redirects',
        // A publisher renaming a URL is a human action, so the redirect is active immediately (ADR-028 §6).
        data: {
          from,
          to,
          statusCode: '308',
          status: 'active',
          source: 'slug-change',
          reason: `slug change on ${collection.slug}`,
        },
        overrideAccess: true,
        req,
      })
    }
    return doc
  }
