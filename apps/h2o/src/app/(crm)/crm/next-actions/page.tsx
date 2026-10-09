import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { SCOPE_COOKIE, scopeFrom } from '../../../../crm/workspace/prefs'
import { loadNextActions, NEXT_ACTIONS_PAGE_SIZE } from '../../../../crm/workspace/nextActions'
import { Shell } from '../../../../crm/workspace/ui/Shell'
import { EmptyState } from '../../../../crm/workspace/ui/States'
import { IconTasks } from '../../../../crm/workspace/ui/Icons'
import { NextActionList } from '../_components/NextActionList'
import { ScopeSwitch } from '../_components/ScopeSwitch'
import { requireCrmSession } from '../session'

export const metadata: Metadata = { title: 'Next actions' }

/**
 * OPP-2: every open follow-up and every open deal's next action, overdue first. The count is the real total and every
 * page can be opened; there is no office filter and no hidden limit (Mine / Team is the one choice, and it is shown).
 */
export default async function NextActionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireCrmSession('/crm/next-actions/')
  const sp = await searchParams
  const scope = sp.scope === 'team' || sp.scope === 'mine' ? sp.scope : scopeFrom((await cookies()).get(SCOPE_COOKIE)?.value, s.isAdmin)
  const pageRaw = Number.parseInt(String(Array.isArray(sp.page) ? sp.page[0] : (sp.page ?? '1')), 10)
  const page = Number.isFinite(pageRaw) && pageRaw > 0 && pageRaw < 10_000 ? pageRaw : 1
  const now = new Date()
  const r = await loadNextActions(s, { who: scope, page }, now)
  const href = (p: number) => `/crm/next-actions/${p > 1 ? `?page=${p}` : ''}`
  return (
    <Shell active="work" title="Next actions" crumb={<a href="/crm/">My Work</a>} userName={s.displayName} session={s} isAdmin={s.isAdmin} topRight={<ScopeSwitch scope={scope} back="/crm/next-actions/" />}>
      <p className="c-hint" role="status">
        {r.total === 0
          ? 'Nothing to do next.'
          : `${r.total} ${r.total === 1 ? 'item' : 'items'} · ${r.overdue} overdue · ${scope === 'mine' ? 'Mine' : 'Team'}. Follow-ups and open deals, overdue first.`}
      </p>
      {r.rows.length === 0 ? (
        <EmptyState icon={<IconTasks />} title="No next actions">
          Open follow-ups and the next action of every open deal appear here.
        </EmptyState>
      ) : (
        <NextActionList rows={r.rows} now={now} zone={s.timeZone} isAdmin={s.isAdmin} people={r.people} caption="Next actions" showOwner={scope === 'team'} />
      )}
      {r.pages > 1 ? (
        <nav className="c-pager" aria-label="Next action pages">
          <span>
            {(r.page - 1) * NEXT_ACTIONS_PAGE_SIZE + 1}–{Math.min(r.page * NEXT_ACTIONS_PAGE_SIZE, r.total)} of {r.total}
          </span>
          {r.page > 1 ? <a href={href(r.page - 1)}>Previous</a> : null}
          {r.page < r.pages ? <a href={href(r.page + 1)}>Next</a> : null}
        </nav>
      ) : null}
    </Shell>
  )
}
