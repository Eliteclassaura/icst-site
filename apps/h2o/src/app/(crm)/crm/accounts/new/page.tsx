import type { Metadata } from 'next'
import { crmUsers } from '../../../../../crm/workspace/queries'
import { Shell } from '../../../../../crm/workspace/ui/Shell'
import { NewAccountForm } from '../../_components/RecordDialogs'
import { requireCrmSession } from '../../session'

export const metadata: Metadata = { title: 'New account' }

/** W1-1 "New account": the minimum record. Provenance is MANUAL_ENTRY; a domain is an unverified candidate. */
export default async function NewAccountPage() {
  const s = await requireCrmSession('/crm/accounts/new/')
  const people = await crmUsers(s)
  return (
    <Shell active="accounts" title="New account" crumb={<a href="/crm/accounts/">Accounts</a>} userName={s.displayName} isAdmin={s.isAdmin}>
      <section className="c-panel c-narrow" aria-label="New account">
        <div className="c-block">
          <NewAccountForm people={people} meId={s.userId} isAdmin={s.isAdmin} />
        </div>
      </section>
    </Shell>
  )
}
