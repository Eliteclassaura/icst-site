import type { Metadata } from 'next'
import { label, RELATIONSHIP_LABEL, ACTIVITY_LABEL } from '../../../../../crm/workspace/labels'
import { loadAccount } from '../../../../../crm/workspace/queries'
import { compactTime } from '../../../../../crm/workspace/time'
import { IconDoNotContact, IconPlus } from '../../../../../crm/workspace/ui/Icons'
import { RfqTable } from '../../../../../crm/workspace/ui/RfqTable'
import { Shell } from '../../../../../crm/workspace/ui/Shell'
import { StageStatus } from '../../../../../crm/workspace/ui/Status'
import { FollowUpDialog } from '../../_components/Dialogs'
import { EditAccountDialog } from '../../_components/RecordDialogs'
import { RememberRecent } from '../../_components/SearchPanel'
import { TaskTable } from '../../_components/TaskTable'
import { BackToList } from '../../_components/ListContext'
import { requireCrmSession } from '../../session'
import { AttachmentsPanel } from '../../_components/AttachmentsPanel'

export const metadata: Metadata = { title: 'Account' }

type Doc = Record<string, unknown>
const relId = (v: unknown) => (v ? String(typeof v === 'object' ? (v as Doc).id : v) : null)

/**
 * Account profile (Wave 1 W1-1): the company, its contacts, plants/sites with their recorded towers, follow-ups,
 * inquiries, opportunities and recent activity. Safe fields are editable in place (audited); domains, tier, parent,
 * archiving and merges stay admin work. Nothing here invents a technical fact beyond what is recorded.
 */
