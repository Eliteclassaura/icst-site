'use client'

import { useMemo, useRef, useState } from 'react'
import { guessMapping, IMPORT_FIELD_LABEL, IMPORT_FIELDS, parseCsv, type ImportField, type Mapping } from '../../../../crm/import/csv'

/**
 * Wave 1 W1-3 import wizard (admin). The file is read in this browser; nothing is sent until "Dry run". The dry run
 * writes nothing and returns the plan; "Apply" sends the same file, mapping and options with the approved counts,
 * and the server refuses if anything changed. Apply progress is streamed. Values from the file are shown only to the
 * admin in this page and are never put in a URL or stored in the browser.
 */

type Summary = Record<string, number>
type PlanRow = { row: number; outcome: string; email: string | null; account: string; suppress: string; fill: string[]; reasons: string[] }
type Plan = { sha256: string; summary: Summary; rows: PlanRow[] }

const OUTCOME_LABEL: Record<string, string> = {
  CREATE: 'New contact',
  FILL: 'Fill empty fields',
  UNCHANGED: 'Already up to date',
  REVIEW: 'Identity review',
  SKIP: 'Skipped',
  REJECT: 'Rejected',
}
const ACCOUNT_LABEL: Record<string, string> = {
  LINK_VERIFIED: 'Link (verified domain)',
  CREATE_ACCOUNT: 'New account',
  LINK_NEW_ACCOUNT: 'New account',
  DOMAIN_REVIEW: 'Review (domain)',
  NAME_REVIEW: 'Review (name)',
  NONE: '—',
}
const SUMMARY_ROWS: Array<[string, string]> = [
  ['rows', 'Rows in the file'],
  ['batches', 'Batches (≤ 2,000 rows each)'],
  ['create', 'New contacts'],
  ['fill', 'Existing contacts: empty fields filled'],
  ['unchanged', 'Existing contacts: already up to date'],
  ['review', 'Identity reviews (same email, different name)'],
  ['skip', 'Skipped (archived or merged contacts)'],
  ['reject', 'Rejected rows'],
  ['linkVerified', 'Linked to an account by verified domain'],
  ['accountsCreate', 'New accounts (one per corporate domain)'],
  ['accountsNamedFromDomain', '…named from the domain (flagged for correction)'],
  ['contactsOnNewAccounts', 'Contacts on new accounts'],
  ['accountReviews', 'Domains sent to identity review'],
  ['unlinkedFreeMail', 'Free-mail contacts (no account link)'],
  ['suppressAdd', 'Do-not-contact recorded from the file'],
  ['suppressAlready', 'Already do-not-contact'],
  ['phonesNormalised', 'Phones stored as E.164'],
  ['phonesDropped', 'Phones dropped'],
  ['namesSplit', 'Names split into first/last'],
  ['namesSplitSuffixKept', '…with a suffix kept on the last name'],
  ['namesSingleWord', 'Single-word names (first name only)'],
  ['namesScriptNotSplit', 'Names not split (CJK/Thai script)'],
  ['placeholdersCleared', 'Placeholder values treated as empty'],
  ['notes', 'Notes added'],
]

