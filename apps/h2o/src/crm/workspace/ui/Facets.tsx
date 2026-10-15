import type { ReactNode } from 'react'
import { countryName } from '../../countries'
import { INQUIRY_TYPE_LABEL, type InquiryType } from '../../inquiry-type'
import { OFFICE_LABEL, type Office } from '../../offices'
import { replyDueLabel, type ReplyDue } from '../replyDue'
import { absoluteTime, BUSINESS_TIME_ZONE } from '../time'
import { IconAlert, IconCheckCircle, IconClock, IconPart, IconProgress, IconTower, IconWrench } from './Icons'

/**
 * Polish R1 list facets (CT brief must-have 1): the inquiry type badge, country (flag + ISO code), office queue and the
 * reply-due countdown. Each carries its meaning in text; icons and colour repeat it.
 */
const TYPE_ICON: Partial<Record<InquiryType, () => ReactNode>> = {
  PARTS: () => <IconPart />,
  NEW_TOWER: () => <IconTower />,
  REPAIR_SERVICE: () => <IconWrench />,
}

export function TypeBadge({ type, title }: { type: string; title?: string }) {
  const label = INQUIRY_TYPE_LABEL[type as InquiryType] ?? 'Not stated'
  const icon = TYPE_ICON[type as InquiryType]
  return (
    <span className={`c-type${icon ? '' : ' is-unknown'}`} title={title}>
      {icon ? icon() : null}
      <span>{label}</span>
    </span>
  )
}

/** Regional-indicator flag for an ISO 3166 alpha-2 code (decorative; the code and name are the text). */
const flagOf = (code: string): string => String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))

export function CountryFlag({ code, source }: { code: string | null; source?: string }) {
  if (!code) return <span className="c-unknown">Unknown</span>
  const name = countryName(code) ?? code
  const how = source === 'PHONE_INFERRED' ? ' (inferred from the phone number)' : source === 'DESTINATION_ANSWER' ? ' (customer’s destination answer)' : ''
  return (
    <span className="c-country" title={`${name}${how}`}>
      <span aria-hidden="true" className="c-flag">
        {flagOf(code)}
      </span>
      <span aria-hidden="true">{code.toUpperCase()}</span>
      <span className="c-visually-hidden">
        {name}
        {how}
      </span>
      {source === 'PHONE_INFERRED' ? (
        <span className="c-muted" aria-hidden="true">
          *
        </span>
      ) : null}
    </span>
  )
}

export function QueueTag({ office }: { office: Office | null }) {
  if (!office) return <span className="c-unknown">None</span>
  return (
    <span className="c-queue" title={`${OFFICE_LABEL[office]} queue`}>
      <span aria-hidden="true">{office}</span>
      <span className="c-visually-hidden">{OFFICE_LABEL[office]} queue</span>
    </span>
  )
}

const REPLY_ICON = { ok: () => <IconClock />, soon: () => <IconProgress />, overdue: () => <IconAlert />, done: () => <IconCheckCircle />, none: () => null }

/**
 * The first-reply countdown chip. Green: more than 8 office hours left; amber: 8 or fewer (the due day); red: overdue. The state is
 * also a word ("On time", "Due soon", "Overdue") for assistive technology, and each state has its own icon, so colour is never the only signal.
 */
const REPLY_STATE_WORD: Record<string, string> = { ok: 'On time', soon: 'Due soon', overdue: 'Overdue', done: 'Replied' }

export function ReplyChip({ reply, now, zone = BUSINESS_TIME_ZONE }: { reply: ReplyDue; now: Date; zone?: string }) {
  const label = replyDueLabel(reply, now)
  if (reply.tone === 'none') return <span className="c-muted">{label}</span>
  const due = reply.dueAt ? absoluteTime(new Date(reply.dueAt), zone) : null
  const title =
    reply.tone === 'done'
      ? 'The first reply was sent'
      : due
        ? `First reply due ${due} (one business day). ${reply.tone === 'overdue' ? 'Overdue.' : 'Counted in office hours, 09:00–17:00 office time.'}`
        : 'First reply due'
  return (
    <span className={`c-due is-${reply.tone}`} title={title}>
      {REPLY_ICON[reply.tone]()}
      {reply.tone === 'ok' || reply.tone === 'soon' ? <span className="c-visually-hidden">{REPLY_STATE_WORD[reply.tone]}: </span> : null}
      <span>{label}</span>
    </span>
  )
}
