import { loadViews } from '../../../../crm/workspace/savedViews'
import type { CrmSession } from '../../../../crm/workspace/session'
import type { ViewList } from '../../../../crm/workspace/views'
import { ViewManage, SaveViewDialog } from './SavedViewsClient'

/**
 * W1-6 saved views for one list: the user's and the team's (shared) views as links, "Save view" for the current
 * filters, and rename / pin / delete for views the user may manage. `query` is the list's current filter query; the
 * server re-normalises it (filter keys only — a search term is never saved).
 */
export async function SavedViews({ s, list, query, currentHref }: { s: CrmSession; list: ViewList; query: string; currentHref: string }) {
  const views = await loadViews(s, list)
  return (
    <div className="c-saved-views" role="group" aria-label="Saved views">
      {views.map((v) => (
        <span key={v.id} className="c-saved-view">
          <a className={`c-chip${currentHref === v.href ? ' is-on' : ''}`} href={v.href} aria-current={currentHref === v.href ? 'page' : undefined}>
            {v.name}
            {v.shared ? <span className="c-visually-hidden"> (shared)</span> : null}
            {v.shared ? <span className="c-tag">Team</span> : null}
          </a>
          {v.mine && (!v.shared || s.isAdmin) ? <ViewManage view={{ id: v.id, name: v.name, pinned: v.pinned }} /> : s.isAdmin && v.shared ? <ViewManage view={{ id: v.id, name: v.name, pinned: v.pinned }} /> : null}
        </span>
      ))}
      <SaveViewDialog list={list} query={query} isAdmin={s.isAdmin} />
    </div>
  )
}
