import type { Metadata } from 'next'
import { crmUsers } from '../../../../../crm/workspace/queries'
import { asUser } from '../../../../../crm/workspace/session'
import { isUuid } from '../../../../../crm/workspace/validate'
import { Shell } from '../../../../../crm/workspace/ui/Shell'
import { NewContactForm } from '../../_components/RecordDialogs'
import { requireCrmSession } from '../../session'

export const metadata: Metadata = { title: 'New contact' }

/** W1-1 "New contact". `?account=<id>` (from an account profile) pre-selects the account; it is an id, not PII. */
export default async function NewContactPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireCrmSession('/crm/contacts/new/')
  const sp = await searchParams
  const accId = typeof sp.account === 'string' && isUuid(sp.account) ? sp.account : null
  const [people, account] = await Promise.all([
    crmUsers(s),
    accId
      ? s.payload
          .findByID({ collection: 'crm-accounts', id: accId, depth: 0, ...asUser(s) })
          .then((a) => ({ id: accId, name: String((a as unknown as Record<string, unknown>).canonical_name ?? '') }))
          .catch(() => null)
      : Promise.resolve(null),
  ])
  return (
    <Shell active="contacts" title="New contact" crumb={<a href="/crm/contacts/">Contacts</a>} userName={s.displayName} isAdmin={s.isAdmin}>
      <section className="c-panel c-narrow" aria-label="New contact">
        <div className="c-block">
          <NewContactForm people={people} meId={s.userId} isAdmin={s.isAdmin} account={account} />
        </div>
      </section>
    </Shell>
  )
}
