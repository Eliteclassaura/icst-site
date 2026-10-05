import type { Metadata } from 'next'
import { Shell } from '../../../../crm/workspace/ui/Shell'
import { SearchPanel } from '../_components/SearchPanel'
import { requireCrmSession } from '../session'

export const metadata: Metadata = { title: 'Search' }

/**
 * Wave 1 W1-2 phone Search page (the bottom-bar Search tab). The same grouped search as the ⌘K palette, laid out as a
 * page. The term is posted to a server action as it is typed; it never appears in this page's URL.
 */
export default async function SearchPage() {
  const s = await requireCrmSession('/crm/search/')
  return (
    <Shell active="search" title="Search" userName={s.displayName} isAdmin={s.isAdmin}>
      <section className="c-panel c-narrow" aria-label="Search">
        <SearchPanel mode="page" />
      </section>
    </Shell>
  )
}
