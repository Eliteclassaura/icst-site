import { revalidatePath, revalidateTag } from 'next/cache'
import type { Revalidator } from '@factory/agency-core/cms'

// Outside a Next request (CLI seed, worker, tests) revalidation is meaningless and Next throws an
// invariant. A content write must never fail because a cache could not be purged.
function safe(fn: () => void) {
  try {
    fn()
  } catch (e) {
    if (process.env.NODE_ENV !== 'test' && process.env.PAYLOAD_LOG_REVALIDATE === '1')
      console.warn('revalidate skipped:', (e as Error).message)
  }
}

export const revalidator: Revalidator = {
  tag: (t) => safe(() => revalidateTag(t, 'max')),
  path: (p) => safe(() => revalidatePath(p)),
}

/** Public path for a published document, by collection. Mirrors the site's route conventions (trailing slash). */
export function pathFor(doc: Record<string, unknown>, collection: string): string | null {
  const slug = doc.slug as string | undefined
  if (!slug) return null
  switch (collection) {
    case 'pages':
      return slug === 'home' ? '/' : `/${slug}/`
    case 'posts':
      return `/insights/${slug}/`
    case 'glossary-terms':
      return '/glossary/'
    case 'services':
      return `/services/${slug}/`
    case 'case-studies':
      return `/work/${slug}/`
    default:
      return null
  }
}
