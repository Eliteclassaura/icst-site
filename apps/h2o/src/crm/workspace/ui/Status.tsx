import { RFQ_STATUS_LABEL, STAGE_LABEL } from '../labels'
import { IconDoNotContact, IconReview, IconUrgent } from './Icons'
import type { Flags } from '../queries'

/** A 6px dot plus a text label: meaning never depends on colour alone. */
export function RfqStatus({ value }: { value: string }) {
  const s = RFQ_STATUS_LABEL[value] ?? { label: 'Unknown', tone: 'neutral' as const }
  return <span className={`c-status t-${s.tone}`}>{s.label}</span>
}

export function StageStatus({ value }: { value: string }) {
  const s = STAGE_LABEL[value] ?? { label: 'Unknown', tone: 'neutral' as const }
  return <span className={`c-status t-${s.tone}`}>{s.label}</span>
}

export function RowFlags({ flags }: { flags: Flags }) {
  if (!flags.urgent && !flags.review && !flags.doNotContact) return null
  return (
    <span className="c-flags">
      {flags.urgent ? <IconUrgent label="Customer marked urgent" /> : null}
      {flags.review ? <IconReview label="Identity review open" /> : null}
      {flags.doNotContact ? (
        <span className="c-flag-dnc">
          <IconDoNotContact label="Do not contact" />
        </span>
      ) : null}
    </span>
  )
}
