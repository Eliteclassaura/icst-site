import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { Step } from '../../../../../../crm/ers/engine'
import { activationGates } from '../../../../../../crm/seq/gates'
import { engineStatus } from '../../../../../../crm/ers/report'
import { enrolled, history } from '../../../../../../crm/ers/hub'
import { t } from '../../../../../../crm/library/ui-strings'
import { requireCrmSession } from '../../../session'
import { EmailRevenueFrame } from '../../_components/EmailRevenueFrame'
import { EnrollmentControls } from '../../_components/EnrollmentControls'
import { GateList } from '../../_components/GateList'
import { stepUpLeft } from '../../../../../../email/settings-page'
import { replyHandling } from '../../../../../../crm/seq/reply'
import { displayNameOf } from '../../../../../../crm/workspace/session'
import { StepUpPanel } from '../../_components/LibraryForms'
import { ActivateDialog, MarkReady, PauseSequence, RecordReplyCheck, ReplyModeForm, SequenceModeForm } from '../../_components/SeqForms'

export const metadata: Metadata = { title: 'Sequence' }
type Doc = Record<string, unknown>
const TABS = ['steps', 'enrolled', 'rules', 'history'] as const
type Tab = (typeof TABS)[number]
const LABEL: Record<Tab, string> = {
  steps: 'Steps',
  enrolled: 'Enrolled',
  rules: 'Rules',
  history: 'History',
}
const STATUS: Record<string, string> = {
  ACTIVE: 'Running',
  AWAITING_SEND: 'Running',
  PAUSED: 'Paused',
  COMPLETED: 'Finished',
  EXITED: 'Stopped',
  DEAD_LETTER: 'Failed',
}
const word = (v: string) => v.toLowerCase().replace(/_/g, ' ')
/** Why an enrollment is not simply running; empty when there is nothing to say (then the column is hidden). */
function why(r: { status: string; pauseReason: string | null; exitReason: string | null; holdCode?: string | null }): string {
  if (r.status === 'ACTIVE' && r.holdCode === 'REPLY_REVIEW') return t('ers.hold.REPLY_REVIEW')
  if (r.status === 'ACTIVE' && r.holdCode === 'BATCH_FULL') return 'Waiting for a place in the first batch.'
  if (r.status === 'PAUSED')
    return r.pauseReason === 'MANUAL'
      ? 'Paused by a person.'
      : r.pauseReason === 'LINT_HOLD'
        ? t('ers.hold.LINT_BLOCK')
        : r.pauseReason === 'RENDER_HOLD'
          ? 'A value the email needs is missing.'
          : 'Paused.'
  if (r.status === 'EXITED') return `Stopped: ${word(r.exitReason ?? 'unknown')}.`
  if (r.status === 'DEAD_LETTER') return 'Failed. Needs a decision.'
  return ''
}

