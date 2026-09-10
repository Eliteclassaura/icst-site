import type { CollectionAfterChangeHook, GlobalAfterChangeHook } from 'payload'

/**
 * Revalidation is injected by the app (Next's revalidateTag/revalidatePath) so agency-core
 * stays framework-agnostic. Tags: `collection:<slug>`, `doc:<slug>:<id>`, `path:<url>`, `global:<slug>`.
 */
export type Revalidator = {
  tag: (tag: string) => void | Promise<void>
  path?: (path: string) => void | Promise<void>
}

export const makeRevalidateAfterChange =
  (
    rev: Revalidator,
    pathFor?: (doc: Record<string, unknown>, slug: string) => string | null,
  ): CollectionAfterChangeHook =>
  async ({ doc, previousDoc, collection }) => {
    const slug = collection.slug
    const d = doc as Record<string, unknown> & { id: string | number; _status?: string }
    // Only published state matters to the public site; drafts revalidate nothing.
    const wasPublished = (previousDoc as { _status?: string } | undefined)?._status === 'published'
    if (d._status !== 'published' && !wasPublished) return doc
    await rev.tag(`collection:${slug}`)
    await rev.tag(`doc:${slug}:${d.id}`)
    const p = pathFor?.(d, slug)
    if (p && rev.path) await rev.path(p)
    return doc
  }

export const makeRevalidateGlobal =
  (rev: Revalidator): GlobalAfterChangeHook =>
  async ({ doc, global }) => {
    await rev.tag(`global:${global.slug}`)
    return doc
  }
