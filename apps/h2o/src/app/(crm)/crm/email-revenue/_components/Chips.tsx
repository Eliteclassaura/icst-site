import { ToneChip } from '../../../../../crm/workspace/ui/Status'
import { t } from '../../../../../crm/library/ui-strings'
import type { Badge } from '../../../../../crm/library/lint'

/** Copy-check badge: text plus glyph, never colour alone. A count is shown when there is something to look at. */
export function LintBadge({ badge, n }: { badge: Badge | 'NOT_RUN'; n?: number }) {
  if (badge === 'PASS') return <ToneChip tone="success">Pass</ToneChip>
  if (badge === 'NOTES') return <ToneChip tone="neutral">Notes{n ? ` ${n}` : ''}</ToneChip>
  if (badge === 'REVIEW') return <ToneChip tone="warning">Review{n ? ` ${n}` : ''}</ToneChip>
  if (badge === 'BLOCKED') return <span className="c-badge is-error">Blocked{n ? ` ${n}` : ''}</span>
  return <ToneChip tone="terminal">Not checked</ToneChip>
}

const TIP: Record<string, string> = {
  REQUIRED: 'A person approves each email before it can be sent.',
  RULE_BASED: 'Approved automatically when the rules allow it; otherwise a person approves.',
  AUTO: 'Sent without a person approving each email (the copy check still holds anything it blocks).',
}
/** `short` is the list chip ("Automatic"); the full label stays on the detail view. */
export function ApprovalChip({ mode, short = false }: { mode: string; short?: boolean }) {
  return (
    <span className="c-chip er-approval" title={TIP[mode]}>
      {mode === 'AUTO'
        ? short
          ? 'Automatic'
          : t('ers.catalogue.approval.auto')
        : mode === 'REQUIRED'
          ? t('ers.catalogue.approval.required')
          : mode.replace('_', '-')}
    </span>
  )
}

export function StatusLabel({ status }: { status: string }) {
  if (status === 'SKELETON') return <ToneChip tone="terminal">{t('ers.skeleton.chip')}</ToneChip>
  if (status === 'LINKED') return <ToneChip tone="neutral">Linked template</ToneChip>
  if (status === 'EDITED') return <ToneChip tone="accent">Edited copy</ToneChip>
  return <ToneChip tone="success">Imported · exact</ToneChip>
}