/** One sequence: Steps, Enrolled (with per-enrollment Pause / Resume / Stop), Rules and History. */
export default async function SequenceDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; created?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as Tab) : 'steps'
  const s = await requireCrmSession(`/crm/email-revenue/sequences/${encodeURIComponent(id)}/`)
  const seq = (await s.payload
    .findByID({ collection: 'crm-sequences', id, depth: 1, overrideAccess: true })
    .catch(() => null)) as Doc | null
  if (!seq) notFound()
  const pv = seq.published_version as Doc | null
  const version = pv && typeof pv === 'object' ? pv : null
  const steps = ((version?.steps ?? []) as Step[]) ?? []
  const tpl = (
    await s.payload.find({ collection: 'crm-email-templates', limit: 200, depth: 0, overrideAccess: true })
  ).docs as unknown as Doc[]
  const libOf = new Map<string, string>(
    (
      (seq.library_source as { steps?: Array<{ template: string; library_id: string }> } | null)?.steps ?? []
    ).map((x) => [x.template, x.library_id]),
  )
  const rows = tab === 'enrolled' ? await enrolled(s, id) : []
  const hist = tab === 'history' ? await history(s, id) : []
  const base = `/crm/email-revenue/sequences/${encodeURIComponent(id)}/`
  const gates = s.isAdmin ? await activationGates(s, { sequenceId: id }) : null
  const inboundLive = (await engineStatus(s.payload)).inboundLive
  const reply = await replyHandling(s, seq, inboundLive)
  const left = s.isAdmin ? await stepUpLeft(s) : 0
  const owners = s.isAdmin
    ? ((await s.payload.find({ collection: 'users', where: { roles: { in: ['platform-admin', 'sales'] } } as never, limit: 100, depth: 0, overrideAccess: true })).docs as unknown as Doc[]).map((u) => ({ id: String(u.id), name: displayNameOf(u) }))
    : []
  const cov = (seq.reply_coverage ?? {}) as Doc
  const isReplyOwner = String(typeof seq.reply_owner === 'object' && seq.reply_owner ? (seq.reply_owner as Doc).id : (seq.reply_owner ?? '')) === s.userId
  const state =
    seq.run_state === 'ACTIVE'
      ? 'Running'
      : seq.run_state === 'PAUSED'
        ? 'Paused'
        : seq.run_state === 'RETIRED'
          ? 'Retired'
          : seq.readiness === 'READY'
            ? 'Ready'
            : 'Draft'
  return (
    <EmailRevenueFrame
      s={s}
      tab="sequences"
      title={String(seq.name)}
      crumb={
        <p className="c-crumbs">
          <a href="/crm/email-revenue/sequences/">Sequences</a> / {String(seq.name)}
        </p>
      }
    >
      {sp.created === '1' ? (
        <p className="c-banner" role="status">
          Draft created from the Library. Copy is imported exactly; edit the template in the Library, not
          here.
        </p>
      ) : null}
      <p className="er-meta">
        <strong>{state}</strong>
        {seq.approval_mode === 'AUTO' ? (
          <span className="c-chip">Automatic sending · no per-email approval</span>
        ) : (
          <span className="c-chip">Approval required · each email waits for review</span>
        )}
        {seq.readiness === 'READY' && seq.run_state !== 'ACTIVE' ? (
          <span className="c-hint">
            Ready. It starts only after every safety check is met and an admin activates it.
          </span>
        ) : null}
      </p>
      <section className="er-reply" aria-label="Reply handling">
        <p>
          <strong>Reply handling</strong> · {reply.kind === 'MONITORED' ? 'Monitored' : reply.kind === 'MANUAL' ? 'Manual reply handling' : 'Not set'}
        </p>
        <p className="c-hint">{reply.text}</p>
        {reply.kind === 'MANUAL' ? (
          <>
            <p className="c-hint">Stop requests are handled by the campaign owner. Follow-ups are held until the owner checks replies and records it.</p>
            {s.isAdmin || isReplyOwner ? <RecordReplyCheck sequenceId={id} /> : null}
          </>
        ) : (
          <p className="c-hint">Replies are not monitored in the CRM yet. Nothing runs until they are, or an admin sets manual reply handling.</p>
        )}
        {s.isAdmin ? (
          <details className="er-reveal">
            <summary className="c-btn">Set manual reply handling</summary>
            <StepUpPanel secondsLeft={left} />
            <ReplyModeForm
              sequenceId={id}
              owners={owners}
              current={{
                ownerId: seq.reply_owner ? String(typeof seq.reply_owner === 'object' ? (seq.reply_owner as Doc).id : seq.reply_owner) : null,
                days: String(cov.days ?? 'MON_FRI'),
                startHour: cov.start_hour == null ? null : Number(cov.start_hour),
                endHour: cov.end_hour == null ? null : Number(cov.end_hour),
                zone: String(cov.zone ?? ''),
                batch: seq.initial_batch == null ? null : Number(seq.initial_batch),
              }}
            />
          </details>
        ) : null}
      </section>
      {s.isAdmin ? (
        <details className="er-reveal">
          <summary className="c-btn">Change approval mode</summary>
          <StepUpPanel secondsLeft={left} />
          <SequenceModeForm sequenceId={id} current={String(seq.approval_mode)} />
        </details>
      ) : null}
      {s.isAdmin && gates && seq.run_state !== 'ACTIVE' ? (
        <div className="c-actions">
          {seq.readiness !== 'READY' ? <MarkReady sequenceId={id} /> : null}
          <ActivateDialog sequenceId={id} allMet={gates.allMet} fingerprint={gates.fingerprint}>
            <GateList report={gates} />
          </ActivateDialog>
        </div>
      ) : null}
      {s.isAdmin && seq.run_state === 'ACTIVE' ? (
        <div className="c-actions">
          <PauseSequence sequenceId={id} />
        </div>
      ) : null}
      <nav className="c-tabs er-tabs" aria-label="Sequence sections">
        {TABS.map((k) => (
          <a
            key={k}
            href={k === 'steps' ? base : `${base}?tab=${k}`}
            aria-current={tab === k ? 'page' : undefined}
          >
            {LABEL[k]}
          </a>
        ))}
      </nav>

      {tab === 'steps' ? (
        <section className="c-panel" aria-labelledby="er-st-h">
          <div className="c-panel-head">
            <h2 id="er-st-h">Steps</h2>
          </div>
          <div className="c-panel-body is-padded">
            {steps.length === 0 ? (
              <p className="c-hint">This sequence has no published steps yet.</p>
            ) : (
              <ol className="er-steps">
                {steps.map((x, i) => {
                  const t =
                    x.type === 'EMAIL'
                      ? tpl.find(
                          (r) =>
                            String(r.id) ===
                            String(
                              x.template && typeof x.template === 'object'
                                ? (x.template as Doc).id
                                : x.template,
                            ),
                        )
                      : undefined
                  const code = t ? String(t.code) : null
                  const libId = code ? libOf.get(code) : undefined
                  return (
                    <li key={`${x.step_key}-${i}`}>
                      <strong>{x.type === 'WAIT' ? 'Wait' : x.type === 'EMAIL' ? 'Email' : 'Task'}</strong>{' '}
                      {x.type === 'WAIT' ? (
                        `${x.business_days} business day${Number(x.business_days) === 1 ? '' : 's'}`
                      ) : x.type === 'EMAIL' ? (
                        <>
                          {libId ? (
                            <a href={`/crm/email-revenue/library/${encodeURIComponent(libId)}/`}>
                              {String(t?.subject ?? 'Email')}
                            </a>
                          ) : (
                            String(t?.subject ?? 'Email')
                          )}
                          {s.isAdmin && code ? (
                            <details className="er-more">
                              <summary>Details</summary>
                              Template {code}
                            </details>
                          ) : null}
                        </>
                      ) : (
                        `For the owner: ${x.task_title ?? ''}`
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
            <p className="c-hint">An admin changes steps in Settings → Sequences.</p>
          </div>
        </section>
      ) : null}

      {tab === 'enrolled' ? (
        <section className="c-panel" aria-labelledby="er-en-h">
          <div className="c-panel-head">
            <h2 id="er-en-h">Enrolled</h2>
          </div>
          <div className="c-panel-body is-padded">
            {rows.length === 0 ? (
              <p className="c-hint">{t('ers.empty.enrolled')}</p>
            ) : (
              <div className="c-table-wrap" role="region" aria-label="Enrolled contacts" tabIndex={0}>
                <table className="c-table er-table">
                  <thead>
                    <tr>
                      <th scope="col">Contact</th>
                      <th scope="col">State</th>
                      <th scope="col">Next action</th>
                      <th scope="col">Next send</th>
                      {rows.some((r) => why(r)) ? <th scope="col">Why</th> : null}
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td data-label="Contact">
                          <a href={`/crm/contacts/${encodeURIComponent(r.contactId)}/`}>{r.contactName}</a>
                          {r.company ? <span className="c-hint"> · {r.company}</span> : null}
                        </td>
                        <td data-label="State">{STATUS[r.status] ?? r.status}</td>
                        <td data-label="Next action">{r.nextAction ?? '—'}</td>
                        <td data-label="Next send">
                          {r.status === 'PAUSED'
                            ? 'Held'
                            : r.nextActionAt
                              ? new Date(r.nextActionAt).toUTCString().slice(0, 16)
                              : '—'}
                        </td>
                        {rows.some((x) => why(x)) ? <td data-label="Why">{why(r)}</td> : null}
                        <td data-label="Actions">
                          <EnrollmentControls
                            enrollmentId={r.id}
                            canPause={r.canPause}
                            canResume={r.canResume}
                            canStop={r.canStop}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="c-hint">{t('ers.hold.scope_note')}</p>
          </div>
        </section>
      ) : null}

      {tab === 'rules' ? (
        <section className="c-panel" aria-labelledby="er-ru-h">
          <div className="c-panel-head">
            <h2 id="er-ru-h">Rules</h2>
          </div>
          <div className="c-panel-body is-padded">
            <p className="c-hint">{t('ers.empty.triggers')}</p>
          </div>
        </section>
      ) : null}

      {tab === 'history' ? (
        <section className="c-panel" aria-labelledby="er-hi-h">
          <div className="c-panel-head">
            <h2 id="er-hi-h">History</h2>
          </div>
          <div className="c-panel-body is-padded">
            {hist.length === 0 ? (
              <p className="c-hint">{t('ers.empty.history')}</p>
            ) : (
              <ul>
                {hist.map((a) => (
                  <li key={a.id}>
                    {a.summary} <span className="c-hint">· {new Date(a.at).toUTCString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}
    </EmailRevenueFrame>
  )
}
