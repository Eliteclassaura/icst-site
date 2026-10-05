'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { globalSearchAction, listSearchAction, recentItemsAction } from '../actions'
import type { SearchHit, SearchResult } from '../../../../crm/workspace/search'

/**
 * Wave 1 W1-2 grouped search, shared by the ⌘K palette and the phone Search page.
 *
 * The term goes to a server action in a POST body; it is never put in the URL, stored, or logged. "Recent" items are
 * kept in this browser as `{ kind, id }` only (no names) and resolved to labels by the server as the user, so a
 * record the user can no longer open simply disappears from the list.
 *
 * Keyboard: ↑/↓ move through every result and action, Enter opens, Esc closes the palette (native dialog).
 */

const RECENT_KEY = 'crm-recent-v1'
const RECENT_MAX = 8

type Item = { key: string; title: string; context?: string; href?: string; showAll?: boolean; group: string; recent?: { kind: 'rfq' | 'account' | 'contact'; id: string } }

const ACTIONS: Array<{ title: string; href: string; keywords: string }> = [
  { title: 'New inquiry', href: '/crm/new/', keywords: 'new inquiry rfq create' },
  { title: 'New contact', href: '/crm/contacts/new/', keywords: 'new contact person create' },
  { title: 'New account', href: '/crm/accounts/new/', keywords: 'new account company create' },
  { title: 'Go to My Work', href: '/crm/', keywords: 'my work home dashboard' },
  { title: 'Go to RFQ Inbox', href: '/crm/rfqs/', keywords: 'inbox rfqs inquiries' },
  { title: 'Go to follow-ups', href: '/crm/follow-ups/', keywords: 'follow-ups tasks due overdue' },
  { title: 'Go to accounts', href: '/crm/accounts/', keywords: 'accounts companies directory' },
  { title: 'Go to contacts', href: '/crm/contacts/', keywords: 'contacts people directory' },
  { title: 'Go to pipeline', href: '/crm/pipeline/', keywords: 'pipeline opportunities' },
]

export function readRecent(): Array<{ kind: string; id: string }> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

/** Remember a visited record (kind + id only). Storage may be unavailable; that is not an error. */
export function rememberRecent(kind: 'rfq' | 'account' | 'contact', id: string) {
  try {
    const next = [{ kind, id }, ...readRecent().filter((r) => !(r.kind === kind && r.id === id))].slice(0, RECENT_MAX)
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* private mode or blocked storage: recents are a convenience */
  }
}

/** Placed on a record page to add it to the palette's recent items. Renders nothing. */
export function RememberRecent({ kind, id }: { kind: 'rfq' | 'account' | 'contact'; id: string }) {
  useEffect(() => rememberRecent(kind, id), [kind, id])
  return null
}

