import { panel } from '../../../../../crm/ers/hub'
import { t } from '../../../../../crm/library/ui-strings'
import type { CrmSession } from '../../../../../crm/workspace/session'
import { EnrollmentControls } from './EnrollmentControls'

const STATE: Record<string, string> = {
  ACTIVE: 'Running',
  AWAITING_SEND: 'Running',
  PAUSED: 'Paused',
  COMPLETED: 'Finished',
  EXITED: 'Stopped',
  DEAD_LETTER: 'Failed',
}

/** ERS-HUB-1: the sequences this contact or inquiry is in, with Enroll / Pause / Resume / Stop. Server-checked on every action. */
export async function SequencePanel({ s, contactId, rfqId }: { s: CrmSession; contactId?: string; rfqId?: string }) {
  const rows = await panel(s, { contactId, rfqId })
  const enroll = `/crm/sequences/enroll/?${rfqId ? `rfq=${encodeURIComponent(rfqId)}` : `contact=${encodeURIComponent(contactId ?? '')}`}`
  return (
    <section className="c-panel" aria-labelledby="er-pan-h">
      <div className="c-panel-head">
        <h2 id="er-pan-h">Email sequences</h2>
      </div>
      <div className="c-panel-body is-padded">
        {rows.length === 0 ? (
          <p className="c-hint">{t('ers.empty.contact_panel')}</p>
        ) : (
          <ul>
            {rows.map((r) => (
              <li key={r.id}>
                <a href={`/crm/email-revenue/sequences/${encodeURIComponent(r.sequenceId)}/`}>{r.sequenceName}</a>
                {' · '}
                {STATE[r.status] ?? r.status}
                <EnrollmentControls enrollmentId={r.id} canPause={r.canPause} canResume={r.canResume} canStop={r.canStop} />
              </li>
            ))}
          </ul>
        )}
        <p>
          <a href={enroll}>Enroll in a sequence</a>
        </p>
        <p className="c-hint">{t('ers.hold.scope_note')}</p>
      </div>
    </section>
  )
}
