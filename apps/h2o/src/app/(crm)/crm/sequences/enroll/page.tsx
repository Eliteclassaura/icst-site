import type { Metadata } from 'next'
import { previewEnrollment, type Source } from '../../../../../crm/ers/enroll'
import { MISSING_INFORMATION_ITEMS } from '../../../../../crm/vocabulary'
import { asUser } from '../../../../../crm/workspace/session'
import { Shell } from '../../../../../crm/workspace/ui/Shell'
import { EnrollConfirm, EnrollmentControls } from '../../_components/SequenceForms'
import { requireCrmSession } from '../../session'

export const metadata: Metadata = { title: 'Enroll in a sequence' }
type Doc = Record<string, unknown>
type SP = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 64)

const REASON: Record<string, string> = {
  ALREADY_ENROLLED: 'Already enrolled in this sequence (once only)',
  NO_OPEN_RFQ: 'No open inquiry from this contact',
  NO_CONTACT: 'No contact on the inquiry',
  NO_VALID_ADDRESS: 'No valid email address',
  REPLIED: 'Has replied since',
  RFQ_SUBMITTED: 'Sent a newer inquiry',
  RFQ_CLOSED: 'Inquiry closed',
  RFQ_QUALIFIED: 'Inquiry already qualified',
  OWNER_RESPONDED: 'Already answered by a person',
  UNSUBSCRIBED: 'Unsubscribed',
  BOUNCED: 'Address bounced',
  COMPLAINT: 'Complained',
  SUPPRESSED: 'On the do-not-email list',
}

/**
 * Revenue Engine slice 1: enroll one inquiry / contact, or a saved view (admins). Step 1 previews — who would be
 * enrolled, who is skipped and why, and the first email as it would be sent; step 2 enrolls exactly that cohort.
 */
export default async function EnrollPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const s = await requireCrmSession('/crm/sequences/enroll/')
  const source: Source = { rfqId: one(sp.rfq), contactId: one(sp.contact), savedViewId: one(sp.view) }
  const seqId = one(sp.seq)
  const items = (Array.isArray(sp.items) ? sp.items : sp.items ? [sp.items] : []).filter((i) => i in MISSING_INFORMATION_ITEMS)
  const running = (await s.payload.find({ collection: 'crm-sequences', where: { run_state: { equals: 'ACTIVE' } }, sort: 'name', limit: 50, depth: 0, overrideAccess: true })).docs as unknown as Doc[]
  const chosen = running.find((r) => String(r.id) === seqId) ?? null
  const preview = chosen && sp.preview === '1' ? await previewEnrollment(s, { sequenceId: seqId, source, missingItems: items }) : null
  // Live enrollments for this inquiry or contact (to see and stop them).
  const anchor = source.rfqId ? { rfq: { equals: source.rfqId } } : source.contactId ? { contact: { equals: source.contactId } } : null
  const existing = anchor ? ((await s.payload.find({ collection: 'crm-enrollments', where: anchor as never, sort: '-enrolled_at', limit: 20, depth: 1, ...asUser(s) })).docs as unknown as Doc[]) : []
  const hiddenSource = Object.fromEntries(Object.entries({ rfq: source.rfqId, contact: source.contactId, view: source.savedViewId }).filter(([, v]) => v)) as Record<string, string>
  return (
    <Shell active="inbox" title="Enroll in a sequence" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
      {source.rfqId ? (
        <p className="c-crumbs">
          <a href={`/crm/rfqs/${encodeURIComponent(source.rfqId)}/`}>Back to the inquiry</a>
        </p>
      ) : null}
      <section className="c-panel is-settings" aria-labelledby="ch-h">
        <div className="c-panel-head">
          <h2 id="ch-h">Choose the sequence</h2>
        </div>
        <div className="c-panel-body is-padded">
          {running.length === 0 ? (
            <p className="c-hint">No sequence is running. An admin starts sequences in Settings → Sequences.</p>
          ) : (
            <form method="get" action="/crm/sequences/enroll/">
              {Object.entries(hiddenSource).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <input type="hidden" name="preview" value="1" />
              <label className="c-field">
                <span>Sequence</span>
                <select className="c-select" name="seq" defaultValue={seqId ?? ''}>
                  {running.map((r) => (
                    <option key={String(r.id)} value={String(r.id)}>
                      {String(r.name)}
                    </option>
                  ))}
                </select>
              </label>
              {source.rfqId ? (
                <fieldset className="c-fieldset c-check-group">
                  <legend>Missing items (only for the missing-information sequence; pick what is genuinely missing)</legend>
                  {Object.entries(MISSING_INFORMATION_ITEMS).map(([k, label]) => (
                    <label key={k} className="c-actions">
                      <input type="checkbox" name="items" value={k} defaultChecked={items.includes(k)} />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
              <button className="c-btn" type="submit">
                Preview
              </button>
            </form>
          )}
        </div>
      </section>
      {preview && !('rows' in preview) ? (
        <p className="c-alert" role="alert">
          {preview.message}
        </p>
      ) : null}
      {preview && 'rows' in preview ? (
        <section className="c-panel is-settings" aria-labelledby="pv-h">
          <div className="c-panel-head">
            <h2 id="pv-h">Preview: {preview.counts.ENROLL ?? 0} to enroll, {preview.rows.length - (preview.counts.ENROLL ?? 0)} skipped</h2>
          </div>
          <div className="c-panel-body is-padded">
            <div className="c-table-wrap">
              <table className="c-table">
                <thead>
                  <tr>
                    <th scope="col">Inquiry / contact</th>
                    <th scope="col">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 200).map((r, i) => (
                    <tr key={`${r.contactId ?? 'none'}-${i}`}>
                      <td>{r.label}</td>
                      <td>{r.decision === 'ENROLL' ? 'Will be enrolled' : r.reasons.map((x) => REASON[x] ?? x).join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.samples.map((x) =>
              'held' in x ? (
                <p key={x.label} className="c-alert" role="alert">
                  {x.label}: the first email would be held ({x.held}). Fix it before enrolling.
                </p>
              ) : (
                <div key={x.label}>
                  <h3>First email for {x.label}</h3>
                  <p>
                    <strong>{x.subject}</strong>
                  </p>
                  <p className="c-message">{x.text}</p>
                  <p className="c-hint">Copy-risk check: {x.lint}</p>
                </div>
              ),
            )}
            {(preview.counts.ENROLL ?? 0) > 0 ? (
              <EnrollConfirm hidden={{ sequenceId: preview.sequenceId, cohortHash: preview.cohortHash, ...hiddenSource }} items={items} count={preview.counts.ENROLL ?? 0} />
            ) : null}
          </div>
        </section>
      ) : null}
      {existing.length ? (
        <section className="c-panel is-settings" aria-labelledby="ex-h">
          <div className="c-panel-head">
            <h2 id="ex-h">Enrollments here</h2>
          </div>
          <div className="c-panel-body is-padded">
            <ul>
              {existing.map((e) => (
                <li key={String(e.id)}>
                  {String((e.sequence as Doc | null)?.name ?? 'Sequence')} — {String(e.status).toLowerCase().replace(/_/g, ' ')}
                  {e.exit_reason ? ` (${String(e.exit_reason).toLowerCase().replace(/_/g, ' ')})` : ''}
                  {e.hold_code ? ` (held: ${String(e.hold_code)})` : ''}
                  <EnrollmentControls enrollmentId={String(e.id)} status={String(e.status)} isAdmin={s.isAdmin} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </Shell>
  )
}
