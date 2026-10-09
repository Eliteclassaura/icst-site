import type { Metadata } from 'next'
import { loadContact } from '../../../../../crm/workspace/directory'
import { ACTIVITY_LABEL, CONTACT_FUNCTION_LABEL, LINK_CONFIDENCE_LABEL, SOURCE_LABEL, humanSummary, label } from '../../../../../crm/workspace/labels'
import { absoluteTime, compactTime } from '../../../../../crm/workspace/time'
import { IconDoNotContact, IconReview } from '../../../../../crm/workspace/ui/Icons'
import { RfqTable } from '../../../../../crm/workspace/ui/RfqTable'
import { Shell } from '../../../../../crm/workspace/ui/Shell'
import { ClearSuppressionDialog, DoNotContactDialog, FollowUpDialog } from '../../_components/Dialogs'
import { ContactAccountDialog, EditContactDialog } from '../../_components/RecordDialogs'
import { RememberRecent } from '../../_components/SearchPanel'
import { TaskTable } from '../../_components/TaskTable'
import { BackToList } from '../../_components/ListContext'
import { requireCrmSession } from '../../session'

export const metadata: Metadata = { title: 'Contact' }

type Doc = Record<string, unknown>
const Unknown = ({ text = 'Not recorded' }: { text?: string }) => <span className="c-unknown">{text}</span>

/**
 * Wave 1 W1-1 contact profile: who the person is, their account, follow-ups, inquiries and timeline in one place,
 * with safe-field editing. The email address is the contact's identity and stays locked; do-not-contact disables
 * call and email links here exactly as on an inquiry.
 */