export function SearchPanel({ mode, onNavigate, autoFocus = true }: { mode: 'palette' | 'page'; onNavigate?: () => void; autoFocus?: boolean }) {
  const [q, setQ] = useState('')
  // The result is stored with the term it answers, so a stale or pending answer is never shown as current.
  const [answer, setAnswer] = useState<{ term: string; result: SearchResult } | null>(null)
  const [recent, setRecent] = useState<SearchHit[]>([])
  const [active, setActive] = useState(0)
  const seq = useRef(0)
  const input = useRef<HTMLInputElement>(null)
  const allForm = useRef<HTMLFormElement>(null)
  const listId = useId()
  const term = q.trim()
  const result = answer && answer.term === term ? answer.result : null
  const busy = term.length >= 2 && result === null

  useEffect(() => {
    if (autoFocus) input.current?.focus()
    const refs = readRecent()
    if (refs.length) recentItemsAction(refs).then(setRecent, () => setRecent([]))
  }, [autoFocus])

  useEffect(() => {
    const mine = ++seq.current
    if (term.length < 2) return
    const t = setTimeout(() => {
      globalSearchAction(term).then(
        (r) => {
          if (seq.current === mine) setAnswer({ term, result: r })
        },
        () => {
          if (seq.current === mine) setAnswer({ term, result: { status: 'error' } })
        },
      )
    }, 200)
    return () => clearTimeout(t)
  }, [term])

  const items: Item[] = useMemo(() => {
    const out: Item[] = []
    if (term.length >= 2 && result?.status === 'ok') {
      for (const g of result.groups)
        for (const h of g.hits)
          out.push({
            key: `${h.kind}:${h.id}`,
            title: h.title,
            context: h.context,
            href: h.href,
            group: g.label,
            recent: h.kind === 'site' ? undefined : { kind: h.kind, id: h.id },
          })
      const rfq = result.groups.find((g) => g.kind === 'rfq')
      if (rfq?.hits.length) out.push({ key: 'all-rfqs', title: 'Show all matching inquiries in the inbox', group: 'Inquiries', showAll: true })
    } else if (term.length < 2) {
      for (const h of recent) out.push({ key: `r:${h.kind}:${h.id}`, title: h.title, context: h.context, href: h.href, group: 'Recent', recent: h.kind === 'site' ? undefined : { kind: h.kind, id: h.id } })
    }
    const lc = term.toLowerCase()
    for (const a of ACTIONS)
      if (!lc || a.title.toLowerCase().includes(lc) || a.keywords.includes(lc)) out.push({ key: `a:${a.href}`, title: a.title, href: a.href, group: 'Actions' })
    return out
  }, [term, result, recent])

  const current = Math.max(0, Math.min(active, items.length - 1))

  const go = useCallback(
    (it: Item | undefined) => {
      if (!it) return
      if (it.recent) rememberRecent(it.recent.kind, it.recent.id)
      if (it.showAll) return allForm.current?.requestSubmit()
      if (it.href) {
        onNavigate?.()
        window.location.assign(it.href)
      }
    },
    [onNavigate],
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(Math.min(items.length - 1, current + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(Math.max(0, current - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(items[current])
    }
  }

  const groups: Array<{ name: string; items: Array<Item & { index: number }> }> = []
  items.forEach((it, index) => {
    const g = groups.find((x) => x.name === it.group)
    if (g) g.items.push({ ...it, index })
    else groups.push({ name: it.group, items: [{ ...it, index }] })
  })
  const optionId = (i: number) => `${listId}-o${i}`
  const status =
    term.length < 2
      ? 'Type at least 2 characters to search inquiries, accounts, contacts and plants.'
      : busy
        ? 'Searching…'
        : result?.status === 'error'
          ? 'Search is unavailable. Try again.'
          : result?.status === 'ok'
            ? (() => {
                const n = result.groups.reduce((t, g) => t + g.hits.length, 0)
                return n === 0 ? 'No matches.' : `${n} match${n === 1 ? '' : 'es'}.`
              })()
            : ''

  return (
    <div className={`c-palette is-${mode}`}>
      <label className="c-visually-hidden" htmlFor={`${listId}-input`}>
        Search inquiries, accounts, contacts and plants
      </label>
      <input
        ref={input}
        id={`${listId}-input`}
        className="c-input c-palette-input"
        type="search"
        role="combobox"
        aria-expanded={items.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={items.length ? optionId(current) : undefined}
        placeholder="Search inquiries, accounts, contacts, plants…"
        autoComplete="off"
        spellCheck={false}
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
        data-crm-text-entry
      />
      <p className="c-hint c-palette-status" role="status" aria-live="polite">
        {status}
      </p>
      <div id={listId} role="listbox" aria-label="Search results and actions" className="c-palette-list">
        {groups.map((g) => (
          <div key={g.name} role="group" aria-label={g.name}>
            <p className="c-group-label" aria-hidden="true">
              {g.name}
            </p>
            {g.items.map((it) => (
              <a
                key={it.key}
                id={optionId(it.index)}
                role="option"
                aria-selected={it.index === current}
                className="c-palette-option"
                href={it.href ?? '#'}
                tabIndex={-1}
                onMouseMove={() => setActive(it.index)}
                onClick={(e) => {
                  e.preventDefault()
                  go(it)
                }}
              >
                <span className="c-trunc">{it.title}</span>
                {it.context ? <span className="c-hint c-trunc">{it.context}</span> : null}
              </a>
            ))}
          </div>
        ))}
      </div>
      {/* "Show all": hands the term to the inbox through the list-search cookie (POST), never the URL. */}
      <form ref={allForm} action={listSearchAction} hidden>
        <input type="hidden" name="list" value="inbox" />
        <input type="hidden" name="q" value={term} />
        <input type="hidden" name="back" value="" />
      </form>
    </div>
  )
}
