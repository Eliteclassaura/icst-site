import type { ReactNode } from 'react'
import { RFQ_STATUS_LABEL, STAGE_LABEL, type Tone } from '../labels'
import { IconCheckCircle, IconCircleDot, IconDoNotContact, IconFlag, IconMinusCircle, IconProgress, IconReview, IconUrgent } from './Icons'
import type { Flags } from '../queries'

/** Polish R1: one glyph per tone, so a status chip never depends on colour alone (the label carries the meaning). */
const TONE_ICON: Record<Tone, () => ReactNode> = {
  accent: () => <IconCircleDot />,
  warning: () => <IconFlag />,
  neutral: () => <IconProgress />,
  success: () => <IconCheckCircle />,
  terminal: () => <IconMinusCircle />,
}

/** A tinted status chip: tone glyph plus text label. Used for RFQ status, stage, import runs and sequence states. */
export function ToneChip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`c-status t-${tone}`}>
      {TONE_ICON[tone]()}
      <span>{children}</span>
    </span>
  )
}

export function RfqStatus({ value }: { value: string }) {
  const s = RFQ_STATUS_LABEL[value] ?? { label: 'Unknown', tone: 'neutral' as const }
  return <ToneChip tone={s.tone}>{s.label}</ToneChip>
}

export function StageStatus({ value }: { value: string }) {
  const s = STAGE_LABEL[value] ?? { label: 'Unknown', tone: 'neutral' as const }
  return <ToneChip tone={s.tone}>{s.label}</ToneChip>
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
