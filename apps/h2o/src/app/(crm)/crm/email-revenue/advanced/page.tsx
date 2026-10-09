import type { Metadata } from 'next'
import { requireCrmSession } from '../../session'
import { EmailRevenueFrame } from '../_components/EmailRevenueFrame'

export const metadata: Metadata = { title: 'Advanced' }

/** Rules and Simulation (SEQ-BUILD-1). Nothing here sends. */
export default async function AdvancedPage() {
  const s = await requireCrmSession('/crm/email-revenue/advanced/')
  return (
    <EmailRevenueFrame s={s} tab="advanced" title="Advanced">
      <section className="c-panel" aria-labelledby="er-adv-h">
        <div className="c-panel-head">
          <h2 id="er-adv-h">Rules and simulation</h2>
        </div>
        <div className="c-panel-body is-padded">
          <ul>
            <li>
              <a href="/crm/email-revenue/triggers/">Rules</a>: four rules that start a sequence on their own. All are off, and none can be turned on while the engine is off.
            </li>
            <li>
              <a href="/crm/email-revenue/simulate/">Simulation</a>: see who would enter a sequence and what would happen, without sending anything.
            </li>
          </ul>
        </div>
      </section>
    </EmailRevenueFrame>
  )
}
