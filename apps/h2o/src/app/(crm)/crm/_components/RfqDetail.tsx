import { humanSummary,
  REPLIES_OFF_NOTE,
  ACCOUNT_MATCH_LABEL,
  ACTIVITY_LABEL,
  CONTACT_MATCH_LABEL,
  IDENTITY_REASON_LABEL,
  MOTION_LABEL,
  QUALIFICATION_LABEL,
  RELATIONSHIP_LABEL,
  OFFICE_SOURCE_LABEL,
  SOURCE_LABEL,
  SUBMITTED_FIELD_LABEL,
  TASK_KIND_LABEL,
  TYPEFORM_ANSWER_LABEL,
  label,
} from '../../../../crm/workspace/labels'
import type { ReplyReadiness } from '../../../../crm/reply'
import type { RfqDetail } from '../../../../crm/workspace/queries'
import type { CrmSession } from '../../../../crm/workspace/session'
import { absoluteTime, compactTime, relativeAge } from '../../../../crm/workspace/time'
import { CountryFlag, ReplyChip, TypeBadge } from '../../../../crm/workspace/ui/Facets'
import { OFFICE_LABEL } from '../../../../crm/offices'
import { IconDoNotContact, IconInfo, IconMore, IconReview, IconUrgent } from '../../../../crm/workspace/ui/Icons'
import { Overflow } from '../../../../crm/workspace/ui/Overflow'
import { RememberRecent } from './SearchPanel'

const MENU = 'c-menu-item'
import { DueLabel } from '../../../../crm/workspace/ui/Due'
import { RfqStatus } from '../../../../crm/workspace/ui/Status'
import {
  AssignDialog,
  AssignMe,
  ClearSuppressionDialog,
  CloseDialog,
  DoNotContactDialog,
  FollowUpDialog,
  LinkAccountDialog,
  LogDialog,
  NoteDialog,
  MoveOfficeButton,
  ReopenButton,
  RequestInfoDialog,
  ResolveReviewDialog,
  SiteDialog,
  StartReview,
  TaskActions,
} from './Dialogs'
import { DealLinkSlot, QualifySlot } from './DealSlots'
import { ReplyComposer } from './EmailPanel'
import type { ComposerTemplates } from '../../../../crm/settings/templates'

type Doc = Record<string, unknown>
export const RFQ_TABS = ['summary', 'answers', 'items', 'email', 'activity', 'technical'] as const
export type RfqTab = (typeof RFQ_TABS)[number]
const TAB_LABEL: Record<RfqTab, string> = { summary: 'Summary', answers: 'Answers', items: 'Items', email: 'Email', activity: 'Activity', technical: 'Technical' }
const MESSAGE_STATUS_LABEL: Record<string, string> = { QUEUED: 'Sending', SENT: 'Sent', FAILED: 'Failed', NOT_SENT: 'Not sent', RECEIVED: 'Received' }
/** CRM email M2: what the page knows about writing a reply here (full page only; the inbox pane links to it). */
export type ReplyPanel = { readiness: ReplyReadiness; token: string; templates?: ComposerTemplates }
const TERMINAL = ['REJECTED_NON_CORE', 'DUPLICATE_OF_EXISTING', 'CLOSED']

const Value = ({ v, missing = 'Not supplied' }: { v: unknown; missing?: string }) =>
  typeof v === 'string' && v.trim() ? <>{v}</> : typeof v === 'number' ? <>{v}</> : <span className="c-unknown">{missing}</span>

const Origin = ({ who }: { who: 'CUSTOMER' | 'STAFF' }) => <span className="c-tag">{who === 'CUSTOMER' ? 'Customer' : 'Staff'}</span>

