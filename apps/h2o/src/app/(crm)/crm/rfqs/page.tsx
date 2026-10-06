import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { MOTION_LABEL, SOURCE_LABEL } from '../../../../crm/workspace/labels'
import { COUNTRY_NAME, countryName } from '../../../../crm/countries'
import { INQUIRY_TYPE_LABEL } from '../../../../crm/inquiry-type'
import { OFFICE_LABEL } from '../../../../crm/offices'
import { inboxHref, listSearchCookie, searchRequested, storedTerm } from '../../../../crm/workspace/prefs'
import { INBOX_VIEWS, INBOX_VIEW_LABEL, loadInbox, loadRfq, parseInboxParams, searchAccounts, type InboxParams } from '../../../../crm/workspace/queries'
import { isUuid } from '../../../../crm/workspace/validate'
import { AutoSubmit } from '../../../../crm/workspace/ui/AutoSubmit'
import { IconPlus } from '../../../../crm/workspace/ui/Icons'
import { RfqTable } from '../../../../crm/workspace/ui/RfqTable'
import { Shell } from '../../../../crm/workspace/ui/Shell'
import { Shortcuts } from '../../../../crm/workspace/ui/Shortcuts'
import { EXPORT_COLUMNS } from '../../../../crm/export/csv-export'
import { BulkBar, SelectAll } from '../_components/BulkBar'
import { ExportDialog } from '../_components/ExportDialog'
import { Chips, ListSearch, queryOf, type Chip } from '../_components/ListControls'
import { SavedViews } from '../_components/SavedViews'
import { RFQ_TABS, RfqDetailView, type RfqTab } from '../_components/RfqDetail'
import { requireCrmSession } from '../session'

export const metadata: Metadata = { title: 'RFQ Inbox' }

type SP = Record<string, string | string[] | undefined>

const RECEIVED_LABEL: Record<string, string> = { today: 'Received today', '7d': 'Last 7 days', '30d': 'Last 30 days' }

