import type { Metadata } from 'next'
import { MOTION_LABEL, SOURCE_LABEL } from '../../../../crm/workspace/labels'
import { INBOX_VIEWS, INBOX_VIEW_LABEL, loadInbox, loadRfq, parseInboxParams, searchAccounts, type InboxParams } from '../../../../crm/workspace/queries'
import { isUuid } from '../../../../crm/workspace/validate'
import { IconPlus } from '../../../../crm/workspace/ui/Icons'
import { RfqTable } from '../../../../crm/workspace/ui/RfqTable'
import { Shell } from '../../../../crm/workspace/ui/Shell'
import { Shortcuts } from '../../../../crm/workspace/ui/Shortcuts'
import { RFQ_TABS, RfqDetailView, type RfqTab } from '../_components/RfqDetail'
import { requireCrmSession } from '../session'

export const metadata: Metadata = { title: 'RFQ Inbox' }

type SP = Record<string, string | string[] | undefined>

/** Build an inbox URL from the current params with overrides (trailing slash; no PII in the URL). */
function hrefWith(p: InboxParams, over: Record<string, string | null>, extra: Record<string, string | null> = {}) {
  const q = new URLSearchParams()
  const base: Record<string, string | null> = {
    view: p.view === 'open' ? null : p.view,
    owner: p.owner,
    received: p.received,
    motion: p.motion,
    source: p.source,
    cta: p.cta,
    linked: p.accountLinked,
    account: p.account,
    contact: p.contact,
    sort: p.sort === 'received_desc' ? null : p.sort,
    q: p.q,
    page: p.page > 1 ? String(p.page) : null,
    ...over,
    ...extra,
  }
  for (const [k, v] of Object.entries(base)) if (v) q.set(k, v)
  for (const st of p.status) if (!('status' in over)) q.append('status', st)
  const s = q.toString()
  return `/crm/rfqs/${s ? `?${s}` : ''}`
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireCrmSession('/crm/rfqs/')
  const sp = await searchParams
  const p = parseInboxParams(sp)
  const now = new Date()
  const selected = typeof sp.rfq === 'string' && isUuid(sp.rfq) ? sp.rfq : null
  const tab = (RFQ_TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as RfqTab) : 'summary'
  const [inbox, detail, accountHits] = await Promise.all([
    loadInbox(s, p, now),
    selected ? loadRfq(s, selected, now) : Promise.resolve(null),
    p.q ? searchAccounts(s, p.q) : Promise.resolve([]),
  ])
  const filtered = Boolean(p.status.length || p.owner || p.received || p.motion || p.source || p.cta || p.accountLinked || p.account || p.contact || p.q)
  const from = inbox.total === 0 ? 0 : (inbox.page - 1) * 50 + 1
  const to = Math.min(inbox.total, inbox.page * 50)

  return (
    <Shell
      active="inbox"
      title="RFQ Inbox"
      userName={s.displayName}
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
            <a key={v} href={hrefWith(p, { view: v === 'open' ? null : v, page: null })} aria-current={p.view === v ? 'page' : undefined}>
              {INBOX_VIEW_LABEL[v]} <span className="n">{inbox.viewCounts[v] ?? '—'}</span>
            </a>
          ))}
        </nav>

        <form className="c-filters" role="search" method="get" action="/crm/rfqs/" aria-label="Filter inquiries">
          {p.view !== 'open' ? <input type="hidden" name="view" value={p.view} /> : null}
          {p.account ? <input type="hidden" name="account" value={p.account} /> : null}
          {p.contact ? <input type="hidden" name="contact" value={p.contact} /> : null}
          <label className="c-field c-search" htmlFor="crm-search">
            <span>Search</span>
            <input id="crm-search" className="c-input" type="search" name="q" defaultValue={p.q ?? ''} placeholder="RFQ number, company, email, name" autoComplete="off" />
          </label>
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
          <label className="c-field">
            <span>Motion</span>
            <select className="c-select" name="motion" defaultValue={p.motion ?? ''}>
              <option value="">Any</option>
              {Object.entries(MOTION_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
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
          <label className="c-field">
            <span>Sort</span>
            <select className="c-select" name="sort" defaultValue={p.sort}>
              <option value="received_desc">Newest first</option>
              <option value="received_asc">Oldest first</option>
              <option value="status">Status</option>
            </select>
          </label>
          <div className="c-actions">
            <button className="c-btn" type="submit">
              Apply
            </button>
            {filtered ? (
              <a className="c-btn is-ghost" href={p.view === 'open' ? '/crm/rfqs/' : `/crm/rfqs/?view=${p.view}`}>
                Clear all
              </a>
            ) : null}
          </div>
        </form>

        {p.account || p.contact ? (
          <p className="c-banner" role="note">
            Showing inquiries related to one {p.account ? 'account' : 'contact'}. <a href="/crm/rfqs/">Show all</a>
          </p>
        ) : null}
        {accountHits.length > 0 ? (
          <p className="c-hint">
            Accounts matching “{p.q}”:{' '}
            {accountHits.slice(0, 6).map((a, i) => (
              <span key={a.id}>
                {i ? ', ' : ''}
                <a href={`/crm/accounts/${a.id}/`}>{a.name}</a>
              </span>
            ))}
          </p>
        ) : null}

        <div className={`c-split${detail ? '' : ' is-single'}`}>
          <section aria-label="Inquiries">
            {inbox.rows.length === 0 ? (
              <div className="c-panel">
                <p className="c-empty" role="status">
                  {p.q
                    ? `No RFQs match “${p.q}”. Search covers RFQ number, company, email and name.`
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
                now={now}
                selectedId={selected}
                compact={Boolean(detail)}
                caption={`${INBOX_VIEW_LABEL[p.view]} inquiries`}
                hrefFor={(r) => hrefWith(p, {}, { rfq: r.id })}
              />
            )}
            <div className="c-pager">
              <span>
                {from}–{to} of {inbox.total}
              </span>
              {inbox.page > 1 ? <a href={hrefWith(p, { page: String(inbox.page - 1) })}>Previous</a> : null}
              {inbox.page < inbox.pages ? <a href={hrefWith(p, { page: String(inbox.page + 1) })}>Next</a> : null}
            </div>
          </section>
          {detail ? (
            <div>
              <p className="c-hint">
                <a href={`/crm/rfqs/${detail.row.id}/`}>Open full page</a> · <a href={hrefWith(p, {})}>Close pane</a>
              </p>
              <RfqDetailView d={detail} s={s} tab={tab} now={now} mode="pane" tabHref={(t) => hrefWith(p, {}, { rfq: detail.row.id, tab: t === 'summary' ? null : t })} />
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