export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  const sp = await searchParams
  const s = await requireCrmSession(`/crm/accounts/${encodeURIComponent(id)}/`)
  const now = new Date()
  const a = await loadAccount(s, id, now)
  if (!a)
    return (
      <Shell active="accounts" title="Account" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
        <p className="c-alert" role="alert">
          This account doesn’t exist or you don’t have access. <a href="/crm/accounts/">Back to accounts</a>
        </p>
      </Shell>
    )
  const acc = a.account
  const accId = String(acc.id)
  const people = a.people
  const domains = ((acc.domains ?? []) as Doc[]).filter((d) => d.domain_status !== 'RETIRED')
  return (
    <Shell active="accounts" title={String(acc.canonical_name)} crumb={<BackToList kind="accounts" label="Accounts" />} userName={s.displayName} session={s} isAdmin={s.isAdmin}>
      <RememberRecent kind="account" id={accId} />
      <div className="c-stack">
        {sp.created === '1' ? (
          <p className="c-banner" role="status">
            Account created.
          </p>
        ) : null}
        <section className="c-panel" aria-labelledby="acc-details">
          <div className="c-panel-head">
            <h2 id="acc-details">Details</h2>
            <span className="c-more c-actions">
              <EditAccountDialog
                account={{
                  id: accId,
                  updatedAt: String(acc.updatedAt ?? ''),
                  name: String(acc.canonical_name ?? ''),
                  legalName: (acc.legal_name as string) || null,
                  industry: (acc.industry as string) || null,
                  relationship: String(acc.relationship_state ?? 'UNKNOWN'),
                  ownerId: relId(acc.owner),
                }}
                people={people}
                isAdmin={s.isAdmin}
              />
              <FollowUpDialog accountId={accId} people={people} meId={s.userId} label="New follow-up" />
            </span>
          </div>
          <div className="c-block">
            <dl className="c-dl">
              <dt>Relationship</dt>
              <dd>{label(RELATIONSHIP_LABEL, acc.relationship_state)}</dd>
              <dt>Owner</dt>
              <dd>{a.ownerName ?? <span className="c-muted">No owner</span>}</dd>
              <dt>Legal name</dt>
              <dd>{(acc.legal_name as string) || <span className="c-unknown">Not recorded</span>}</dd>
              <dt>Domains</dt>
              <dd>
                {domains.length
                  ? domains.map((d) => `${String(d.domain)}${String(d.domain_status).startsWith('VERIFIED') ? ' (verified)' : ' (unverified)'}`).join(', ')
                  : <span className="c-unknown">None recorded</span>}
              </dd>
              <dt>Industry</dt>
              <dd>{(acc.industry as string) || <span className="c-unknown">Not recorded</span>}</dd>
            </dl>
            {acc.name_from_domain ? (
              <p className="c-banner is-warning" role="note">
                This name was taken from the domain by an import because the file gave no company name. Use Edit details to correct it.
              </p>
            ) : null}
            {a.openReviews > 0 ? (
              <p className="c-banner is-warning" role="note">
                Possible duplicate or conflict — identity review open. {s.isAdmin ? '' : 'Resolved by admins.'}
              </p>
            ) : null}
          </div>
        </section>

        <section className="c-panel" aria-labelledby="acc-tasks">
          <div className="c-panel-head">
            <h2 id="acc-tasks">Follow-ups</h2>
            <span className="c-count">{a.taskTotal}</span>
          </div>
          {a.tasks.length === 0 ? (
            <p className="c-empty">No open follow-ups.</p>
          ) : (
            <TaskTable rows={a.tasks} now={now} zone={s.timeZone} isAdmin={s.isAdmin} people={people} caption={`Follow-ups for ${String(acc.canonical_name)}`} showRelated={false} />
          )}
        </section>

        <section className="c-panel" aria-labelledby="acc-contacts">
          <div className="c-panel-head">
            <h2 id="acc-contacts">Contacts</h2>
            <span className="c-count">{a.contacts.length}</span>
            <a className="c-more" href={`/crm/contacts/new/?account=${accId}`}>
              <IconPlus /> New contact
            </a>
          </div>
          {a.contacts.length === 0 ? (
            <p className="c-empty">No contacts linked to this account.</p>
          ) : (
            <ul className="c-list" role="list">
              {a.contacts.map((c) => (
                <li key={c.id}>
                  <span className="grow">
                    <a className="c-trunc" href={`/crm/contacts/${c.id}/`}>
                      <strong>{c.name}</strong>
                    </a>
                    <span className="c-hint">{c.title ?? 'Title not recorded'}</span>
                  </span>
                  {c.doNotContact ? (
                    <span className="c-flag-dnc c-actions">
                      <IconDoNotContact label="Do not contact" /> Do not contact
                    </span>
                  ) : c.email ? (
                    <a className="c-trunc hide-sm" href={`mailto:${c.email}`}>
                      {c.email}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="c-panel" aria-labelledby="acc-plants">
          <div className="c-panel-head">
            <h2 id="acc-plants">Plants &amp; towers</h2>
            <span className="c-count">{a.sites.length}</span>
          </div>
          {a.sites.length === 0 ? (
            <p className="c-empty">No plants recorded for this account.</p>
          ) : (
            <ul className="c-list" role="list">
              {a.sites.map((x) => (
                <li key={x.id} id={`site-${x.id}`}>
                  <span className="grow">
                    <strong className="c-trunc">{x.name}</strong>
                    <span className="c-hint">
                      {x.place ?? 'Location not recorded'} ·{' '}
                      {x.assets.length ? x.assets.map((t) => t.name).join(', ') : 'No towers recorded'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="acc-rfqs">
          <h2 id="acc-rfqs" className="c-group-label">
            Recent inquiries · <a href={`/crm/rfqs/?account=${accId}`}>all {a.rfqTotal} for this account</a>
          </h2>
          {a.rfqs.length === 0 ? (
            <div className="c-panel">
              <p className="c-empty">No inquiries for this account.</p>
            </div>
          ) : (
            <RfqTable rows={a.rfqs} now={now} zone={s.timeZone} caption="Inquiries for this account" hrefFor={(r) => `/crm/rfqs/?rfq=${r.id}&account=${accId}`} />
          )}
        </section>

        <section className="c-panel" aria-labelledby="acc-opps">
          <div className="c-panel-head">
            <h2 id="acc-opps">Opportunities</h2>
            <span className="c-count">{a.opportunities.length}</span>
          </div>
          {a.opportunities.length === 0 ? (
            <p className="c-empty">No opportunities.</p>
          ) : (
            <ul className="c-list" role="list">
              {a.opportunities.map((o) => (
                <li key={o.id}>
                  <span className="grow c-trunc">{o.name}</span>
                  <StageStatus value={o.stage} />
                  <span className="c-muted">{o.ownerName ?? 'No owner'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="c-panel" aria-labelledby="acc-activity">
          <div className="c-panel-head">
            <h2 id="acc-activity">Recent activity</h2>
          </div>
          {a.activity.length === 0 ? (
            <p className="c-empty">No activity.</p>
          ) : (
            <ul className="c-list" role="list">
              {a.activity.map((x) => (
                <li key={x.id}>
                  <span className="c-muted">{compactTime(new Date(x.occurredAt), now, s.timeZone)}</span>
                  <span className="grow c-trunc">
                    <strong>{label(ACTIVITY_LABEL, x.type)}</strong> · {x.actorKind === 'USER' ? (x.actorName ?? 'CRM user') : 'System'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <AttachmentsPanel s={s} kind="ACCOUNT" recordId={id} />
      </div>
    </Shell>
  )
}
