import type { Metadata } from 'next'
import { label, RELATIONSHIP_LABEL, ACTIVITY_LABEL } from '../../../../../crm/workspace/labels'
import { loadAccount } from '../../../../../crm/workspace/queries'
import { compactTime } from '../../../../../crm/workspace/time'
import { IconDoNotContact } from '../../../../../crm/workspace/ui/Icons'
import { RfqTable } from '../../../../../crm/workspace/ui/RfqTable'
import { Shell } from '../../../../../crm/workspace/ui/Shell'
import { StageStatus } from '../../../../../crm/workspace/ui/Status'
import { FollowUpDialog } from '../../_components/Dialogs'
import { requireCrmSession } from '../../session'
import { crmUsers } from '../../../../../crm/workspace/queries'

export const metadata: Metadata = { title: 'Account' }

type Doc = Record<string, unknown>

/**
 * Account context (bounded for UI-1): the company, its contacts, plants/sites with their recorded towers,
 * its inquiries and opportunities, and recent activity. Read-only apart from follow-ups; no editing of
 * account structure, no merges, no technical facts beyond what is recorded.
 */
export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const s = await requireCrmSession(`/crm/accounts/${encodeURIComponent(id)}/`)
  const now = new Date()
  const [a, people] = await Promise.all([loadAccount(s, id, now), crmUsers(s)])
  if (!a)
    return (
      <Shell active="none" title="Account" userName={s.displayName} isAdmin={s.isAdmin}>
        <p className="c-alert" role="alert">
          This account doesn’t exist or you don’t have access. <a href="/crm/rfqs/">Back to the inbox</a>
        </p>
      </Shell>
    )
  const acc = a.account
  const domains = ((acc.domains ?? []) as Doc[]).filter((d) => d.domain_status !== 'RETIRED')
  return (
    <Shell active="none" title={String(acc.canonical_name)} crumb="Account" userName={s.displayName} isAdmin={s.isAdmin}>
      <div className="c-stack">
        <section className="c-panel" aria-label="Account">
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
            {a.openReviews > 0 ? (
              <p className="c-banner is-warning" role="note">
                Possible duplicate or conflict — identity review open. {s.isAdmin ? '' : 'Resolved by admins.'}
              </p>
            ) : null}
          </div>
          <div className="c-block">
            <div className="c-actions">
              <a className="c-btn" href={`/crm/rfqs/?account=${String(acc.id)}`}>
                All {a.rfqTotal} related inquiries
              </a>
              <FollowUpDialog accountId={String(acc.id)} people={people} meId={s.userId} />
            </div>
          </div>
        </section>

        <section className="c-panel" aria-label="Contacts">
          <div className="c-panel-head">
            <h2>Contacts</h2>
            <span className="c-count">{a.contacts.length}</span>
          </div>
          {a.contacts.length === 0 ? (
            <p className="c-empty">No contacts linked to this account.</p>
          ) : (
            <ul className="c-list" role="list">
              {a.contacts.map((c) => (
                <li key={c.id}>
                  <span className="grow">
                    <strong className="c-trunc">{c.name}</strong>
                    <span className="c-hint">{c.title ?? 'Title not recorded'}</span>
                  </span>
                  {c.doNotContact ? (
                    <span className="c-flag-dnc c-actions">
                      <IconDoNotContact label="Do not contact" /> Do not contact
                    </span>
                  ) : c.email ? (
                    <a href={`mailto:${c.email}`}>{c.email}</a>
                  ) : null}
                  <a href={`/crm/rfqs/?contact=${c.id}`}>Inquiries</a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="c-panel" aria-label="Plants and towers">
          <div className="c-panel-head">
            <h2>Plants &amp; towers</h2>
            <span className="c-count">{a.sites.length}</span>
          </div>
          {a.sites.length === 0 ? (
            <p className="c-empty">No plants recorded for this account.</p>
          ) : (
            <ul className="c-list" role="list">
              {a.sites.map((x) => (
                <li key={x.id}>
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

        <section aria-label="Inquiries">
          <h2 className="c-group-label">Recent inquiries</h2>
          {a.rfqs.length === 0 ? (
            <div className="c-panel">
              <p className="c-empty">No inquiries for this account.</p>
            </div>
          ) : (
            <RfqTable rows={a.rfqs} now={now} caption="Inquiries for this account" hrefFor={(r) => `/crm/rfqs/?rfq=${r.id}&account=${String(acc.id)}`} />
          )}
        </section>

        <section className="c-panel" aria-label="Opportunities">
          <div className="c-panel-head">
            <h2>Opportunities</h2>
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

        <section className="c-panel" aria-label="Recent activity">
          <div className="c-panel-head">
            <h2>Recent activity</h2>
          </div>
          {a.activity.length === 0 ? (
            <p className="c-empty">No activity.</p>
          ) : (
            <ul className="c-list" role="list">
              {a.activity.map((x) => (
                <li key={x.id}>
                  <span className="c-muted">{compactTime(new Date(x.occurredAt), now)}</span>
                  <span className="grow c-trunc">
                    <strong>{label(ACTIVITY_LABEL, x.type)}</strong> · {x.actorKind === 'USER' ? (x.actorName ?? 'CRM user') : 'System'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Shell>
  )
}