export function ImportWizard() {
  const [fileName, setFileName] = useState<string | null>(null)
  const text = useRef<string>('')
  const [header, setHeader] = useState<string[] | null>(null)
  const [rowCount, setRowCount] = useState(0)
  const [mapping, setMapping] = useState<Mapping>({})
  const [createAccounts, setCreateAccounts] = useState(false)
  const [attested, setAttested] = useState(false)
  const [source, setSource] = useState('')
  const [basis, setBasis] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'dry' | 'apply' | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [filter, setFilter] = useState('ALL')
  const [page, setPage] = useState(0)
  const [progress, setProgress] = useState<{ done: number; total: number; batch: number; batches: number } | null>(null)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const confirmRef = useRef<HTMLDialogElement>(null)

  const reset = () => {
    setPlan(null)
    setResult(null)
    setProgress(null)
    setError(null)
  }

  const onFile = async (f: File | undefined) => {
    reset()
    setHeader(null)
    if (!f) return
    if (f.size > 5 * 1024 * 1024) return setError('The file is larger than 5 MB. Split it and import it in parts.')
    const t = await f.text()
    const parsed = parseCsv(t)
    if (!parsed.ok) return setError(parsed.message)
    text.current = t
    setFileName(f.name)
    setHeader(parsed.header)
    setRowCount(parsed.rows.length)
    setMapping(guessMapping(parsed.header))
  }

  const options = { createAccounts, attested, source, basis }
  const post = async (body: Record<string, unknown>) =>
    fetch('/crm/import/run/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' })

  const dryRun = async () => {
    reset()
    setBusy('dry')
    try {
      const res = await post({ mode: 'dry', csv: text.current, mapping, options })
      const out = await res.json()
      if (!out.ok) setError(out.message ?? 'The dry run failed.')
      else {
        setPlan(out.plan as Plan)
        setFilter('ALL')
        setPage(0)
      }
    } catch {
      setError('The dry run could not reach the server.')
    } finally {
      setBusy(null)
    }
  }

  const apply = async () => {
    confirmRef.current?.close()
    if (!plan) return
    setBusy('apply')
    setResult(null)
    setProgress({ done: 0, total: plan.summary.rows ?? 0, batch: 1, batches: plan.summary.batches ?? 1 })
    try {
      const res = await post({ mode: 'apply', csv: text.current, mapping, options, expected: plan.summary })
      if (!res.ok || !res.body) {
        const out = await res.json().catch(() => ({}))
        setError((out as { message?: string }).message ?? 'The import was refused.')
        return
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const msg = JSON.parse(buf.slice(0, nl)) as Record<string, unknown>
          buf = buf.slice(nl + 1)
          if (msg.type === 'progress') setProgress(msg as never)
          if (msg.type === 'result') setResult(msg)
        }
      }
    } catch {
      setError('The connection was lost. Check the batch list below: applied batches can be undone.')
    } finally {
      setBusy(null)
    }
  }

  const rows = useMemo(() => (plan ? plan.rows.filter((r) => filter === 'ALL' || r.outcome === filter || (filter === 'WARN' && r.reasons.length > 0)) : []), [plan, filter])
  const shown = rows.slice(page * 100, page * 100 + 100)
  const mapped = Object.keys(mapping).length
  const canDry = Boolean(header && mapping.email !== undefined && (!attested || (source.trim() && basis.trim())) && !busy)

  return (
    <div className="c-stack">
      <section className="c-panel" aria-labelledby="imp-file">
        <div className="c-panel-head">
          <h2 id="imp-file">1. Choose a CSV file</h2>
        </div>
        <div className="c-block">
          <label className="c-field">
            <span>CSV file (UTF-8, up to 5 MB and 20,000 rows; first row = column names)</span>
            <input className="c-input" type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {fileName && header ? (
            <p className="c-hint" role="status">
              {rowCount.toLocaleString()} rows, {header.length} columns. The file stays in this browser until you run the dry run.
            </p>
          ) : null}
          {error ? (
            <p className="c-result is-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </section>

      {header ? (
        <section className="c-panel" aria-labelledby="imp-map">
          <div className="c-panel-head">
            <h2 id="imp-map">2. Map columns</h2>
            <span className="c-count">{mapped} mapped</span>
          </div>
          <div className="c-block">
            <p className="c-hint">Email is required: it is how contacts are matched. Existing values are never overwritten — only empty fields are filled.</p>
            <div className="c-form-grid c-map-grid">
              {IMPORT_FIELDS.map((f: ImportField) => (
                <label key={f} className="c-field">
                  <span>{IMPORT_FIELD_LABEL[f]}</span>
                  <select
                    className="c-select"
                    value={mapping[f] ?? ''}
                    onChange={(e) => {
                      reset()
                      const next = { ...mapping }
                      if (e.target.value === '') delete next[f]
                      else next[f] = Number(e.target.value)
                      setMapping(next)
                    }}
                  >
                    <option value="">Not imported</option>
                    {header.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {header ? (
        <section className="c-panel" aria-labelledby="imp-opt">
          <div className="c-panel-head">
            <h2 id="imp-opt">3. Options</h2>
          </div>
          <div className="c-block c-stack">
            <label className="c-actions">
              <input type="checkbox" checked={createAccounts} onChange={(e) => (reset(), setCreateAccounts(e.target.checked))} />
              <span>
                Create accounts from corporate email domains that match no account. Free-mail addresses never create or match an account; a domain whose
                rows name different companies goes to identity review.
              </span>
            </label>
            <label className="c-actions">
              <input type="checkbox" checked={attested} onChange={(e) => (reset(), setAttested(e.target.checked))} />
              <span>The owner attests these are existing customers (new accounts become verified past customers; recorded as evidence).</span>
            </label>
            {attested ? (
              <div className="c-form-grid">
                <label className="c-field">
                  <span>Source (required)</span>
                  <input className="c-input" value={source} onChange={(e) => (reset(), setSource(e.target.value))} maxLength={160} placeholder="e.g. email-IQ export 2026-07-14" />
                </label>
                <label className="c-field">
                  <span>Basis (required)</span>
                  <input className="c-input" value={basis} onChange={(e) => (reset(), setBasis(e.target.value))} maxLength={240} placeholder="e.g. owner-attested existing customers (2026-10-05)" />
                </label>
              </div>
            ) : null}
            <p className="c-hint">Imported contacts are never marked eligible for marketing email, and the import creates no follow-up tasks.</p>
            <div className="c-actions">
              <button type="button" className="c-btn is-primary" disabled={!canDry} aria-disabled={!canDry || undefined} onClick={dryRun}>
                {busy === 'dry' ? 'Checking…' : 'Dry run (writes nothing)'}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {plan ? (
        <section className="c-panel" aria-labelledby="imp-plan">
          <div className="c-panel-head">
            <h2 id="imp-plan">4. Dry run result</h2>
            <span className="c-tag">Nothing written</span>
          </div>
          <div className="c-block">
            <dl className="c-dl c-dl-compact">
              {SUMMARY_ROWS.filter(([k]) => (plan.summary[k] ?? 0) > 0 || ['rows', 'create', 'reject'].includes(k)).map(([k, l]) => (
                <div key={k} className="c-contents">
                  <dt>{l}</dt>
                  <dd className="num">{(plan.summary[k] ?? 0).toLocaleString()}</dd>
                </div>
              ))}
            </dl>
            <div className="c-actions">
              <label className="c-field c-field-inline">
                <span>Show</span>
                <select className="c-select" value={filter} onChange={(e) => (setFilter(e.target.value), setPage(0))}>
                  <option value="ALL">All rows</option>
                  {Object.entries(OUTCOME_LABEL).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                  <option value="WARN">Rows with notes</option>
                </select>
              </label>
              <button type="button" className="c-btn is-primary" disabled={busy !== null} onClick={() => confirmRef.current?.showModal()}>
                Apply import…
              </button>
            </div>
          </div>
          <div className="c-table-wrap">
            <table className="c-table c-import-table">
              <caption className="c-visually-hidden">Planned outcome per row</caption>
              <thead>
                <tr>
                  <th scope="col" className="num">
                    Row
                  </th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Email</th>
                  <th scope="col" className="hide-sm">
                    Account
                  </th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.row}>
                    <td className="num">{r.row}</td>
                    <td>{OUTCOME_LABEL[r.outcome] ?? r.outcome}</td>
                    <td className="c-trunc">{r.email ?? '—'}</td>
                    <td className="hide-sm">{ACCOUNT_LABEL[r.account] ?? r.account}</td>
                    <td>{[...(r.fill.length && r.outcome === 'FILL' ? [`Fills ${r.fill.join(', ').replaceAll('_', ' ')}`] : []), ...r.reasons].join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="c-pager">
            <span>
              {rows.length ? `${page * 100 + 1}–${Math.min(rows.length, page * 100 + 100)} of ${rows.length.toLocaleString()}` : 'No rows'}
            </span>
            {page > 0 ? (
              <button type="button" className="c-btn is-small" onClick={() => setPage(page - 1)}>
                Previous
              </button>
            ) : null}
            {(page + 1) * 100 < rows.length ? (
              <button type="button" className="c-btn is-small" onClick={() => setPage(page + 1)}>
                Next
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {progress || result ? (
        <section className="c-panel" aria-labelledby="imp-run">
          <div className="c-panel-head">
            <h2 id="imp-run">5. Apply</h2>
          </div>
          <div className="c-block">
            {progress ? (
              <>
                <progress className="c-progress" max={progress.total || 1} value={progress.done} aria-label="Import progress" />
                <p className="c-hint" role="status" aria-live="polite">
                  Batch {progress.batch} of {progress.batches} · {progress.done.toLocaleString()} of {progress.total.toLocaleString()} rows
                </p>
              </>
            ) : null}
            {result ? (
              result.ok ? (
                <div className="c-banner" role="status">
                  <span>
                    <strong>Import applied.</strong> {String((result.summary as Summary)?.create ?? 0)} contacts created,{' '}
                    {String((result.summary as Summary)?.fill ?? 0)} filled, {String((result.summary as Summary)?.accountsCreate ?? 0)} accounts created in{' '}
                    {(result.batchIds as string[]).length} batches.
                    {(result.failed as unknown[]).length ? ` ${(result.failed as unknown[]).length} rows failed (see the batch list).` : ''}
                    {result.stopped ? ` Stopped early (low memory) at row ${String((result.stopped as { fromRow: number }).fromRow)}; the remaining rows were not applied.` : ''}
                  </span>
                </div>
              ) : (
                <p className="c-result is-error" role="alert">
                  {String(result.message ?? 'The import failed.')}
                </p>
              )
            ) : null}
          </div>
        </section>
      ) : null}

      <dialog ref={confirmRef} className="c-dialog" aria-label="Apply import">
        <div className="c-dialog-head">
          <h2>Apply import</h2>
          <button type="button" className="c-btn is-ghost is-small" onClick={() => confirmRef.current?.close()} aria-label="Close dialog">
            Close
          </button>
        </div>
        <div className="c-dialog-body">
          <p>
            This will create <strong>{(plan?.summary.create ?? 0).toLocaleString()}</strong> contacts, fill <strong>{(plan?.summary.fill ?? 0).toLocaleString()}</strong>, create{' '}
            <strong>{(plan?.summary.accountsCreate ?? 0).toLocaleString()}</strong> accounts and open <strong>{((plan?.summary.review ?? 0) + (plan?.summary.accountReviews ?? 0)).toLocaleString()}</strong> identity reviews, in{' '}
            {plan?.summary.batches ?? 1} batches. Each batch can be undone (archived, never deleted).
          </p>
          <p className="c-hint">If anything changed since the dry run, the server refuses and asks for a new dry run.</p>
          <div className="c-actions">
            <button type="button" className="c-btn is-primary" onClick={apply}>
              Apply now
            </button>
            <button type="button" className="c-btn" onClick={() => confirmRef.current?.close()}>
              Cancel
            </button>
          </div>
        </div>
      </dialog>
    </div>
  )
}
