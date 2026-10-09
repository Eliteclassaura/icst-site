import type { Metadata } from 'next'
import { requireCrmSession } from '../../session'
import { EmailRevenueFrame } from '../_components/EmailRevenueFrame'

export const metadata: Metadata = { title: 'Campaigns' }

/** CAMPAIGN-1 builds the blast builder and the results. Until then this says so plainly; nothing here can send. */
export default async function CampaignsPage() {
  const s = await requireCrmSession('/crm/email-revenue/campaigns/')
  return (
    <EmailRevenueFrame s={s} tab="campaigns" title="Campaigns">
      <section className="c-panel" aria-labelledby="er-camp-h">
        <div className="c-panel-head">
          <h2 id="er-camp-h">Campaigns</h2>
        </div>
        <div className="c-panel-body is-padded">
          <p>One-off blasts to a saved audience are not available yet. No campaign exists and nothing is scheduled.</p>
          <p className="c-hint">Sequences already follow up on inquiries. See <a href="/crm/email-revenue/sequences/">Sequences</a>.</p>
        </div>
      </section>
    </EmailRevenueFrame>
  )
}
