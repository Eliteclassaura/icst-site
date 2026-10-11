import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { stepUpLeft } from '../../../../../../email/settings-page'
import {
  libraryRow,
  renderSample,
  sampleRecipients,
  unknownFields,
  variantsOf,
} from '../../../../../../crm/library/service'
import { t } from '../../../../../../crm/library/ui-strings'
import { signatureMergeValues } from '../../../../../../crm/settings/signatures'
import { requireCrmSession } from '../../../session'
import { ApprovalChip, LintBadge, StatusLabel } from '../../_components/Chips'
import { EmailRevenueFrame } from '../../_components/EmailRevenueFrame'
import { ApprovalModeForm, StepUpPanel } from '../../_components/LibraryForms'

export const metadata: Metadata = { title: 'Library email' }

const list = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : [])

/** One library email: provenance, approval, the preview with sample merge data, and the copy-check findings. */
export default async function LibraryRowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { id } = await params
  const sp = await searchParams
  const s = await requireCrmSession(`/crm/email-revenue/library/${encodeURIComponent(id)}/`)
  const found = await libraryRow(s, id)
  if (!found) notFound()
  const { row, template, original } = found
  const isEmail = row.type === 'EMAIL'
  const skeleton = row.status === 'SKELETON'
  const variants = isEmail ? variantsOf(row, template) : []
  const vi = Math.min(Math.max(Number(sp.v ?? 0) || 0, 0), Math.max(variants.length - 1, 0))
  const samples = await sampleRecipients(s.payload, s.userId)
  const who = samples.find((x) => x.id === sp.as) ?? samples[0]!
  const shown = variants[vi]
  // SIGNATURES-1: the samples carry the real signature resolution; `sig` only names the one used.
  const sig = await signatureMergeValues(s.payload, s.userId)
  const merged = shown ? renderSample(shown.subject, shown.body, who.values) : null
  const left = s.isAdmin ? await stepUpLeft(s) : 0
  const base = `/crm/email-revenue/library/${encodeURIComponent(id)}/`
  const link = (patch: Record<string, string>) =>
    `${base}?${new URLSearchParams({ as: who.id, v: String(vi), ...patch }).toString()}`
  const gaps = unknownFields(list(row.merge_fields))
  const title = isEmail
    ? String(((row.subject_variants as string[] | null) ?? [])[0] ?? row.sequence_label)
    : `Task: ${String(row.step_code).replace(/_/g, ' ').toLowerCase()}`
  return (
    <EmailRevenueFrame
      s={s}
      tab="library"
      title={title}
      crumb={
        <>
          <a href="/crm/email-revenue/">Email Revenue</a> / <a href="/crm/email-revenue/library/">Library</a>
        </>
      }
    >
      <div className="er-detail">
        <p className="er-meta">
          {String(row.program)} · {String(row.sequence_label)} · step {String(row.step)}{' '}
          <StatusLabel status={String(row.status)} />
          {isEmail ? <ApprovalChip mode={String(row.approval_mode)} /> : null}
          {isEmail && row.lint_badge !== 'NOT_RUN' ? (
            <LintBadge badge={String(row.lint_badge) as never} />
          ) : null}
        </p>
        {skeleton ? (
          <p className="c-banner is-warning" role="note">
            {t('ers.skeleton.disabled_reason')}
          </p>
        ) : null}
        {original ? (
          <p className="c-hint">
            An edited copy.{' '}
            <a href={`/crm/email-revenue/library/${encodeURIComponent(String(original.id))}/`}>
              The imported original
            </a>{' '}
            stays unchanged.
          </p>
        ) : null}
        <dl className="c-dl">
          {s.isAdmin ? (
            <>
              <dt>Source</dt>
              <dd>
                {String(row.source_ref ?? '—')}
                {row.source_hash ? (
                  <>
                    {' '}
                    · hash <span className="c-mono">{String(row.source_hash).slice(0, 8)}</span>
                  </>
                ) : null}
              </dd>
            </>
          ) : (
            <>
              <dt>Source</dt>
              <dd>
                <details>
                  <summary>Show source</summary>
                  <span>
                    {String(row.source_ref ?? '—')}
                    {row.source_hash ? (
                      <>
                        {' '}
                        · hash <span className="c-mono">{String(row.source_hash).slice(0, 8)}</span>
                      </>
                    ) : null}
          
                  </span>
                </details>
              </dd>
            </>
          )}
          <dt>Timing (contract text)</dt>
          <dd>{String(row.timing || '—')}</dd>
          {gaps.length ? (
            <>
              <dt>Merge fields not available yet</dt>
              <dd>
                {gaps.map((g) => `{{${g}}}`).join(', ')}. A step that needs one is held for that contact until
                the CRM can fill it; nothing is sent with a blank.
              </dd>
            </>
          ) : null}
        </dl>

        {isEmail && !skeleton ? (
          <section className="c-panel is-settings" aria-labelledby="er-appr-h">
            <div className="c-panel-head">
              <h2 id="er-appr-h">Approval</h2>
            </div>
            <div className="c-panel-body is-padded">
              <p>
                Effective: <ApprovalChip mode={String(row.approval_mode)} />
              </p>
              {row.approval_recommended !== row.approval_mode ? (
                <details className="c-hint">
                  <summary>Details</summary>
                  <p>{t('ers.approval.contract_note.details')}</p>
                </details>
              ) : null}
              {row.approval_reason ? (
                <p className="c-hint">Last change: {String(row.approval_reason)}</p>
              ) : null}
              {s.isAdmin && row.status !== 'LINKED' ? (
                <>
                  <details className="er-reveal">
                    <summary className="c-btn">Change approval mode</summary>
                    <StepUpPanel secondsLeft={left} />
                    <ApprovalModeForm id={String(row.id)} current={String(row.approval_mode)} />
                  </details>
                </>
              ) : (
                <p className="c-hint">
                  {row.status === 'LINKED'
                    ? 'This template’s approval is managed in Settings → Email templates.'
                    : 'Admin only.'}
                </p>
              )}
            </div>
          </section>
        ) : null}

        {merged && shown ? (
          <section className="c-panel" aria-labelledby="er-prev-h">
            <div className="c-panel-head">
              <h2 id="er-prev-h">Preview</h2>
            </div>
            <div className="c-panel-body is-padded">
              <p className="er-pick">
                <span id="er-as">Preview as</span>{' '}
                {samples.map((x) => (
                  <a
                    key={x.id}
                    className="c-chip"
                    href={link({ as: x.id })}
                    aria-current={x.id === who.id ? 'true' : undefined}
                  >
                    {x.label}
                  </a>
                ))}
              </p>
              {variants.length > 1 ? (
                <p className="er-pick">
                  <span>Variant</span>{' '}
                  {variants.map((v, i) => (
                    <a
                      key={i}
                      className="c-chip"
                      href={link({ v: String(i) })}
                      aria-current={i === vi ? 'true' : undefined}
                    >
                      {v.label}
                    </a>
                  ))}
                </p>
              ) : null}
              <p className="c-hint">
                Sample data (not a real contact). Merge fields with no value show as “Missing”.
                Choices show their first option in this preview.
              </p>
              {merged.missing.length ? (
                <p className="c-banner is-warning" role="status">
                  This email would be held: missing {merged.missing.join(', ')}.
                </p>
              ) : !skeleton ? (
                <p className="c-banner" role="status">
                  Pass: no missing sample merge fields.
                </p>
              ) : null}
              <p className="c-hint">
                Signature used: {sig.used.label} for replies; sequences use the standard signature. <a href="/crm/settings/signatures/">Change it</a>.
              </p>
              <div className="er-paper" role="group" aria-label="Email preview">
                <p>
                  <strong>From:</strong> ICS Sales Team
                </p>
                <p>
                  <strong>Subject:</strong> {merged.subject}
                </p>
                <pre className="er-body">{merged.body}</pre>
              </div>
              {shown.lint.findings.some((f) => f.rule_id === 'ICS_OWNER_SIGNOFF_001') ? (
                <p className="c-hint">{t('ers.persona.note')}</p>
              ) : null}
            </div>
          </section>
        ) : null}

        {isEmail && variants.length ? (
          <section className="c-panel" aria-labelledby="er-lint-h">
            <div className="c-panel-head">
              <h2 id="er-lint-h">Copy check</h2>
            </div>
            <div className="c-panel-body is-padded">
              <p className="c-hint">
                The check judges; it never rewrites. A flagged word is not a spam verdict: “quote” is normal
                in this industry. Rule set {variants[0]!.lint.rule_set}.
              </p>
              {variants.map((v, i) => (
                <details
                  key={i}
                  className="er-findings"
                  open={v.lint.findings.some((f) => f.severity === 'REVIEW' || f.severity === 'BLOCK')}
                >
                  <summary>
                    {v.label} <LintBadge badge={v.lint.badge} />
                  </summary>
                  {v.lint.findings.length ? (
                    <ul role="list">
                      {v.lint.findings.map((f, j) => (
                        <li key={j}>
                          <strong>{f.severity}</strong> · {f.category.replace(/_/g, ' ').toLowerCase()} ·{' '}
                          <span className="c-mono">{f.rule_id}</span> · in the {f.where}
                          {f.note ? <> — {f.note}</> : null}
                          {f.matched ? (
                            <>
                              {' '}
                              (“<mark>{f.matched}</mark>”)
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="c-hint">No findings.</p>
                  )}
                  <p className="c-hint">
                    {v.lint.not_evaluated} structural rules were not evaluated. They are not counted as a
                    pass.
                  </p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        {list(row.stop_conditions).length || list(row.pause_conditions).length || row.task_creation ? (
          <section className="c-panel" aria-labelledby="er-cond-h">
            <div className="c-panel-head">
              <h2 id="er-cond-h">When it stops or pauses</h2>
            </div>
            <div className="c-panel-body is-padded">
              {list(row.stop_conditions).length ? (
                <>
                  <h3>Stops when</h3>
                  <ul>
                    {list(row.stop_conditions).map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {list(row.pause_conditions).length ? (
                <>
                  <h3>Pauses when</h3>
                  <ul>
                    {list(row.pause_conditions).map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {row.task_creation ? (
                <>
                  <h3>Task</h3>
                  <p>{String(row.task_creation)}</p>
                </>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </EmailRevenueFrame>
  )
}
