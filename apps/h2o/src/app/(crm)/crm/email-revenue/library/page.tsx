import type { Metadata } from 'next'
import {
  LIBRARY_APPROVAL,
  LIBRARY_LINT_BADGE,
  LIBRARY_PROGRAMS,
  LIBRARY_STATUS,
} from '../../../../../crm/collections/email-library'
import { listLibrary, parseFilter, programCounts } from '../../../../../crm/library/service'
import { t } from '../../../../../crm/library/ui-strings'
import { requireCrmSession } from '../../session'
import { ApprovalChip, LintBadge, StatusLabel } from '../_components/Chips'
import { EmailRevenueFrame } from '../_components/EmailRevenueFrame'
import { LibrarySearch } from '../_components/LibrarySearch'

export const metadata: Metadata = { title: 'Email Library' }

const PROGRAM_NAME: Record<string, string> = {
  'E1.1': 'E1.1 RFQ and quote',
  'E1.2': 'E1.2 Installed base',
  'E1.3': 'E1.3 Legacy reintroduction',
  'E1.4': 'E1.4 Mega-project nurture',
  E2: 'E2 Monthly technical',
  'T-series': 'T-series (existing templates)',
  CUSTOM: 'Custom',
}
const LABEL: Record<string, string> = {
  IMPORTED_EXACT: 'Imported · exact',
  SKELETON: 'Skeleton',
  LINKED: 'Linked template',
  EDITED: 'Edited copy',
  NOT_RUN: 'Not checked',
  PASS: 'Pass',
  NOTES: 'Notes',
  REVIEW: 'Review',
  BLOCKED: 'Blocked',
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const s = await requireCrmSession('/crm/email-revenue/library/')
  const sp = await searchParams
  const f = parseFilter(sp)
  const counts = await programCounts(s)
  // One program by default (S2); "All" is an explicit choice (?program=all).
  const wantAll = sp.program === 'all'
  if (!f.program && !wantAll) f.program = LIBRARY_PROGRAMS.find((p) => counts[p])
  const rows = await listLibrary(s, f)
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...f, ...patch })) if (v) p.set(k, v)
    if (!p.get('program') && wantAll) p.set('program', 'all')
    const qs = p.toString()
    return `/crm/email-revenue/library/${qs ? `?${qs}` : ''}`
  }
  const chips = (Object.entries(f) as Array<[string, string | undefined]>).filter(([k, v]) => v && (k !== 'program' || sp.program))
  const select = (name: string, label: string, values: readonly string[], names?: Record<string, string>) => (
    <label className="er-filter">
      <span>{label}</span>
      <select
        className="c-input"
        name={name}
        defaultValue={name === 'program' && wantAll ? 'all' : ((f as Record<string, string | undefined>)[name] ?? '')}
      >
        <option value={name === 'program' ? 'all' : ''}>All</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {names?.[v] ?? v}
          </option>
        ))}
      </select>
    </label>
  )
  return (
    <EmailRevenueFrame
      s={s}
      tab="library"
      title="Email Library"
      crumb={<a href="/crm/email-revenue/">Email Revenue</a>}
    >
      <div className="er-head">
        <p className="c-hint">
          Every written Email Revenue email. Imported copy is exact and read-only here. Nothing on this page
          can send.
        </p>
        {s.isAdmin ? (
          <a className="c-btn" href="/crm/email-revenue/library/import/">
            Import…
          </a>
        ) : null}
      </div>
      <div className="er-library">
        <nav className="er-rail" aria-label="Programs">
          <ul role="list">
            <li>
              <a href="/crm/email-revenue/library/?program=all" aria-current={wantAll ? 'page' : undefined}>
                All <span className="c-muted">{total}</span>
              </a>
            </li>
            {LIBRARY_PROGRAMS.filter((p) => counts[p]).map((p) => (
              <li key={p}>
                <a href={href({ program: p })} aria-current={f.program === p ? 'page' : undefined}>
                  {PROGRAM_NAME[p]} <span className="c-muted">{counts[p]}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="er-main">
          <form className="er-filters" method="get" action="/crm/email-revenue/library/">
            <LibrarySearch total={rows.length} />
            {select('program', 'Program', LIBRARY_PROGRAMS, PROGRAM_NAME)}
            {select('status', 'Status', LIBRARY_STATUS, LABEL)}
            {select('approval', 'Approval', LIBRARY_APPROVAL)}
            {select('lint', 'Copy check', LIBRARY_LINT_BADGE, LABEL)}
            <button className="c-btn" type="submit">
              Apply
            </button>
          </form>
          {chips.length ? (
            <p className="er-chips" aria-label="Active filters">
              {chips.map(([k, v]) => (
                <a
                  key={k}
                  className="c-chip"
                  href={href({ [k]: undefined })}
                  aria-label={`Remove filter ${k}: ${v}`}
                >
                  {k}: {LABEL[v!] ?? v} ×
                </a>
              ))}
              <a href="/crm/email-revenue/library/">Clear filters</a>
            </p>
          ) : null}
          {rows.length === 0 ? (
            <p className="c-hint">
              {total === 0 ? t('ers.empty.library') : 'No emails match these filters.'}
            </p>
          ) : (
            <div className="c-table-wrap" role="region" aria-label="Library emails" tabIndex={0}>
              <table className="c-table er-table">
                <caption className="c-visually-hidden">{rows.length} emails</caption>
                <thead>
                  <tr>
                    <th scope="col">Subject / name</th>
                    <th scope="col">Sequence</th>
                    <th scope="col">Approval</th>
                    <th scope="col">Copy check</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const subj =
                      ((r.subject_variants as string[] | null) ?? [])[0] ?? String(r.sequence_label)
                    const issues = (
                      r.lint as { variants?: Array<{ counts: Record<string, number> }> } | null
                    )?.variants?.reduce((n, v) => n + (v.counts.REVIEW ?? 0) + (v.counts.BLOCK ?? 0), 0)
                    return (
                      <tr
                        key={String(r.id)}
                        data-lib-row
                        data-text={JSON.stringify([
                          r.key,
                          r.sequence_label,
                          r.step_code,
                          r.subject_variants,
                          r.copy_variants,
                          r.role_variants,
                        ]).toLowerCase()}
                      >
                        <td data-label="Subject / name">
                          <span className="c-muted">
                            {String(r.program)} · step {String(r.step)} ·{' '}
                          </span>
                          <a href={`/crm/email-revenue/library/${encodeURIComponent(String(r.id))}/`}>
                            {r.type === 'TASK'
                              ? `Task: ${String(r.step_code).replace(/_/g, ' ').toLowerCase()}`
                              : subj}
                          </a>
                        </td>
                        <td data-label="Sequence">{String(r.sequence_label)}</td>
                        <td data-label="Approval">
                          {r.type === 'EMAIL' ? (
                            <ApprovalChip mode={String(r.approval_mode)} short />
                          ) : (
                            <span className="c-muted">Task</span>
                          )}
                        </td>
                        <td data-label="Copy check">
                          {r.type === 'EMAIL' ? (
                            <LintBadge badge={String(r.lint_badge) as never} n={issues || undefined} />
                          ) : (
                            <span className="c-muted">—</span>
                          )}
                        </td>
                        <td data-label="Status">
                          <StatusLabel status={String(r.status)} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </EmailRevenueFrame>
  )
}