export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  const sp = await searchParams
  const s = await requireCrmSession(`/crm/contacts/${encodeURIComponent(id)}/`)
  const now = new Date()
  const c = await loadContact(s, id, now)
  if (!c)
    return (
      <Shell active="contacts" title="Contact" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
        <p className="c-alert" role="alert">
          This contact doesn’t exist or you don’t have access. <a href="/crm/contacts/">Back to contacts</a>
        </p>
      </Shell>
    )
  const k = c.contact
  const cid = String(k.id)
  const outreachBlocked = c.suppressions.some((x) => x.scope === 'ALL_OUTREACH')
  const emailBlocked = c.suppressions.some((x) => x.scope === 'ALL_OUTREACH' || x.scope === 'ALL_EMAIL')
  const email = (k.email as string) || null
  const phone = ((k.phones as Doc[] | undefined)?.[0]?.number_raw as string) || null
  const verified = k.account_link_confidence === 'VERIFIED'
  // UI-1 M4: a link says where it goes — the inquiry's company, else its RFQ number.
  const rfqName = (rid: string) => {
    const r = c.rfqs.find((x) => x.id === rid)
    return r ? (r.company ?? `Inquiry ${r.rfqNumber}`) : 'Earlier inquiry'
  }
  return (
    <Shell active="contacts" title={c.name} crumb={<BackToList kind="contacts" label="Contacts" />} userName={s.displayName} session={s} isAdmin={s.isAdmin}>
      <RememberRecent kind="contact" id={cid} />
      <div className="c-stack">
        {sp.created === '1' ? (
          <p className="c-banner" role="status">
            Contact created.
          </p>
        ) : null}
        {c.suppressions.length > 0 ? (
          <div className="c-banner is-error" role="note">
            <IconDoNotContact />
            <span>
              <strong>Do not contact</strong> — {c.suppressions.map((x) => String(x.reason).replaceAll('_', ' ').toLowerCase()).join(', ')}.{' '}
              {outreachBlocked ? 'Call and email links are disabled.' : 'Email links are disabled.'} {s.isAdmin ? '' : 'Only an admin can clear this.'}
            </span>
          </div>
        ) : null}
        {c.openReviews > 0 ? (
          <p className="c-banner is-warning" role="note">
            <IconReview />
            <span>Identity review open for this contact. Nothing is merged automatically. {s.isAdmin ? '' : 'Resolved by admins.'}</span>
          </p>
        ) : null}

        <section className="c-panel" aria-labelledby="ct-details">
          <div className="c-panel-head">
            <h2 id="ct-details">Details</h2>
            <span className="c-more c-actions">
              <EditContactDialog
                contact={{
                  id: cid,
                  updatedAt: String(k.updatedAt ?? ''),
                  email,
                  firstName: (k.first_name as string) || null,
                  lastName: (k.last_name as string) || null,
                  title: (k.title as string) || null,
                  contactFunction: String(k.contact_function ?? 'UNKNOWN'),
                  phone,
                  ownerId: k.owner ? String(typeof k.owner === 'object' ? (k.owner as Doc).id : k.owner) : null,
                }}
                people={c.people}
              />
              <FollowUpDialog contactId={cid} people={c.people} meId={s.userId} label="New follow-up" />
              {c.suppressions.length === 0 ? (
                <DoNotContactDialog contactId={cid} />
              ) : s.isAdmin ? (
                <ClearSuppressionDialog contactId={cid} suppressions={c.suppressions.map((x) => ({ id: String(x.id), reason: String(x.reason) }))} />
              ) : null}
            </span>
          </div>
          <div className="c-block">
            <dl className="c-dl">
              <dt>Email</dt>
              <dd>
                {email ? emailBlocked ? <span aria-disabled="true">{email} (email disabled)</span> : <a href={`mailto:${email}`}>{email}</a> : <Unknown />}
              </dd>
              <dt>Phone</dt>
              <dd>
                {phone ? outreachBlocked ? <span aria-disabled="true">{phone} (calls disabled)</span> : <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a> : <Unknown />}
              </dd>
              <dt>Title</dt>
              <dd>{(k.title as string) || <Unknown />}</dd>
              <dt>Function</dt>
              <dd>{label(CONTACT_FUNCTION_LABEL, k.contact_function)}</dd>
              <dt>Account</dt>
              <dd>
                <span className="c-actions">
                  {c.account ? (
                    <>
                      <a href={`/crm/accounts/${c.account.id}/`}>{c.account.name}</a>
                      <span className="c-muted">{label(LINK_CONFIDENCE_LABEL, k.account_link_confidence)}</span>
                    </>
                  ) : (
                    <Unknown text="No account linked" />
                  )}
                  <ContactAccountDialog contactId={cid} updatedAt={String(k.updatedAt ?? '')} current={c.account} verified={verified} isAdmin={s.isAdmin} />
                </span>
              </dd>
              {k.company_name_original ? (
                <>
                  <dt>Company as supplied</dt>
                  <dd>{String(k.company_name_original)}</dd>
                </>
              ) : null}
              <dt>Owner</dt>
              <dd>{c.ownerName ?? <span className="c-muted">No owner</span>}</dd>
              <dt>Source</dt>
              <dd>{label(SOURCE_LABEL, (k.provenance as Doc | undefined)?.source_system)}</dd>
            </dl>
          </div>
        </section>

        <section className="c-panel" aria-labelledby="ct-tasks">
          <div className="c-panel-head">
            <h2 id="ct-tasks">Follow-ups</h2>
            <span className="c-count">{c.tasks.length}</span>
          </div>
          {c.tasks.length === 0 ? (
            <p className="c-empty">No open follow-ups.</p>
          ) : (
            <TaskTable rows={c.tasks} now={now} zone={s.timeZone} isAdmin={s.isAdmin} people={c.people} caption={`Follow-ups for ${c.name}`} />
          )}
        </section>

        <section aria-labelledby="ct-rfqs">
          <h2 id="ct-rfqs" className="c-group-label">
            Inquiries · {c.openRfqTotal} open of {c.rfqTotal}
          </h2>
          {c.rfqs.length === 0 ? (
            <div className="c-panel">
              <p className="c-empty">No inquiries from this contact.</p>
            </div>
          ) : (
            <RfqTable rows={c.rfqs} now={now} zone={s.timeZone} caption={`Inquiries from ${c.name}`} hrefFor={(r) => `/crm/rfqs/?rfq=${r.id}&contact=${cid}`} />
          )}
        </section>

        {c.pastRequests.length > 0 ? (
          // IMPORT-TYPEFORM-1: quote requests received before the CRM (read-only history; not in any queue)
          <section className="c-panel" aria-labelledby="ct-past">
            <div className="c-panel-head">
              <h2 id="ct-past">Past quote requests · {c.pastRequests.length}</h2>
            </div>
            <ul className="c-list">
              {c.pastRequests.map((q) => (
                <li key={q.id}>
                  <div className="grow">
                    <p>
                      <strong>{[q.interest, q.part].filter(Boolean).join(' · ') || 'Quote request'}</strong>
                      {q.urgent === 'YES' ? ' · urgent' : ''}
                      {q.country ? ` · ${q.country}` : ''}
                    </p>
                    <p className="c-muted">Received {absoluteTime(new Date(q.submittedAt), s.timeZone)} (website form, before the CRM)</p>
                    {q.details ? <p className="c-past-text">{q.details}</p> : null}
                    {q.notes ? <p className="c-past-text">{q.notes}</p> : null}
                    {q.uploadUrl ? (
                      <p>
                        <a href={q.uploadUrl} target="_blank" rel="noopener noreferrer">
                          File the customer uploaded
                        </a>{' '}
                        <span className="c-muted">(Typeform; may need a sign-in or have expired)</span>
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="c-panel" aria-labelledby="ct-activity">
          <div className="c-panel-head">
            <h2 id="ct-activity">Activity</h2>
          </div>
          <div className="c-block">
            {c.notes.length ? (
              <>
                <p className="c-group-label">Notes</p>
                <ul className="c-timeline" role="list">
                  {c.notes.map((n) => (
                    <li key={n.id}>
                      <time dateTime={n.createdAt}>{compactTime(new Date(n.createdAt), now, s.timeZone)}</time>
                      <span>{n.authorName ?? 'Unknown author'}</span>
                      <p className="c-note-body">{n.body}</p>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <p className="c-group-label">Timeline</p>
            {c.activity.length === 0 ? (
              <p className="c-hint">No activity yet.</p>
            ) : (
              <ul className="c-timeline" role="list">
                {c.activity.map((a) => (
                  <li key={a.id}>
                    <time dateTime={a.occurredAt} title={absoluteTime(new Date(a.occurredAt), s.timeZone)}>
                      {compactTime(new Date(a.occurredAt), now, s.timeZone)}
                    </time>
                    <span>
                      <strong>{label(ACTIVITY_LABEL, a.type)}</strong> · {a.actorKind === 'USER' ? (a.actorName ?? 'CRM user') : 'System'}
                      <br />
                      <span className="c-muted">{humanSummary(a.summary)}</span>
                      {a.rfqId ? (
                        <>
                          {' · '}
                          <a href={`/crm/rfqs/?rfq=${a.rfqId}&tab=activity`}>{rfqName(a.rfqId)}</a>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </Shell>
  )
}
