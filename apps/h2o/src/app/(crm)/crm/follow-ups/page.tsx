import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { SCOPE_COOKIE, scopeFrom } from '../../../../crm/workspace/prefs'
import { loadFollowUps, type FollowUpFilter } from '../../../../crm/workspace/queries'
import { Shell } from '../../../../crm/workspace/ui/Shell'
import { ScopeSwitch } from '../_components/ScopeSwitch'
import { TaskTable } from '../_components/TaskTable'
import { requireCrmSession } from '../session'

export const metadata: Metadata = { title: 'Follow-ups' }

const WHEN: Array<[FollowUpFilter['when'], string]> = [
  ['due', 'Due today'],
  ['overdue', 'Overdue'],
  ['open', 'All open'],
  ['done', 'Done'],
]

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireCrmSession('/crm/follow-ups/')
  const sp = await searchParams
  // W1-8 (audit finding 5): without an explicit ?who=, Follow-ups uses the same remembered Mine/Team as My Work.
  const remembered = scopeFrom((await cookies()).get(SCOPE_COOKIE)?.value, s.isAdmin)
  const f: FollowUpFilter = {
    who: sp.who === 'mine' || sp.who === 'team' || sp.who === 'unassigned' ? sp.who : remembered,
    when: sp.when === 'overdue' || sp.when === 'open' || sp.when === 'done' ? sp.when : 'due',
  }
  const now = new Date()
  const { rows, total, people } = await loadFollowUps(s, f, now)
  const href = (o: Partial<FollowUpFilter>) => `/crm/follow-ups/?who=${o.who ?? f.who}&when=${o.when ?? f.when}`
  return (
    <Shell
      active="followups"
      title="Follow-ups"
      userName={s.displayName}
      isAdmin={s.isAdmin}
      topRight={<ScopeSwitch scope={f.who === 'unassigned' ? remembered : f.who} back={`/crm/follow-ups/?when=${f.when}`} />}
    >
      <nav className="c-views" aria-label="Follow-up views">
        {WHEN.map(([k, l]) => (
          <a key={k} href={href({ when: k })} aria-current={f.when === k ? 'page' : undefined}>
            {l}
          </a>
        ))}
        <a href={href({ who: f.who === 'unassigned' ? remembered : 'unassigned' })} aria-current={f.who === 'unassigned' ? 'page' : undefined}>
          Unassigned
        </a>
      </nav>
      <p className="c-hint" role="status">
        Showing {f.who === 'unassigned' ? 'unassigned' : f.who === 'mine' ? 'your' : 'the team’s'} follow-ups.
      </p>
      {rows.length === 0 ? (
        <div className="c-panel">
          <p className="c-empty" role="status">
            {f.when === 'done' ? 'No finished follow-ups.' : f.when === 'overdue' ? 'Nothing overdue.' : f.when === 'due' ? 'No follow-ups due today.' : 'No open follow-ups.'}
          </p>
        </div>
      ) : (
        <>
          <TaskTable rows={rows} now={now} isAdmin={s.isAdmin} people={people} caption="Follow-ups" showOwner={f.who !== 'mine'} />
          <div className="c-pager">
            <span>
              {rows.length} of {total}
            </span>
          </div>
        </>
      )}
    </Shell>
  )
}
