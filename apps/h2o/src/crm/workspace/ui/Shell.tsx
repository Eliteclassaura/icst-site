import type { ReactNode } from 'react'
import { IconInbox, IconPipeline, IconSearch, IconTasks, IconWork } from './Icons'

export type NavKey = 'work' | 'inbox' | 'followups' | 'pipeline' | 'none'

/**
 * "SYNTHETIC DATA" is an evidence/testing badge only (Control Tower amendment D). It renders only when
 * the deployment explicitly sets `H2O_CRM_EVIDENCE_BADGE=SYNTHETIC`; it is off by default and is never
 * part of normal CRM presentation.
 */
export const evidenceBadgeEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => env.H2O_CRM_EVIDENCE_BADGE === 'SYNTHETIC'

const NAV: Array<{ key: NavKey; href: string; label: string; icon: ReactNode; desktop?: boolean }> = [
  { key: 'work', href: '/crm/', label: 'My Work', icon: <IconWork /> },
  { key: 'inbox', href: '/crm/rfqs/', label: 'RFQ Inbox', icon: <IconInbox /> },
  { key: 'followups', href: '/crm/follow-ups/', label: 'Follow-ups', icon: <IconTasks />, desktop: true },
  { key: 'pipeline', href: '/crm/pipeline/', label: 'Pipeline', icon: <IconPipeline />, desktop: true },
]

export function Shell({
  active,
  title,
  crumb,
  userName,
  isAdmin,
  badges = {},
  topRight,
  children,
}: {
  active: NavKey
  title: string
  crumb?: ReactNode
  userName: string
  isAdmin: boolean
  badges?: Partial<Record<NavKey, { n: number; error?: boolean }>>
  topRight?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="crm-app">
      <a className="c-skip" href="#crm-main">
        Skip to content
      </a>
      <nav className="c-side" aria-label="Sales Workspace">
        <div className="c-brand">
          <span className="c-mark" aria-hidden="true">
            ICS
          </span>
          <span>Sales Workspace</span>
        </div>
        <ul className="c-nav" role="list">
          {NAV.map((n) => {
            const b = badges[n.key]
            return (
              <li key={n.key} className={n.desktop ? 'is-desktop' : undefined}>
                <a href={n.href} aria-current={active === n.key ? 'page' : undefined} title={n.label}>
                  {n.icon}
                  <span className="lbl">{n.label}</span>
                  {b && b.n > 0 ? (
                    <span className={`c-badge${b.error ? ' is-error' : ''}`} aria-label={`${b.n} ${b.error ? 'overdue' : 'waiting'}`}>
                      {b.n > 99 ? '99+' : b.n}
                    </span>
                  ) : null}
                </a>
              </li>
            )
          })}
          <li className="c-mobile-only">
            <a href="/crm/rfqs/#crm-search" title="Search">
              <IconSearch />
              <span className="lbl">Search</span>
            </a>
          </li>
        </ul>
        <div className="c-side-foot">
          <strong>{userName}</strong>
          {isAdmin ? 'Admin' : 'Sales'} · <a href="/admin/logout/">Sign out</a>
        </div>
      </nav>
      <div className="c-main">
        <header className="c-top">
          <div>
            {crumb ? <div className="c-crumb">{crumb}</div> : null}
            <h1>{title}</h1>
          </div>
          <form className="c-top-search" role="search" action="/crm/rfqs/" method="get">
            <label className="c-visually-hidden" htmlFor="crm-top-search">
              Search RFQs, companies and contacts
            </label>
            <input id="crm-top-search" className="c-input" type="search" name="q" placeholder="Search RFQ number, company, contact…" autoComplete="off" />
          </form>
          <div className="c-top-right">
            {topRight}
            {evidenceBadgeEnabled() ? <span className="c-evidence">SYNTHETIC DATA</span> : null}
          </div>
        </header>
        <main id="crm-main" className="c-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}
