import type { ListKey } from '../../../../crm/workspace/prefs'
import { clearListSearchAction, listSearchAction } from '../actions'

/**
 * Wave 1 list controls shared by the inbox and the directories.
 *
 * `ListSearch` posts the term to a server action (stored in an HttpOnly cookie, never the URL). `back` is the list's
 * current filter query, which the action re-parses and re-builds, so only validated filters survive.
 */
export function ListSearch({
  list,
  term,
  back,
  label,
  placeholder,
  inputId,
}: {
  list: ListKey
  term: string | null
  back: string
  label: string
  placeholder: string
  inputId: string
}) {
  return (
    <form className="c-list-search" role="search" action={listSearchAction} aria-label={label}>
      <input type="hidden" name="list" value={list} />
      <input type="hidden" name="back" value={back} />
      <label className="c-visually-hidden" htmlFor={inputId}>
        {label}
      </label>
      <input id={inputId} className="c-input" type="search" name="q" defaultValue={term ?? ''} placeholder={placeholder} autoComplete="off" />
      <button className="c-btn" type="submit">
        Search
      </button>
    </form>
  )
}

export type Chip = { key: string; label: string; href: string }

/** Active filters as removable chips; the search term chip clears through a POST (it is not in any URL). */
export function Chips({ chips, list, term, back, clearAllHref }: { chips: Chip[]; list: ListKey; term: string | null; back: string; clearAllHref: string }) {
  if (chips.length === 0 && !term) return null
  return (
    <div className="c-chips" role="group" aria-label="Active filters">
      {term ? (
        <form action={clearListSearchAction} className="c-chip-form">
          <input type="hidden" name="list" value={list} />
          <input type="hidden" name="back" value={back} />
          <button type="submit" className="c-chip is-on" aria-label={`Remove search “${term}”`}>
            Search: “{term}” <span aria-hidden="true">×</span>
          </button>
        </form>
      ) : null}
      {chips.map((c) => (
        <a key={c.key} className="c-chip is-on" href={c.href} aria-label={`Remove filter ${c.label}`}>
          {c.label} <span aria-hidden="true">×</span>
        </a>
      ))}
      {chips.length + (term ? 1 : 0) > 1 ? (
        <a className="c-chip" href={clearAllHref}>
          Clear filters
        </a>
      ) : null}
    </div>
  )
}

/** The query-string part of a list URL (for `back`). */
export const queryOf = (href: string) => href.split('?')[1] ?? ''
