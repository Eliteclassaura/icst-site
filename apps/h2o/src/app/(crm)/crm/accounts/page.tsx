import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { loadAccountsDirectory, parseAccountsParams, type AccountsParams } from '../../../../crm/workspace/directory'
import { label, RELATIONSHIP_LABEL } from '../../../../crm/workspace/labels'
import { accountsHref, listSearchCookie, searchRequested, storedTerm } from '../../../../crm/workspace/prefs'
import { absoluteTime, activityTime } from '../../../../crm/workspace/time'
import { EXPORT_COLUMNS } from '../../../../crm/export/csv-export'
import { ExportDialog } from '../_components/ExportDialog'
import { SavedViews } from '../_components/SavedViews'
import { AutoSubmit } from '../../../../crm/workspace/ui/AutoSubmit'
import { IconPlus } from '../../../../crm/workspace/ui/Icons'
import { Shell } from '../../../../crm/workspace/ui/Shell'
import { Chips, ListSearch, queryOf, type Chip } from '../_components/ListControls'
import { requireCrmSession } from '../session'

export const metadata: Metadata = { title: 'Accounts' }

type SP = Record<string, string | string[] | undefined>

/**
 * Wave 1 W1-1 Accounts directory: every company the team works with, inside the workspace (no Payload admin trip).
 * 50 rows per page; search by name, alias or domain (the term is held in the list-search cookie, not the URL).
 */
export default async function AccountsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireCrmSession('/crm/accounts/')
  const sp = await searchParams
  const p: AccountsParams = parseAccountsParams(sp)
  const on = searchRequested(sp)
  const term = on ? storedTerm((await cookies()).get(listSearchCookie('accounts'))?.value) : null
  const now = new Date()
  const d = await loadAccountsDirectory(s, p, term)
  const href = (over: Parameters<typeof accountsHref>[1] = {}) => accountsHref(p, over, Boolean(term))
  const back = queryOf(accountsHref(p, { page: null }))
  const chips: Chip[] = []
  if (p.owner)
    chips.push({
      key: 'owner',
      label: `Owner: ${p.owner === 'me' ? 'Me' : p.owner === 'unassigned' ? 'No owner' : (d.people.find((x) => x.id === p.owner)?.name ?? 'CRM user')}`,
      href: href({ owner: null, page: null }),
    })
  if (p.relationship) chips.push({ key: 'rel', label: label(RELATIONSHIP_LABEL, p.relationship), href: href({ relationship: null, page: null }) })
  if (p.state === 'archived') chips.push({ key: 'state', label: 'Archived', href: href({ state: null, page: null }) })
  if (p.naming) chips.push({ key: 'naming', label: 'Name from domain', href: href({ naming: null, page: null }) })
  const from = d.total === 0 ? 0 : (d.page - 1) * 50 + 1
  const to = Math.min(d.total, d.page * 50)
  return (
    <Shell
      active="accounts"
      title="Accounts"
      userName={s.displayName} session={s}
      isAdmin={s.isAdmin}
      topRight={
        <a className="c-btn is-primary" href="/crm/accounts/new/">
          <IconPlus /> New account
        </a>
      }
    >
      <SavedViews s={s} list="accounts" query={back} currentHref={accountsHref(p, { page: null })} />
      <div className="c-toolbar">
        <ListSearch list="accounts" term={term} back={back} label="Search accounts" placeholder="Company name, alias or domain" inputId="crm-search" />
        <form className="c-filters c-filters-inline" method="get" action="/crm/accounts/" aria-label="Filter accounts">
          <AutoSubmit />
          {term ? <input type="hidden" name="s" value="1" /> : null}
          <label className="c-field c-field-inline">
            <span>Owner</span>
            <select className="c-select" name="owner" defaultValue={p.owner ?? ''}>
              <option value="">Anyone</option>
              <option value="me">Me</option>
              <option value="unassigned">No owner</option>
              {d.people.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label className="c-field c-field-inline">
            <span>Relationship</span>
            <select className="c-select" name="relationship" defaultValue={p.relationship ?? ''}>
              <option value="">Any</option>
              {Object.entries(RELATIONSHIP_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="c-field c-field-inline">
            <span>Naming</span>
            <select className="c-select" name="naming" defaultValue={p.naming ?? ''}>
              <option value="">Any</option>
              <option value="domain">Name from domain (to correct)</option>
            </select>
          </label>
          <label className="c-field c-field-inline">
            <span>Show</span>
            <select className="c-select" name="state" defaultValue={p.state}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="c-field c-field-inline">
            <span>Sort</span>
            <select className="c-select" name="sort" defaultValue={p.sort}>
              <option value="name">Name</option>
              <option value="recent">Recently updated</option>
            </select>
          </label>
          <noscript>
            <button className="c-btn" type="submit">
              Apply
            </button>
          </noscript>
        </form>
        {s.isAdmin ? <ExportDialog list="accounts" query={queryOf(accountsHref(p, { page: null }, Boolean(term)))} columns={EXPORT_COLUMNS.accounts} alwaysDnc={false} total={d.total} /> : null}
      </div>
      <Chips chips={chips} list="accounts" term={term} back={back} clearAllHref="/crm/accounts/" />
      {d.rows.length === 0 ? (
        <div className="c-panel">
          <p className="c-empty" role="status">
            {term ? `No accounts match “${term}”.` : chips.length ? 'No accounts match these filters.' : 'No accounts yet.'}{' '}
            <a href="/crm/accounts/new/">New account</a>
          </p>
        </div>
      ) : (
        <div className="c-table-wrap">
          <table className="c-table c-dir-table">
            <caption className="c-visually-hidden">Accounts</caption>
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">Relationship</th>
                <th scope="col" className="hide-sm">
                  Owner
                </th>
                <th scope="col" className="num">
                  Open RFQs
                </th>
                <th scope="col" className="hide-sm">
                  Last activity
                </th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((a) => (
                <tr key={a.id}>
                  <td className="two">
                    <a className="c-row-link" href={`/crm/accounts/${a.id}/`} data-row-link>
                      <strong>{a.name}</strong>
                      <span>
                        {a.domain ?? 'No domain recorded'}
                        {a.nameFromDomain ? ' · name from domain' : ''}
                      </span>
                    </a>
                  </td>
                  <td>{label(RELATIONSHIP_LABEL, a.relationship)}</td>
                  <td className="hide-sm">{a.ownerName ?? <span className="c-muted">No owner</span>}</td>
                  <td className="num">{a.openRfqs ?? <span className="c-unknown">—</span>}</td>
                  <td className="hide-sm" title={a.lastActivityAt ? absoluteTime(new Date(a.lastActivityAt)) : undefined}>
                    {a.lastActivityAt ? activityTime(new Date(a.lastActivityAt), now) : <span className="c-muted">None</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="c-pager">
        <span>
          {from}–{to} of {d.total}
        </span>
        {d.page > 1 ? <a href={href({ page: String(d.page - 1) })}>Previous</a> : null}
        {d.page < d.pages ? <a href={href({ page: String(d.page + 1) })}>Next</a> : null}
      </div>
    </Shell>
  )
}
