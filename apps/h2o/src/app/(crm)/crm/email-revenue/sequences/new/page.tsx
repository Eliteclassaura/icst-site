import type { Metadata } from 'next'
import { catalogue } from '../../../../../../crm/seq/catalogue'
import { requireCrmSession } from '../../../session'
import { EmailRevenueFrame } from '../../_components/EmailRevenueFrame'
import { CreateFromThis } from '../../_components/SeqForms'

export const metadata: Metadata = { title: 'Start from a prebuilt sequence' }

/** SEQ-BUILD-1: the prebuilt catalogue, assembled from the Email Library. Creating a draft is admin-only, needs no step-up, and sends nothing. */
export default async function NewSequencePage() {
  const s = await requireCrmSession('/crm/email-revenue/sequences/new/')
  const rows = await catalogue(s)
  const ready = rows.filter((r) => r.buildable).length
  const row = (r: (typeof rows)[number]) => (
    <li key={r.code} className="er-cat-row">
      <p className="er-row-title">
        {r.name} <span className="c-chip">{r.program}</span>
      </p>
      <p>{r.purpose}</p>
      <p className="c-hint">
        {r.emails} email{r.emails === 1 ? '' : 's'} · {r.waits} wait{r.waits === 1 ? '' : 's'} · {r.tasks} task{r.tasks === 1 ? '' : 's'} · {r.delays} · {r.exitGoals} stop rules · Starts: {r.entry}
      </p>
      {r.flags ? <p className="c-hint">⚠ {r.flags} copy flags (shown, never changed)</p> : null}
      {r.buildable ? null : <p className="c-hint">Can’t be created yet. {r.blockers[0]}</p>}
      <details>
        <summary>Preview steps</summary>
        <ol>
          {r.steps.map((st) => (
            <li key={st.step}>
              {st.type === 'EMAIL' ? 'Email' : 'Task'}: {st.subject ?? st.code.replace(/_/g, ' ').toLowerCase()} <span className="c-hint">· {st.timing.toLowerCase().replace(/_/g, ' ')}</span>
            </li>
          ))}
        </ol>
      </details>
      {s.isAdmin && r.buildable ? (
        <details className="er-reveal">
          <summary className="c-btn is-primary">Create from this…</summary>
          <CreateFromThis code={r.code} />
        </details>
      ) : null}
    </li>
  )
  return (
    <EmailRevenueFrame
      s={s}
      tab="sequences"
      title="Start from a prebuilt sequence"
      crumb={
        <p className="c-crumbs">
          <a href="/crm/email-revenue/sequences/">Sequences</a> / Start from a prebuilt sequence
        </p>
      }
    >
      <section className="c-panel" aria-labelledby="er-cat-h">
        <div className="c-panel-head">
          <h2 id="er-cat-h">Prebuilt sequences</h2>
        </div>
        <div className="c-panel-body is-padded">
          <p>
            Each is assembled from the Email Library exactly as written, with the contract’s delays. {ready} of {rows.length} can be
            created today. The others say what is missing; nothing is invented to make them fit. Creating one makes a draft. It sends
            nothing.
          </p>
          {rows.length === 0 ? (
            <p className="c-hint">The Email Library is empty. An admin can import it first.</p>
          ) : (
            <>
              {rows.some((r) => r.buildable && r.autoSteps) ? <p className="c-hint">Automatic sending · no per-email approval</p> : null}
              <h3>Ready to create ({ready})</h3>
              {ready === 0 ? <p className="c-hint">Nothing can be created yet.</p> : <ul className="er-catalogue">{rows.filter((r) => r.buildable).map((r) => row(r))}</ul>}
              <details className="er-more-list">
                <summary>
                  <h3 className="er-inline-h">Not available yet ({rows.length - ready})</h3>
                </summary>
                <ul className="er-catalogue">{rows.filter((r) => !r.buildable).map((r) => row(r))}</ul>
              </details>
            </>
          )}
        </div>
      </section>
    </EmailRevenueFrame>
  )
}
