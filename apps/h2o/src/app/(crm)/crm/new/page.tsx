import type { Metadata } from 'next'
import { uuidv7 } from '../../../../crm/ids'
import { crmUsers } from '../../../../crm/workspace/queries'
import { Shell } from '../../../../crm/workspace/ui/Shell'
import { ManualInquiryForm } from '../_components/ManualInquiryForm'
import { requireCrmSession } from '../session'

export const metadata: Metadata = { title: 'New inquiry' }

export default async function NewInquiryPage() {
  const s = await requireCrmSession('/crm/new/')
  const people = await crmUsers(s)
  // One-time token per rendered form: a double submit returns the RFQ the first submit created.
  const token = uuidv7()
  return (
    <Shell active="inbox" title="New inquiry" crumb={<a href="/crm/rfqs/">RFQ Inbox</a>} userName={s.displayName} isAdmin={s.isAdmin}>
      <div className="c-narrow">
        <p className="c-hint">Record an inquiry received by phone, email or in person. It is saved with source “Manual” and your name as the person who entered it.</p>
        <ManualInquiryForm token={token} people={people} meId={s.userId} />
      </div>
    </Shell>
  )
}