export function RfqDetailView({
  d,
  s,
  tab,
  tabHref,
  now,
  mode,
  notices = [],
  reply,
}: {
  d: RfqDetail
  reply?: ReplyPanel
  s: CrmSession
  tab: RfqTab
  tabHref: (t: RfqTab) => string
  now: Date
  mode: 'pane' | 'page'
  notices?: string[]
}) {
  const rfq = d.rfq
  const submitted = (rfq.submitted ?? {}) as Doc
  const status = String(rfq.status)
  const updatedAt = String(rfq.updatedAt ?? '')
  const rfqId = String(rfq.id)
  const received = new Date(String(rfq.received_at))
  const isTerminal = TERMINAL.includes(status)
  const isManual = rfq.source_system === 'MANUAL_ENTRY'
  const outreachBlocked = d.suppressions.some((x) => x.scope === 'ALL_OUTREACH')
  const emailBlocked = d.suppressions.some((x) => x.scope === 'ALL_OUTREACH' || x.scope === 'ALL_EMAIL')
  const creator = isManual ? d.activity.find((a) => a.type === 'RFQ_CREATED')?.actorName : null
  const contactName = String(d.contact?.display_name || [submitted.first_name, submitted.last_name].filter(Boolean).join(' ') || '')
  const email = (d.contact?.email as string) || (submitted.email as string) || null
  const phone = ((d.contact?.phones as Doc[] | undefined)?.[0]?.number_raw as string) || (submitted.phone as string) || null
  const other = (submitted.other_answers && typeof submitted.other_answers === 'object' ? submitted.other_answers : {}) as Doc

  return (
    <article className={`c-detail${mode === 'page' ? ' is-page' : ''}`} aria-labelledby="rfq-title">
      <RememberRecent kind="rfq" id={rfqId} />
      <header className="c-detail-head">
        {/* Polish R1 header hierarchy: eyebrow (reference, source, received) → title → facts (status, owner, reply due,
            queue, type) → actions. */}
        <div className="c-detail-meta">
          <span className="c-mono">{String(rfq.rfq_number)}</span>
          <span>
            {label(SOURCE_LABEL, rfq.source_system)}
            {isManual && creator ? ` · entered by ${creator}` : ''}
          </span>
          <span title={absoluteTime(received, s.timeZone)}>
            Received {relativeAge(received, now)} · {compactTime(received, now, s.timeZone)}
          </span>
        </div>
        <h2 id="rfq-title">{d.row.company ?? (contactName || 'Inquiry')}</h2>
        <dl className="c-facts">
          <div>
            <dt>Status</dt>
            <dd>
              <RfqStatus value={status} />
            </dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>{d.row.ownerName ?? <span className="c-warn-text">Unassigned</span>}</dd>
          </div>
          <div>
            <dt>Reply due</dt>
            <dd>
              <ReplyChip reply={d.row.reply} now={now} zone={s.timeZone} />
            </dd>
          </div>
          <div>
            <dt>Queue</dt>
            <dd>{OFFICE_LABEL[d.row.office ?? 'US']}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>
              <TypeBadge type={d.row.type} title={d.row.interest} />
            </dd>
          </div>
          <div>
            <dt>Country</dt>
            <dd>
              <CountryFlag code={d.row.countryCode} source={d.row.countrySource} />
            </dd>
          </div>
        </dl>
        {/* W1-8 action hierarchy: one primary action for the next state, one secondary (ownership), the rest in More.
            On a phone this row is a sticky action bar. */}
        <div className="c-actions c-action-bar">
          {(status === 'RECEIVED' || status === 'NEEDS_REVIEW') && <StartReview rfqId={rfqId} updatedAt={updatedAt} />}
          {status === 'IN_REVIEW' && <QualifySlot s={s} rfq={rfq} people={d.people} />}
          {status === 'QUALIFIED' ? <FollowUpDialog rfqId={rfqId} people={d.people} meId={s.userId} buttonClassName="c-btn is-primary" /> : null}
          {isTerminal && s.isAdmin ? <ReopenButton rfqId={rfqId} updatedAt={updatedAt} primary /> : null}
          {!isTerminal && d.row.ownerId !== s.userId ? <AssignMe rfqId={rfqId} updatedAt={updatedAt} /> : null}
          {!isTerminal && d.row.ownerId === s.userId ? (
            <AssignDialog rfqId={rfqId} updatedAt={updatedAt} people={d.people} currentId={d.row.ownerId} isAdmin={s.isAdmin} />
          ) : null}
          <Overflow label={<><IconMore /> More</>} ariaLabel="More actions for this inquiry">
            {!isTerminal && d.row.ownerId !== s.userId ? (
              <AssignDialog rfqId={rfqId} updatedAt={updatedAt} people={d.people} currentId={d.row.ownerId} isAdmin={s.isAdmin} buttonClassName={MENU} />
            ) : null}
            <NoteDialog rfqId={rfqId} buttonClassName={MENU} />
            <LogDialog rfqId={rfqId} doNotContact={outreachBlocked} buttonClassName={MENU} />
            {status !== 'QUALIFIED' ? <FollowUpDialog rfqId={rfqId} people={d.people} meId={s.userId} label="New follow-up" buttonClassName={MENU} /> : null}
            {status === 'IN_REVIEW' ? <RequestInfoDialog rfqId={rfqId} updatedAt={updatedAt} buttonClassName={MENU} /> : null}
            {!isTerminal ? <CloseDialog rfqId={rfqId} updatedAt={updatedAt} buttonClassName={MENU} /> : null}
          </Overflow>
        </div>
        {isTerminal && !s.isAdmin ? <p className="c-hint">Closed RFQs can be reopened by admins only.</p> : null}
      </header>

      {notices.map((n) => (
        <p key={n} className="c-banner" role="status">
          <IconInfo />
          <span>{n}</span>
        </p>
      ))}
      {d.suppressions.length > 0 ? (
        <div className="c-banner is-error" role="note">
          <IconDoNotContact />
          <span>
            <strong>Do not contact</strong> — {d.suppressions.map((x) => String(x.reason).replaceAll('_', ' ').toLowerCase()).join(', ')}.{' '}
            {outreachBlocked ? 'Call and email links are disabled.' : 'Email links are disabled.'} Past calls and emails can still be logged.
            {s.isAdmin ? ' ' : ' Only an admin can clear this.'}
          </span>
        </div>
      ) : null}
      {d.reviews.length > 0 ? (
        <div className="c-banner is-warning" role="note">
          <IconReview />
          <span>
            <strong>Identity review open</strong> — {d.reviews.map((r) => label(IDENTITY_REASON_LABEL, r.reason)).join('; ')}. Nothing is merged or linked
            automatically. {s.isAdmin ? '' : 'Resolved by admins.'}
          </span>
          {s.isAdmin ? d.reviews.map((r) => <ResolveReviewDialog key={r.id} reviewId={r.id} />) : null}
        </div>
      ) : null}
      {d.row.flags.urgent ? (
        <p className="c-banner is-warning" role="note">
          <IconUrgent />
          <span>Customer marked this request urgent. No response time is promised.</span>
        </p>
      ) : null}

      <nav className="c-tabs" aria-label="RFQ sections">
        {RFQ_TABS.map((t) => (
          <a
            key={t}
            href={tabHref(t)}
            aria-current={tab === t ? 'page' : undefined}
            className={t === 'technical' ? 'c-tab-technical' : undefined}
          >
            {TAB_LABEL[t]}
          </a>
        ))}
      </nav>

      {tab === 'summary' ? (
        <>
          <section className="c-block" aria-labelledby="b-inquiry">
            <h3 id="b-inquiry">Inquiry</h3>
            <dl className="c-dl">
              <dt>Request {isManual ? <Origin who="CUSTOMER" /> : null}</dt>
              <dd>
                {submitted.message ? <p className="c-message">{String(submitted.message)}</p> : <span className="c-unknown">Not supplied</span>}
              </dd>
              <dt>Interest {d.row.interestOrigin === 'STAFF' ? <Origin who="STAFF" /> : null}</dt>
              <dd>{d.row.interest}</dd>
              {typeof other.destination_country === 'string' ? (
                <>
                  <dt>Country of destination</dt>
                  <dd>{other.destination_country}</dd>
                </>
              ) : null}
            </dl>
          </section>
          <section className="c-block" aria-labelledby="b-contact">
            <h3 id="b-contact">
              Contact
              {d.contact && d.suppressions.length === 0 ? (
                <span className="c-more">
                  <DoNotContactDialog contactId={String(d.contact.id)} />
                </span>
              ) : null}
              {d.contact && d.suppressions.length > 0 && s.isAdmin ? (
                <span className="c-more">
                  <ClearSuppressionDialog contactId={String(d.contact.id)} suppressions={d.suppressions.map((x) => ({ id: String(x.id), reason: String(x.reason) }))} />
                </span>
              ) : null}
            </h3>
            <dl className="c-dl">
              <dt>Name {isManual ? <Origin who="CUSTOMER" /> : null}</dt>
              <dd>
                {d.contact && contactName ? <a href={`/crm/contacts/${String(d.contact.id)}/`}>{contactName}</a> : <Value v={contactName} />}
              </dd>
              <dt>Title</dt>
              <dd>
                <Value v={d.contact?.title} />
              </dd>
              <dt>Email</dt>
              <dd>
                {email ? emailBlocked ? <span aria-disabled="true">{email} (email disabled)</span> : <a href={`mailto:${email}`}>{email}</a> : <span className="c-unknown">Not supplied</span>}
              </dd>
              <dt>Phone</dt>
              <dd>
                {phone ? outreachBlocked ? <span aria-disabled="true">{phone} (calls disabled)</span> : <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a> : <span className="c-unknown">Not supplied</span>}
              </dd>
              <dt>Record</dt>
              <dd>{label(CONTACT_MATCH_LABEL, rfq.contact_match_state)}</dd>
            </dl>
          </section>
          <section className="c-block" aria-labelledby="b-company">
            <h3 id="b-company">
              Company
              {!isTerminal ? (
                <span className="c-more c-actions">
                  <LinkAccountDialog rfqId={rfqId} updatedAt={updatedAt} suggestion={(submitted.company as string) ?? null} linked={Boolean(d.account)} />
                </span>
              ) : null}
            </h3>
            <dl className="c-dl">
              <dt>As supplied {isManual ? <Origin who="CUSTOMER" /> : null}</dt>
              <dd>
                <Value v={submitted.company} />
              </dd>
              <dt>Account</dt>
              <dd>
                {d.account ? (
                  <a href={`/crm/accounts/${String(d.account.id)}/`}>{String(d.account.canonical_name)}</a>
                ) : (
                  <span className="c-unknown">{label(ACCOUNT_MATCH_LABEL, rfq.account_match_state)}</span>
                )}
                {d.account ? <span className="c-muted"> · {label(ACCOUNT_MATCH_LABEL, rfq.account_match_state)}</span> : null}
              </dd>
              {d.account ? (
                <>
                  <dt>Relationship</dt>
                  <dd>{label(RELATIONSHIP_LABEL, d.account.relationship_state)}</dd>
                </>
              ) : null}
            </dl>
          </section>
          <section className="c-block" aria-labelledby="b-plant">
            <h3 id="b-plant">
              Plant / site
              {d.account && !isTerminal && d.accountSites.length > 0 ? (
                <span className="c-more">
                  <SiteDialog rfqId={rfqId} updatedAt={updatedAt} sites={d.accountSites} currentId={d.site ? String(d.site.id) : null} />
                </span>
              ) : null}
            </h3>
            {d.site ? (
              <dl className="c-dl">
                <dt>Plant</dt>
                <dd>{String(d.site.site_name ?? 'Unnamed site')}</dd>
                <dt>Location</dt>
                <dd>
                  <Value v={[d.site.city, d.site.region].filter(Boolean).join(', ')} missing="Unknown" />
                </dd>
              </dl>
            ) : (
              <p className="c-hint">
                {d.account
                  ? d.accountSites.length
                    ? 'No plant associated yet.'
                    : 'The linked account has no recorded plants.'
                  : 'Link an account first; plants belong to an account.'}
              </p>
            )}
          </section>
          <section className="c-block" aria-labelledby="b-qual">
            <h3 id="b-qual">Qualification</h3>
            <dl className="c-dl">
              <dt>State</dt>
              <dd>{label(QUALIFICATION_LABEL, rfq.qualification_state)}</dd>
              <dt>Motion {rfq.motion ? <Origin who="STAFF" /> : null}</dt>
              <dd>
                <Value v={rfq.motion ? MOTION_LABEL[String(rfq.motion)] : null} missing="Not classified" />
              </dd>
              <dt>Requirements</dt>
              <dd>{rfq.account ? 'Account linked.' : <span className="c-warn-text">Link an account to qualify.</span>}</dd>
              {rfq.opportunity ? (
                <>
                  <dt>Deal</dt>
                  <dd>
                    <DealLinkSlot s={s} opportunityId={String(typeof rfq.opportunity === 'object' ? (rfq.opportunity as Doc).id : rfq.opportunity)} />
                  </dd>
                </>
              ) : null}
            </dl>
          </section>
          <section className="c-block" aria-labelledby="b-next">
            <h3 id="b-next">Follow-ups</h3>
            {d.tasks.length === 0 ? (
              <p className="c-hint">No follow-ups.</p>
            ) : (
              <ul className="c-list" role="list">
                {d.tasks.map((t) => (
                  <li key={t.id}>
                    <span className="grow">
                      <span className="c-trunc">
                        {t.title} <span className="c-tag">{label(TASK_KIND_LABEL, t.kind)}</span>
                      </span>
                      <span className="c-hint">
                        {t.status === 'DONE' || t.status === 'CANCELLED' ? (
                          t.status === 'DONE' ? 'Done' : 'Canceled'
                        ) : (
                          <DueLabel dueAt={t.dueAt} overdue={t.overdue} now={now} zone={s.timeZone} />
                        )}{' '}
                        · {t.assigneeName ?? 'Unassigned'}
                      </span>
                    </span>
                    <TaskActions task={t} isAdmin={s.isAdmin} people={d.people} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      {tab === 'answers' ? (
        <section className="c-block" aria-labelledby="b-answers">
          <h3 id="b-answers">Answers {isManual ? <span className="c-muted">(entered by staff on the customer’s behalf)</span> : null}</h3>
          <dl className="c-dl">
            {(['email', 'first_name', 'last_name', 'company', 'phone', 'message'] as const).map((k) => (
              <div key={k} className="c-contents">
                <dt>{SUBMITTED_FIELD_LABEL[k]}</dt>
                <dd>{k === 'message' && submitted[k] ? <p className="c-message">{String(submitted[k])}</p> : <Value v={submitted[k]} missing="Not answered" />}</dd>
              </div>
            ))}
            {Object.entries(other).map(([k, v]) => (
              <div key={k} className="c-contents">
                <dt>{TYPEFORM_ANSWER_LABEL[k] ?? 'Question label unavailable'}</dt>
                <dd>
                  <Value v={v} missing="Not answered" />
                  {!TYPEFORM_ANSWER_LABEL[k] && s.isAdmin ? <span className="c-muted c-mono"> · field ref {k}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {tab === 'items' ? (
        <section className="c-block" aria-labelledby="b-items">
          <h3 id="b-items">Items</h3>
          {d.items.length === 0 ? (
            <p className="c-hint">No product lines. {isManual ? 'Manual inquiries record no product ids.' : ''}</p>
          ) : (
            <div className="c-table-wrap">
              <table className="c-table">
                <caption className="c-visually-hidden">Requested items</caption>
                <thead>
                  <tr>
                    <th scope="col">Line</th>
                    <th scope="col">Product (as supplied)</th>
                    <th scope="col">Resolution</th>
                    <th scope="col" className="num">
                      Quantity
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((i) => (
                    <tr key={String(i.id)}>
                      <td>{String(i.line_no)}</td>
                      <td>
                        <Value v={i.product_title_source ?? i.product_slug_source} />
                      </td>
                      <td>
                        {i.product_resolution_state === 'RESOLVED_EXACT_SLUG'
                          ? 'Matched catalog product (exact slug)'
                          : i.product_resolution_state === 'UNRESOLVED'
                            ? 'Not matched to the catalog'
                            : i.product_resolution_state === 'INVALID_CONTEXT'
                              ? 'Invalid product context'
                              : 'Not supplied'}
                      </td>
                      <td className="num">{i.quantity_status === 'KNOWN' ? String(i.requested_quantity) : <span className="c-unknown">Not supplied</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="c-hint">“Not supplied” means the customer did not say; it is never shown as 0.</p>
        </section>
      ) : null}

      {tab === 'email' ? (
        <section className="c-block" aria-labelledby="b-email">
          <h3 id="b-email">Email with the customer</h3>
          {d.messages.length === 0 ? (
            <p className="c-hint">No emails on this inquiry yet.</p>
          ) : (
            <ul className="c-timeline" role="list">
              {d.messages.map((m) => (
                <li key={m.id}>
                  <time dateTime={m.occurredAt} title={absoluteTime(new Date(m.occurredAt), s.timeZone)}>
                    {compactTime(new Date(m.occurredAt), now, s.timeZone)}
                  </time>
                  <span>
                    <strong>{m.direction === 'OUTBOUND' ? `To customer · ${m.authorName ?? 'CRM user'}` : 'From customer'}</strong> ·{' '}
                    <span className={m.status === 'FAILED' || m.status === 'NOT_SENT' ? 'c-warn-text' : 'c-muted'}>
                      {MESSAGE_STATUS_LABEL[m.status] ?? m.status}
                      {m.statusCode ? ` (${m.statusCode})` : ''}
                    </span>
                    <br />
                    <span>{m.subject}</span>
                    <p className="c-message">{m.body}</p>
                    {m.attachmentsWithheld.length ? (
                      <span className="c-muted">
                        Attachments withheld (not stored): {m.attachmentsWithheld.join(', ')}. Ask the customer to send files another way.
                        <br />
                      </span>
                    ) : null}
                    {m.messageId ? <span className="c-muted c-mono">{m.messageId}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {mode === 'page' ? (
            <p className="c-hint">
              <a href={`/crm/sequences/enroll/?rfq=${encodeURIComponent(rfqId)}`}>Start a follow-up sequence</a> (qualification or missing information).
            </p>
          ) : null}
          {!reply ? (
            <p className="c-hint">
              <a href={`/crm/rfqs/${rfqId}/?tab=email`}>Open the full page</a> to write to the customer.
            </p>
          ) : reply.readiness.state === 'READY' ? (
            <>
              <p className="c-hint">
                To {reply.readiness.to}. Sent from the company address; the customer’s reply comes back to this inquiry.
              </p>
              {reply.readiness.mode === 'allowlist' ? (
                <p className="c-banner is-warning" role="note">
                  <IconInfo />
                  <span>
                    Test mode: only allow-listed addresses receive email here.
                    {reply.readiness.allowlisted ? '' : ' This address is not on the list, so the reply will be saved but not sent.'}
                  </span>
                </p>
              ) : null}
              {reply.templates && reply.templates.options.length ? <TemplatePicker rfqId={rfqId} t={reply.templates} /> : null}
              <ReplyComposer
                key={reply.templates?.picked?.result.ok ? `${reply.templates.picked.code}:${reply.templates.picked.choices.join('|')}` : 'blank'}
                rfqId={rfqId}
                token={reply.token}
                defaultSubject={reply.templates?.picked?.result.ok ? reply.templates.picked.result.subject : `Your request ${String(rfq.rfq_number)}`}
                defaultBody={reply.templates?.picked?.result.ok ? reply.templates.picked.result.body : ''}
              />
            </>
          ) : (
            <p className="c-banner is-warning" role="note">
              <IconInfo />
              <span>
                {reply.readiness.state === 'REPLIES_OFF'
                  ? REPLIES_OFF_NOTE
                  : reply.readiness.state === 'MODE_OFF'
                  ? 'Email sending is turned off on this environment. Use “Log call / reference” to record an email sent elsewhere.'
                  : reply.readiness.state === 'NO_ADDRESS'
                    ? 'This inquiry has no valid email address.'
                    : reply.readiness.state === 'SUPPRESSED'
                      ? 'This contact is on do-not-contact. Email can’t be sent.'
                      : 'Email is not set up on this environment.'}
              </span>
            </p>
          )}
        </section>
      ) : null}

      {tab === 'activity' ? (
        <section className="c-block" aria-labelledby="b-activity">
          <h3 id="b-activity">Activity</h3>
          {d.notes.length ? (
            <>
              <p className="c-group-label">Notes</p>
              <ul className="c-timeline" role="list">
                {d.notes.map((n) => (
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
          {d.activity.length === 0 ? (
            <p className="c-hint">No activity yet.</p>
          ) : (
            <ul className="c-timeline" role="list">
              {d.activity.map((a) => (
                <li key={a.id}>
                  <time dateTime={a.occurredAt} title={absoluteTime(new Date(a.occurredAt), s.timeZone)}>
                    {compactTime(new Date(a.occurredAt), now, s.timeZone)}
                  </time>
                  <span>
                    <strong>{label(ACTIVITY_LABEL, a.type)}</strong> · {a.actorKind === 'USER' ? (a.actorName ?? 'CRM user') : 'System'}
                    <br />
                    <span className="c-muted">{humanSummary(a.summary)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'technical' ? (
        <section className="c-block" aria-labelledby="b-tech">
          <details className="c-tech">
            <summary id="b-tech">Technical details</summary>
            <dl className="c-dl">
              <dt>RFQ number</dt>
              <dd className="c-mono">{String(rfq.rfq_number)}</dd>
              <dt>Canonical id</dt>
              <dd className="c-mono">{String(rfq.canonical_id ?? '')}</dd>
              <dt>Source</dt>
              <dd>{label(SOURCE_LABEL, rfq.source_system)}</dd>
              <dt>Received</dt>
              <dd>{absoluteTime(received, s.timeZone)}</dd>
              <dt>Office queue</dt>
              <dd>
                {OFFICE_LABEL[d.row.office ?? 'US']} <span className="c-muted">({label(OFFICE_SOURCE_LABEL, rfq.office_source)})</span>{' '}
                <MoveOfficeButton rfqId={d.row.id} updatedAt={d.row.updatedAt} office={d.row.office} />
              </dd>
              <dt>Intake processing</dt>
              <dd>{d.intakeState ?? <span className="c-muted">No intake event (manual or pre-intake)</span>}</dd>
              <dt>Page path</dt>
              <dd>
                <Value v={(rfq.attribution as Doc | undefined)?.page_path} />
              </dd>
              <dt>CTA placement</dt>
              <dd>
                <Value v={(rfq.attribution as Doc | undefined)?.cta_placement} />
              </dd>
              {(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'ga_client_id', 'landing_page', 'referrer'] as const).map((k) => (
                <div key={k} className="c-contents">
                  <dt>{k}</dt>
                  <dd>
                    <Value v={(rfq.attribution as Doc | undefined)?.[k]} />
                  </dd>
                </div>
              ))}
              {s.isAdmin ? (
                <>
                  <dt>
                    Submission key <span className="c-tag">Admin only</span>
                  </dt>
                  <dd className="c-mono">{String(rfq.submission_key ?? '—')}</dd>
                  <dt>
                    Content fingerprint <span className="c-tag">Admin only</span>
                  </dt>
                  <dd className="c-mono">{String(rfq.content_fingerprint ?? '—')}</dd>
                </>
              ) : null}
            </dl>
          </details>
        </section>
      ) : null}
    </article>
  )
}

/**
 * Patch C: start a reply from an approved template. A plain GET form (works without scripts): choose the template,
 * pick its options (e.g. "call" or "site visit"), and the message box below is filled in — still editable, and sent
 * only when the person presses Send. A template that can't be completed says what is missing.
 */
function TemplatePicker({ rfqId, t }: { rfqId: string; t: ComposerTemplates }) {
  const current = t.picked ? t.options.find((o) => o.code === t.picked!.code) : undefined
  return (
    <form method="get" action={`/crm/rfqs/${rfqId}/`} className="c-template-pick" aria-label="Start from a template">
      <input type="hidden" name="tab" value="email" />
      <label className="c-field">
        <span>Start from a template</span>
        <select className="c-select" name="tpl" defaultValue={t.picked?.code ?? ''}>
          <option value="">Blank message</option>
          {t.options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.code} · {o.name}
            </option>
          ))}
        </select>
      </label>
      {current?.choices.map((opts, i) => (
        <label className="c-field" key={opts.join('|')}>
          <span>Option {i + 1}</span>
          <select className="c-select" name={`c${i}`} defaultValue={t.picked?.choices[i] || opts[0]}>
            {opts.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button className="c-btn" type="submit">
        Use template
      </button>
      {t.picked && !t.picked.result.ok ? (
        <p className="c-result is-error" role="alert">
          {t.picked.result.message}
        </p>
      ) : null}
    </form>
  )
}
