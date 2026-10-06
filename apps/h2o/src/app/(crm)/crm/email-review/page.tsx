import type { Metadata } from 'next'
import { compactTime } from '../../../../crm/workspace/time'
import { asUser } from '../../../../crm/workspace/session'
import { Shell } from '../../../../crm/workspace/ui/Shell'
import { ReviewActions } from '../_components/EmailPanel'
import { requireCrmSession } from '../session'

export const metadata: Metadata = { title: 'Email review' }

const REASON: Record<string, string> = {
  NO_TOKEN: 'Not addressed to an RFQ reply address',
  UNKNOWN_TOKEN: 'Reply address not recognised',
  EXPIRED_TOKEN: 'Reply address expired or revoked',
  MULTIPLE_TOKENS: 'Addressed to more than one RFQ',
  AUTO_SUBMITTED: 'Automatic message (auto-reply, bounce)',
  BULK: 'Bulk or mailing-list message',
  SPAM: 'Flagged as spam',
  OWN_ADDRESS: 'Sent from our own address',
  PROCESSING_FAILED: 'Could not be processed',
}
type Doc = Record<string, unknown>

/**
 * CRM email M3: inbound email that was not linked to an RFQ automatically. Admins only. Content is shown as
 * plain text (it was stored as text); attachments were withheld and are listed by name only.
 */
export default async function EmailReviewPage() {
  const s = await requireCrmSession('/crm/email-review/')
  if (!s.isAdmin)
    return (
      <Shell active="email" title="Email review" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
        <p className="c-alert" role="alert">
          Email review is for admins. <a href="/crm/">Back to My Work</a>
        </p>
      </Shell>
    )
  const now = new Date()
  const res = await s.payload.find({
    collection: 'crm-email-review',
    where: { state: { equals: 'OPEN' } },
    sort: '-received_at',
    depth: 0,
    limit: 100,
    ...asUser(s),
  })
  const items = res.docs as unknown as Doc[]
  return (
    <Shell active="email" title="Email review" userName={s.displayName} session={s} isAdmin={s.isAdmin}>
      <p className="c-hint">
        Inbound email that was not linked to an inquiry automatically. Nothing is linked by name or subject:
        link it to the right RFQ, or discard it.
      </p>
      {items.length === 0 ? (
        <p className="c-hint">Nothing to review.</p>
      ) : (
        <ul className="c-timeline" role="list">
          {items.map((i) => {
            const withheld = Array.isArray(i.attachments_withheld)
              ? (i.attachments_withheld as Array<{ name?: string }>)
              : []
            return (
              <li key={String(i.id)}>
                <time dateTime={String(i.received_at)}>
                  {compactTime(new Date(String(i.received_at)), now, s.timeZone)}
                </time>
                <span>
                  <strong>{REASON[String(i.reason)] ?? String(i.reason)}</strong> ·{' '}
                  {String(i.from_address ?? 'unknown sender')}
                  <br />
                  <span>{String(i.subject ?? '')}</span>
                  <p className="c-message">{String(i.body_text ?? '')}</p>
                  {withheld.length ? (
                    <span className="c-muted">
                      Attachments withheld: {withheld.map((a) => a.name).join(', ')}
                    </span>
                  ) : null}
                  <ReviewActions reviewId={String(i.id)} />
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Shell>
  )
}
