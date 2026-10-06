'use client'

import { useRef, useState } from 'react'

/**
 * W1-4 export (admins only — the page renders this only for admins and the endpoint refuses everyone else). Exports
 * exactly the list on screen (its filters, and its search via the cookie) with the chosen columns. The download URL
 * carries filter keys and column names only, never a search term.
 */
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
  const href = `/crm/export/?${new URLSearchParams([['list', list], ['cols', [...picked].join(',')]]).toString()}${query ? `&${query}` : ''}`
  return (
    <>
      <button ref={opener} type="button" className="c-btn" onClick={() => dialog.current?.showModal()}>
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
          <p className="c-hint">
            Exports the {total.toLocaleString()} {total === 1 ? 'row' : 'rows'} in this list with its current filters. The export is recorded in the audit log (who, when, filter,
            columns, row count).{alwaysDnc ? ' A “Do not contact” column is always included.' : ''} Cells that could run as spreadsheet formulas are neutralised.
          </p>
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
            <a className={`c-btn is-primary${picked.size === 0 ? ' is-disabled' : ''}`} href={picked.size ? href : undefined} aria-disabled={picked.size === 0 || undefined} onClick={() => dialog.current?.close()} download>
              Download CSV
            </a>
          </div>
        </div>
      </dialog>
    </>
  )
}
