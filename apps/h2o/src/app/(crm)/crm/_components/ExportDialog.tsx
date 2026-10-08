'use client'

import { useRef, useState } from 'react'

/**
 * W1-4 export (admins only — the page renders this only for admins and the endpoint refuses everyone else). Exports
 * exactly the list on screen (its filters, and its search via the cookie) with the chosen columns. The download URL
 * carries filter keys and column names only, never a search term.
 *
 * CSV-FIX-1 (review R2-09): the server counts the matches first and refuses a list over the cap (the message names
 * requested and allowed totals). The file is fetched here so the dialog can say how many rows arrived against how
 * many were requested, and whether the export is complete, partial or failed. It never claims a full export that isn't.
 */

/** Mirrors `MAX_EXPORT_ROWS` in `crm/export/csv-export.ts` (a unit test keeps them equal); the server enforces it. */
export const EXPORT_CAP = 50_000

type Outcome = { kind: 'complete' | 'partial'; exported: number; requested: number } | { kind: 'failed'; message: string }

/** Data rows in CSV text: line ends outside quotes, minus the header line. `inQuotes` carries across chunks. */
export function countCsvRecords(text: string, state: { inQuotes: boolean; lines: number }) {
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    if (ch === 34) state.inQuotes = !state.inQuotes
    else if (ch === 10 && !state.inQuotes) state.lines++
  }
  return state
}

export function ExportDialog({
  list,
  query,
  columns,
  alwaysDnc,
  total,
}: {
  list: 'contacts' | 'accounts' | 'inbox'
  query: string
  columns: Array<{ key: string; label: string }>
  alwaysDnc: boolean
  total: number
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const [picked, setPicked] = useState<Set<string>>(() => new Set(columns.map((c) => c.key)))
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const href = `/crm/export/?${new URLSearchParams([['list', list], ['cols', [...picked].join(',')]]).toString()}${query ? `&${query}` : ''}`
  const overCap = total > EXPORT_CAP
  // Accounts carry no "Do not contact" column; contacts and inquiries always do.
  const dnc = alwaysDnc && list !== 'accounts'

  const download = async () => {
    setBusy(true)
    setOutcome(null)
    let requested = total
    const state = { inQuotes: false, lines: 0 }
    try {
      const res = await fetch(href, { credentials: 'same-origin' })
      if (!res.ok || !res.body) {
        const out = (await res.json().catch(() => ({}))) as { message?: string }
        setOutcome({ kind: 'failed', message: out.message ?? 'The export was refused.' })
        return
      }
      requested = Number(res.headers.get('x-export-requested') ?? total)
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      const parts: BlobPart[] = []
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        parts.push(value)
        countCsvRecords(dec.decode(value, { stream: true }), state)
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `h2o-${list}.csv`
      const url = URL.createObjectURL(new Blob(parts, { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      const exported = Math.max(0, state.lines - 1)
      setOutcome({ kind: exported >= requested ? 'complete' : 'partial', exported, requested })
    } catch {
      setOutcome({ kind: 'failed', message: `The export stopped after ${Math.max(0, state.lines - 1).toLocaleString()} of ${requested.toLocaleString()} rows. Nothing was saved. Try again.` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button ref={opener} type="button" className="c-btn" onClick={() => (setOutcome(null), dialog.current?.showModal())}>
        Export…
      </button>
      <dialog ref={dialog} className="c-dialog" aria-label="Export to CSV" onClose={() => opener.current?.focus()}>
        <div className="c-dialog-head">
          <h2>Export to CSV</h2>
          <button type="button" className="c-btn is-ghost is-small" onClick={() => dialog.current?.close()} aria-label="Close dialog">
            Close
          </button>
        </div>
        <div className="c-dialog-body">
          {overCap ? (
            <p className="c-result is-error" role="alert">
              This list has {total.toLocaleString()} rows. An export can hold at most {EXPORT_CAP.toLocaleString()}. Narrow the filters or search, then export in parts.
            </p>
          ) : (
            <p className="c-hint">
              Exports all {total.toLocaleString()} {total === 1 ? 'row' : 'rows'} in this list with its current filters. The export is recorded in the audit log (who, when, filter,
              columns, rows requested and exported).{dnc ? ' A “Do not contact” column is always included.' : ''} Cells that could run as spreadsheet formulas are neutralised.
            </p>
          )}
          <p className="c-hint">This is a list export, not a backup of the CRM.</p>
          <fieldset className="c-fieldset">
            <legend>Columns</legend>
            {columns.map((c) => (
              <label key={c.key} className="c-actions">
                <input
                  type="checkbox"
                  checked={picked.has(c.key)}
                  onChange={(e) => {
                    const next = new Set(picked)
                    if (e.target.checked) next.add(c.key)
                    else next.delete(c.key)
                    setPicked(next)
                  }}
                />
                <span>{c.label}</span>
              </label>
            ))}
          </fieldset>
          <div className="c-actions">
            <button type="button" className="c-btn is-primary" disabled={picked.size === 0 || overCap || busy} aria-disabled={picked.size === 0 || overCap || busy || undefined} onClick={download}>
              {busy ? 'Exporting…' : 'Download CSV'}
            </button>
          </div>
          {outcome ? (
            outcome.kind === 'failed' ? (
              <p className="c-result is-error" role="alert">
                {outcome.message}
              </p>
            ) : outcome.kind === 'partial' ? (
              <p className="c-result is-error" role="alert">
                Partial export: {outcome.exported.toLocaleString()} of {outcome.requested.toLocaleString()} rows. The list may have changed while exporting. Export again.
              </p>
            ) : (
              <p className="c-result" role="status">
                Complete: {outcome.exported.toLocaleString()} of {outcome.requested.toLocaleString()} rows exported.
              </p>
            )
          ) : null}
        </div>
      </dialog>
    </>
  )
}
