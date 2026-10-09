import type { Metadata } from 'next'
import { stepUpLeft } from '../../../../../email/settings-page'
import { activationGates } from '../../../../../crm/seq/gates'
import { listTriggers } from '../../../../../crm/seq/triggers'
import { t } from '../../../../../crm/library/ui-strings'
import { requireCrmSession } from '../../session'
import { EmailRevenueFrame } from '../_components/EmailRevenueFrame'
import { StepUpPanel } from '../_components/LibraryForms'
import { TriggerConfig, TriggerSwitch } from '../_components/SeqForms'

export const metadata: Metadata = { title: 'Rules' }

/** SEQ-BUILD-1: four trigger rules, admin only. A rule cannot be turned on while any gate is unmet, so with the engine off none is on. */
export default async function TriggersPage() {
  const s = await requireCrmSession('/crm/email-revenue/triggers/')
  const rows = await listTriggers(s)
  const seqs = (await s.payload.find({ collection: 'crm-sequences', where: { or: [{ readiness: { equals: 'READY' } }, { run_state: { equals: 'ACTIVE' } }] } as never, limit: 50, depth: 0, overrideAccess: true })).docs.map((d) => ({ id: String((d as { id: unknown }).id), name: String((d as { name: unknown }).name) }))
  const gates = await activationGates(s, { trigger: true })
  const left = s.isAdmin ? await stepUpLeft(s) : 0
  return (
    <EmailRevenueFrame
      s={s}
      tab="advanced"
      title="Rules"
      crumb={
        <p className="c-crumbs">
          <a href="/crm/email-revenue/advanced/">Advanced</a> / Rules
        </p>
      }
    >
      <section className="c-panel" aria-labelledby="er-tr-h">
        <div className="c-panel-head">
          <h2 id="er-tr-h">Trigger rules</h2>
        </div>
        <div className="c-panel-body is-padded">
          <p>Each rule starts a sequence automatically. Nothing starts while the engine is off. {s.isAdmin ? 'Changes need a verification code.' : 'Only an admin changes rules.'}</p>
          {gates.allMet ? null : <p className="c-hint">Can’t turn a rule on yet: {gates.blocker?.reason}</p>}
          {s.isAdmin ? <StepUpPanel secondsLeft={left} /> : null}
          <ul className="er-rules">
            {rows.map((r) => (
              <li key={r.key} className="er-rule">
                <h3>
                  {r.label} → {r.sequenceName ?? 'No sequence chosen'}
                </h3>
                <p className="c-hint">Applies to: {r.applies}</p>
                <p>
                  {r.enabled ? (gates.blocks.find((b) => b.key === 'engine')?.gates[0]?.status === 'MET' ? 'On' : 'On · inert, the engine is off') : 'Off'}
                  {r.key === 'NO_ACTIVITY' ? ` · after ${r.idleDays ?? 30} days` : ''}
                </p>
                <p className="c-hint">
                  Last matched: {r.lastMatchedAt ? new Date(r.lastMatchedAt).toUTCString() : 'never'} · Would match today (read-only count):{' '}
                  {r.wouldMatch === null ? 'Not available yet' : r.wouldMatch}
                </p>
                <p className="c-hint">Always skipped: do-not-contact, complaints, bounces, opt-outs.</p>
                {s.isAdmin ? (
                  <>
                    <TriggerSwitch keyName={r.key} enabled={r.enabled} disabledReason={gates.allMet ? undefined : gates.blocker?.reason} />
                    <details className="er-reveal">
                      <summary className="c-btn">Edit</summary>
                      <TriggerConfig keyName={r.key} sequences={seqs} sequenceId={r.sequenceId} idleDays={r.idleDays} />
                    </details>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
          {rows.length === 0 ? <p className="c-hint">{t('ers.empty.triggers')}</p> : null}
        </div>
      </section>
    </EmailRevenueFrame>
  )
}
