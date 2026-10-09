'use client'

import { useId, useState } from 'react'

/**
 * Library text search. It filters the rows already on the page (each row carries its searchable text), so a search
 * term never enters a URL, a server log or the browser history (W1-2). Nothing is sent anywhere.
 */
export function LibrarySearch({ total }: { total: number }) {
  const id = useId()
  const [shown, setShown] = useState(total)
  const run = (q: string) => {
    const needle = q.trim().toLowerCase()
    let n = 0
    document.querySelectorAll<HTMLElement>('[data-lib-row]').forEach((row) => {
      const hit = !needle || (row.dataset.text ?? '').includes(needle)
      row.hidden = !hit
      if (hit) n += 1
    })
    setShown(n)
  }
  return (
    <div className="er-filter er-search">
      <label htmlFor={id}>Search</label>
      <input
        id={id}
        className="c-input"
        type="search"
        onChange={(e) => run(e.target.value)}
        placeholder="Subject, step or text"
        maxLength={80}
        autoComplete="off"
      />
      <span className="c-muted" role="status">
        {shown} of {total} shown
      </span>
    </div>
  )
}
