import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { loadContactsDirectory, parseContactsParams, type ContactsParams } from '../../../../crm/workspace/directory'
import { contactsHref, listSearchCookie, searchRequested, storedTerm } from '../../../../crm/workspace/prefs'
import { absoluteTime, activityTime } from '../../../../crm/workspace/time'
import { EXPORT_COLUMNS } from '../../../../crm/export/csv-export'
import { BulkBar, SelectAll } from '../_components/BulkBar'
import { ExportDialog } from '../_components/ExportDialog'
import { SavedViews } from '../_components/SavedViews'
import { AutoSubmit } from '../../../../crm/workspace/ui/AutoSubmit'
import { IconDoNotContact, IconPlus } from '../../../../crm/workspace/ui/Icons'
import { Shell } from '../../../../crm/workspace/ui/Shell'
import { Chips, ListSearch, queryOf, type Chip } from '../_components/ListControls'
import { ListContext } from '../_components/ListContext'
import { requireCrmSession } from '../session'

export const metadata: Metadata = { title: 'Contacts' }

type SP = Record<string, string | string[] | undefined>

/**
 * Wave 1 W1-1 Contacts directory. Search covers names, the email identity and the company as supplied; the term is
 * held in the list-search cookie and never appears in the URL. Do-not-contact is shown on every row it applies to.
 */
export default async function ContactsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireCrmSession('/crm/contacts/')
  const sp = await searchParams
  const p: ContactsParams = parseContactsParams(sp)
  const on = searchRequested(sp)
  const term = on ? storedTerm((await cookies()).get(listSearchCookie('contacts'))?.value) : null
  const now = new Date()
  const d = await loadContactsDirectory(s, p, term)
  const href = (over: Parameters<typeof contactsHref>[1] = {}) => contactsHref(p, over, Boolean(term))
  const back = queryOf(contactsHref(p, { page: null }))
  const chips: Chip[] = []
  if (p.owner)
    chips.push({
      key: 'owner',
      label: `Owner: ${p.owner === 'me' ? 'Me' : p.owner === 'unassigned' ? 'No owner' : (d.people.find((x) => x.id === p.owner)?.name ?? 'CRM user')}`,
      href: href({ owner: null, page: null }),
    })
  if (p.linked) chips.push({ key: 'linked', label: p.linked === 'yes' ? 'Has an account' : 'No account', href: href({ linked: null, page: null }) })
  if (p.state === 'archived') chips.push({ key: 'state', label: 'Archived', href: href({ state: null, page: null }) })
  const from = d.total === 0 ? 0 : (d.page - 1) * 50 + 1
  const to = Math.min(d.total, d.page * 50)
  return (
    <Shell
      active="contacts"
      title="Contacts"
      userName={s.displayName} session={s}
      isAdmin={s.isAdmin}
      topRight={
        <span className="c-actions">
          {s.isAdmin ? (
            <a className="c-btn" href="/crm/import/">
              Import…
            </a>
          ) : null}
          <a className="c-btn is-primary" href="/crm/contacts/new/">
            <IconPlus /> New contact
          </a>
        </span>
      }
    >
      <SavedViews s={s} list="contacts" query={back} currentHref={contactsHref(p, { page: null })} />
      <div className="c-toolbar">
        <ListSearch list="contacts" term={term} back={back} label="Search contacts" placeholder="Name, email or company" inputId="crm-search" />
        <form className="c-filters c-filters-inline" method="get" action="/crm/contacts/" aria-label="Filter contacts">
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
            <span>Account</span>
            <select className="c-select" name="linked" defaultValue={p.linked ?? ''}>
              <option value="">Any</option>
              <option value="yes">Has an account</option>
              <option value="no">No account</option>
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
        {s.isAdmin ? <ExportDialog list="contacts" query={queryOf(contactsHref(p, { page: null }, Boolean(term)))} columns={EXPORT_COLUMNS.contacts} alwaysDnc total={d.total} /> : null}
      </div>
      <Chips chips={chips} list="contacts" term={term} back={back} clearAllHref="/crm/contacts/" />
      {d.rows.length === 0 ? (
        <div className="c-panel">
          <p className="c-empty" role="status">
            {term
              ? `No contacts match “${term}”.`
              : chips.length
                ? 'No contacts match these filters.'
                : 'No contacts yet. Contacts are created from inquiries, or add one with New contact.'}{' '}
            {s.isAdmin && !term && !chips.length ? <a href="/crm/import/">Import contacts</a> : null}
          </p>
        </div>
      ) : (
        <div className="c-table-wrap" id="crm-contacts-list">
          <ListContext kind="contacts" scopeId="crm-contacts-list" />
          <BulkBar scopeId="crm-contacts-list" kind="contacts" people={d.people} />
          <table className="c-table c-dir-table">
            <caption className="c-visually-hidden">Contacts</caption>
            <thead>
              <tr>
                <th scope="col" className="sel">
                  <SelectAll scopeId="crm-contacts-list" label="Select all contacts on this page" />
                </th>
                <th scope="col">Contact</th>
                <th scope="col">Account</th>
                <th scope="col" className="hide-sm">
                  Owner
                </th>
                <th scope="col" className="num">
                  Open RFQs
                </th>
                <th scope="col" className="hide-sm">
                  Last activity
                </th>
                <th scope="col">
                  <span className="c-visually-hidden">Flags</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((c) => (
                <tr key={c.id}>
                  <td className="sel">
                    <input type="checkbox" className="c-check" data-bulk value={`${c.id}|${c.updatedAt}`} aria-label={`Select ${c.name}`} />
                  </td>
                  <td className="two">
                    <a className="c-row-link" href={`/crm/contacts/${c.id}/`} data-row-link>
                      <strong>{c.name}</strong>
                      <span>{c.title ?? 'Title not recorded'}</span>
                    </a>
                  </td>
                  <td>{c.accountId ? <a href={`/crm/accounts/${c.accountId}/`}>{c.accountName ?? 'Account'}</a> : <span className="c-muted">No account</span>}</td>
                  <td className="hide-sm">{c.ownerName ?? <span className="c-muted">No owner</span>}</td>
                  <td className="num">{c.openRfqs ?? <span className="c-unknown">—</span>}</td>
                  <td className="hide-sm" title={c.lastActivityAt ? absoluteTime(new Date(c.lastActivityAt), s.timeZone) : undefined}>
                    {c.lastActivityAt ? activityTime(new Date(c.lastActivityAt), now, s.timeZone) : <span className="c-muted">None</span>}
                  </td>
                  <td>
                    {c.doNotContact ? (
                      <span className="c-flag-dnc">
                        <IconDoNotContact label="Do not contact" />
                      </span>
                    ) : null}
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