/** Active filters as chips; each chip links to the same list without that one filter. */
function chipsFor(p: InboxParams, people: Array<{ id: string; name: string }>, search: boolean): Chip[] {
  const out: Chip[] = []
  const without = (k: Parameters<typeof inboxHref>[1]) => inboxHref(p, { ...k, page: null }, { search })
  if (p.owner)
    out.push({
      key: 'owner',
      label: `Owner: ${p.owner === 'me' ? 'Me' : p.owner === 'unassigned' ? 'Unassigned' : (people.find((x) => x.id === p.owner)?.name ?? 'CRM user')}`,
      href: without({ owner: null }),
    })
  if (p.received) out.push({ key: 'received', label: RECEIVED_LABEL[p.received] ?? 'Received', href: without({ received: null }) })
  if (p.motions.length)
    out.push({ key: 'motion', label: `Motion: ${p.motions.map((m) => MOTION_LABEL[m] ?? 'Unknown').join(', ')}`, href: inboxHref(p, { page: null }, { search, motions: null }) })
  if (p.countries.length)
    out.push({ key: 'country', label: `Country: ${p.countries.map((c) => (c === 'UNKNOWN' ? 'Unknown' : (countryName(c) ?? c))).join(', ')}`, href: inboxHref(p, { page: null }, { search, countries: null }) })
  if (p.source) out.push({ key: 'source', label: `Source: ${SOURCE_LABEL[p.source] ?? 'Unknown'}`, href: without({ source: null }) })
  if (p.accountLinked) out.push({ key: 'linked', label: p.accountLinked === 'yes' ? 'Account linked' : 'Account not linked', href: without({ linked: null }) })
  if (p.cta) out.push({ key: 'cta', label: 'CTA placement', href: without({ cta: null }) })
  if (p.account) out.push({ key: 'account', label: 'One account', href: without({ account: null }) })
  if (p.contact) out.push({ key: 'contact', label: 'One contact', href: without({ contact: null }) })
  if (p.status.length) out.push({ key: 'status', label: `Status (${p.status.length})`, href: inboxHref(p, { page: null }, { search, status: null }) })
  return out
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireCrmSession('/crm/rfqs/')
  const sp = await searchParams
  const parsed = parseInboxParams(sp)
  // W1-2: the search term comes from the list-search cookie, and only when the URL asks for it (`s=1`).
  const search = searchRequested(sp)
  const term = search ? storedTerm((await cookies()).get(listSearchCookie('inbox'))?.value) : null
  const p: InboxParams = { ...parsed, q: term }
  const now = new Date()
  const selected = typeof sp.rfq === 'string' && isUuid(sp.rfq) ? sp.rfq : null
  const tab = (RFQ_TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as RfqTab) : 'summary'
  const [inbox, detail, accountHits] = await Promise.all([
    loadInbox(s, p, now),
    selected ? loadRfq(s, selected, now) : Promise.resolve(null),
    p.q ? searchAccounts(s, p.q) : Promise.resolve([]),
  ])
  const on = Boolean(term)
  const href = (over: Parameters<typeof inboxHref>[1] = {}, opts: Parameters<typeof inboxHref>[2] = {}) => inboxHref(p, over, { search: on, ...opts })
  const chips = chipsFor(p, inbox.people, on)
  const filterCount = chips.length
  const filtered = filterCount > 0 || on
  const from = inbox.total === 0 ? 0 : (inbox.page - 1) * 50 + 1
  const to = Math.min(inbox.total, inbox.page * 50)
  const back = queryOf(inboxHref(p, { page: null }))

  return (
    <Shell
      active="inbox"
      title="RFQ Inbox"
      userName={s.displayName} session={s}
      isAdmin={s.isAdmin}
      badges={{ inbox: inbox.viewCounts.unassigned ? { n: inbox.viewCounts.unassigned } : undefined }}
      topRight={
        <a className="c-btn is-primary" href="/crm/new/">
          <IconPlus /> New inquiry
        </a>
      }
    >
      <div id="crm-inbox" role="region" aria-label="RFQ list and detail" tabIndex={0}>
        <Shortcuts scopeId="crm-inbox" />
        <nav className="c-views" aria-label="Saved views">
          {INBOX_VIEWS.map((v) => (
            <a key={v} href={href({ view: v === 'open' ? null : v, page: null })} aria-current={p.view === v ? 'page' : undefined}>
              {INBOX_VIEW_LABEL[v]} <span className="n">{inbox.viewCounts[v] ?? '—'}</span>
            </a>
          ))}
        </nav>
        {/* Owner request 2026-10-05: quick type chips (derived from the staff motion, else the customer's interest). */}
        <nav className="c-chips c-type-chips" aria-label="Inquiry type">
          {([null, 'PARTS', 'NEW_TOWER', 'REPAIR_SERVICE'] as const).map((t) => (
            <a key={t ?? 'all'} className={`c-chip${p.type === t ? ' is-on' : ''}`} href={href({ type: t, page: null })} aria-current={p.type === t ? 'page' : undefined}>
              {t ? INQUIRY_TYPE_LABEL[t] : 'All types'}
            </a>
          ))}
        </nav>
        {/* Patch L1: the two office queues (US / Thailand). */}
        <nav className="c-chips c-type-chips" aria-label="Office queue">
          {([null, 'US', 'TH'] as const).map((o) => (
            <a key={o ?? 'all'} className={`c-chip${p.office === o ? ' is-on' : ''}`} href={href({ office: o, page: null })} aria-current={p.office === o ? 'page' : undefined}>
              {o ? `${OFFICE_LABEL[o]} queue` : 'All queues'}
            </a>
          ))}
        </nav>
        <SavedViews s={s} list="inbox" query={back} currentHref={inboxHref(p, { page: null })} />

        <div className="c-toolbar">
          <ListSearch list="inbox" term={term} back={back} label="Search inquiries" placeholder="RFQ number, company, email, name" inputId="crm-search" />
          <details className="c-filter-pop">
            <summary className="c-btn">Filters{filterCount ? ` (${filterCount})` : ''}</summary>
            <form className="c-filters" method="get" action="/crm/rfqs/" aria-label="Filter inquiries">
              <AutoSubmit />
              {p.view !== 'open' ? <input type="hidden" name="view" value={p.view} /> : null}
              {p.account ? <input type="hidden" name="account" value={p.account} /> : null}
              {p.contact ? <input type="hidden" name="contact" value={p.contact} /> : null}
              {p.sort !== 'received_desc' ? <input type="hidden" name="sort" value={p.sort} /> : null}
              {on ? <input type="hidden" name="s" value="1" /> : null}
              {p.cta ? <input type="hidden" name="cta" value={p.cta} /> : null}
              {p.status.map((st) => (
                <input key={st} type="hidden" name="status" value={st} />
              ))}
              <label className="c-field">
                <span>Owner</span>
                <select className="c-select" name="owner" defaultValue={p.owner ?? ''}>
                  <option value="">Anyone</option>
                  <option value="me">Me</option>
                  <option value="unassigned">Unassigned</option>
                  {inbox.people.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="c-field">
                <span>Received</span>
                <select className="c-select" name="received" defaultValue={p.received ?? ''}>
                  <option value="">Any time</option>
                  <option value="today">Today</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                </select>
              </label>
              <fieldset className="c-fieldset c-check-group">
                <legend>Motion (staff classification)</legend>
                {Object.entries(MOTION_LABEL).map(([v, l]) => (
                  <label key={v} className="c-actions">
                    <input type="checkbox" name="motion" value={v} defaultChecked={p.motions.includes(v)} />
                    <span>{l}</span>
                  </label>
                ))}
              </fieldset>
              <label className="c-field">
                <span>Country (select one or more)</span>
                <select className="c-select c-multi" name="country" multiple size={8} defaultValue={p.countries}>
                  <option value="UNKNOWN">Unknown</option>
                  {[...COUNTRY_NAME].sort((a, b) => a[1].localeCompare(b[1])).map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              {p.type ? <input type="hidden" name="type" value={p.type} /> : null}
              {p.office ? <input type="hidden" name="office" value={p.office} /> : null}
              <label className="c-field">
                <span>Source</span>
                <select className="c-select" name="source" defaultValue={p.source ?? ''}>
                  <option value="">Any</option>
                  {['TYPEFORM', 'MANUAL_ENTRY', 'LEGACY_IMPORT'].map((v) => (
                    <option key={v} value={v}>
                      {SOURCE_LABEL[v]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="c-field">
                <span>Account</span>
                <select className="c-select" name="linked" defaultValue={p.accountLinked ?? ''}>
                  <option value="">Linked or not</option>
                  <option value="yes">Linked</option>
                  <option value="no">Not linked</option>
                </select>
              </label>
              <div className="c-actions">
                <button className="c-btn" type="submit">
                  Apply
                </button>
              </div>
            </form>
          </details>
          {s.isAdmin ? <ExportDialog list="inbox" query={queryOf(inboxHref(p, { page: null }, { search: on }))} columns={EXPORT_COLUMNS.inbox} alwaysDnc total={inbox.total} /> : null}
          <form className="c-sort" method="get" action="/crm/rfqs/" aria-label="Sort inquiries">
            <AutoSubmit />
            {/* Every current filter (repeated keys included), so changing the sort keeps them all. */}
            {[...new URLSearchParams(queryOf(href({ sort: null, page: null })))].map(([k, v], i) => (
              <input key={`${k}-${v}-${i}`} type="hidden" name={k} value={v} />
            ))}
            <label className="c-field c-field-inline">
              <span>Sort</span>
              <select className="c-select" name="sort" defaultValue={p.sort}>
                <option value="received_desc">Newest first</option>
                <option value="received_asc">Oldest first</option>
                <option value="status">Status</option>
                <option value="country">Country</option>
                <option value="type">Type</option>
              </select>
            </label>
            <noscript>
              <button className="c-btn" type="submit">
                Sort
              </button>
            </noscript>
          </form>
        </div>

        <Chips chips={chips} list="inbox" term={term} back={back} clearAllHref={inboxHref(p, { owner: null, received: null, type: null, source: null, linked: null, cta: null, account: null, contact: null, page: null }, { status: null, motions: null, countries: null })} />

        {accountHits.length > 0 ? (
          <p className="c-hint">
            Accounts matching your search:{' '}
            {accountHits.slice(0, 6).map((a, i) => (
              <span key={a.id}>
                {i ? ', ' : ''}
                <a href={`/crm/accounts/${a.id}/`}>{a.name}</a>
              </span>
            ))}
          </p>
        ) : null}

        <BulkBar scopeId="crm-inbox" kind="rfqs" people={inbox.people} />
        <div className={`c-split${detail ? '' : ' is-single'}`}>
          <section aria-label="Inquiries">
            {inbox.rows.length === 0 ? (
              <div className="c-panel">
                <p className="c-empty" role="status">
                  {term
                    ? `No RFQs match “${term}”. Search covers RFQ number, company, email and name.`
                    : filtered
                      ? 'No inquiries match these filters.'
                      : p.view === 'unassigned'
                        ? 'No unassigned inquiries.'
                        : `No ${INBOX_VIEW_LABEL[p.view].toLowerCase()} inquiries.`}{' '}
                  {p.view !== 'open' || filtered ? <a href="/crm/rfqs/">View all open</a> : null}
                </p>
              </div>
            ) : (
              <RfqTable
                rows={inbox.rows}
                now={now} zone={s.timeZone}
                selectedId={selected}
                compact={Boolean(detail)}
                caption={`${INBOX_VIEW_LABEL[p.view]} inquiries`}
                select={{ header: <SelectAll scopeId="crm-inbox" label="Select all inquiries on this page" /> }}
                hrefFor={(r) => href({}, { rfq: r.id })}
              />
            )}
            <div className="c-pager">
              <span>
                {from}–{to} of {inbox.total}
              </span>
              {inbox.page > 1 ? <a href={href({ page: String(inbox.page - 1) })}>Previous</a> : null}
              {inbox.page < inbox.pages ? <a href={href({ page: String(inbox.page + 1) })}>Next</a> : null}
            </div>
          </section>
          {detail ? (
            <div>
              <p className="c-hint">
                <a href={`/crm/rfqs/${detail.row.id}/`}>Open full page</a> · <a href={href({})}>Close pane</a>
              </p>
              <RfqDetailView d={detail} s={s} tab={tab} now={now} mode="pane" tabHref={(t) => href({}, { rfq: detail.row.id, tab: t === 'summary' ? null : t })} />
            </div>
          ) : selected ? (
            <p className="c-alert" role="alert">
              This inquiry doesn’t exist or you don’t have access.
            </p>
          ) : null}
        </div>
      </div>
    </Shell>
  )
}
