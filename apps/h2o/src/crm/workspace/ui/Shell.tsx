import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { DENSITY_COOKIE, densityFrom } from '../prefs'
import { IconAccounts, IconContacts, IconInbox, IconMore, IconPipeline, IconSearch, IconSettings, IconTasks, IconWork } from './Icons'
import { PaletteTrigger } from './PaletteTrigger'
import { loadViews } from '../savedViews'
import { ADMIN_EMBLEM } from '../../../brand/admin-brand'
import type { CrmSession } from '../session'

export type NavKey = 'work' | 'inbox' | 'followups' | 'pipeline' | 'accounts' | 'contacts' | 'search' | 'email' | 'settings' | 'none'

/**
 * "SYNTHETIC DATA" is an evidence/testing badge only (Control Tower amendment D). It renders only when
 * the deployment explicitly sets `H2O_CRM_EVIDENCE_BADGE=SYNTHETIC`; it is off by default and is never
 * part of normal CRM presentation.
 */
export const evidenceBadgeEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => env.H2O_CRM_EVIDENCE_BADGE === 'SYNTHETIC'

/**
 * Navigation. Desktop: the sidebar lists every section. Phone (W1-8, audit finding 9): a bottom bar with My Work,
 * Inbox, Tasks (Follow-ups), Search and More; More holds Pipeline, Accounts, Contacts and New inquiry, so every
 * section is reachable on a phone.
 */
const NAV: Array<{ key: NavKey; href: string; label: string; phone?: string; icon: ReactNode; desktop?: boolean; adminOnly?: boolean }> = [
  { key: 'work', href: '/crm/', label: 'My Work', icon: <IconWork /> },
  { key: 'inbox', href: '/crm/rfqs/', label: 'RFQ Inbox', phone: 'Inbox', icon: <IconInbox /> },
  { key: 'followups', href: '/crm/follow-ups/', label: 'Follow-ups', phone: 'Tasks', icon: <IconTasks /> },
  { key: 'accounts', href: '/crm/accounts/', label: 'Accounts', icon: <IconAccounts />, desktop: true },
  { key: 'contacts', href: '/crm/contacts/', label: 'Contacts', icon: <IconContacts />, desktop: true },
  { key: 'pipeline', href: '/crm/pipeline/', label: 'Pipeline', icon: <IconPipeline />, desktop: true },
  // CRM email M3: inbound email that was not linked automatically (admins only).
  { key: 'email', href: '/crm/email-review/', label: 'Email review', icon: <IconInbox />, desktop: true, adminOnly: true },
  // Patch C: sending profiles and email templates (admins only).
  { key: 'settings', href: '/crm/settings/', label: 'Settings', icon: <IconSettings />, desktop: true, adminOnly: true },
]

const MORE: Array<{ key: NavKey; href: string; label: string; adminOnly?: boolean }> = [
  { key: 'pipeline', href: '/crm/pipeline/', label: 'Pipeline' },
  { key: 'accounts', href: '/crm/accounts/', label: 'Accounts' },
  { key: 'contacts', href: '/crm/contacts/', label: 'Contacts' },
  { key: 'email', href: '/crm/email-review/', label: 'Email review', adminOnly: true },
  { key: 'settings', href: '/crm/settings/', label: 'Settings', adminOnly: true },
  { key: 'none', href: '/crm/new/', label: 'New inquiry' },
]

export async function Shell({
  active,
  title,
  crumb,
  userName,
  isAdmin,
  session,
  badges = {},
  topRight,
  children,
}: {
  active: NavKey
  title: string
  crumb?: ReactNode
  userName: string
  isAdmin: boolean
  /** W1-6: when given, the user's pinned saved views (own and shared) are listed under the navigation. */
  session?: CrmSession
  badges?: Partial<Record<NavKey, { n: number; error?: boolean }>>
  topRight?: ReactNode
  children: ReactNode
}) {
  const moreActive = MORE.some((m) => m.key === active && m.key !== 'none')
  const pinned = session ? (await loadViews(session)).filter((v) => v.pinned) : []
  const dense = densityFrom((await cookies()).get(DENSITY_COOKIE)?.value) === 'compact'
  return (
    <div className={`crm-app${dense ? ' is-dense' : ''}`}>
      <a className="c-skip" href="#crm-main">
        Skip to content
      </a>
      <nav className="c-side" aria-label="Sales Workspace">
        <div className="c-brand">
          {/* BRAND-ADMIN-1: the ICS emblem instead of the placeholder text mark (decorative; the label names the workspace). */}
          <img className="c-mark c-mark--logo" src={ADMIN_EMBLEM.src} width={24} height={24} alt="" />
          <span>Sales Workspace</span>
        </div>
        <ul className="c-nav" role="list">
          {NAV.filter((n) => !n.adminOnly || isAdmin).map((n) => {
            const b = badges[n.key]
            return (
              <li key={n.key} className={n.desktop ? 'is-desktop' : undefined}>
                <a href={n.href} aria-current={active === n.key ? 'page' : undefined} title={n.label}>
                  {n.icon}
                  <span className="lbl">
                    {n.phone ? (
                      <>
                        <span className="lbl-desk">{n.label}</span>
                        <span className="lbl-phone">{n.phone}</span>
                      </>
                    ) : (
                      n.label
                    )}
                  </span>
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
            <a href="/crm/search/" aria-current={active === 'search' ? 'page' : undefined} title="Search">
              <IconSearch />
              <span className="lbl">Search</span>
            </a>
          </li>
          <li className="c-mobile-only">
            <details className="c-more-nav">
              <summary aria-current={moreActive ? 'page' : undefined}>
                <IconMore />
                <span className="lbl">More</span>
              </summary>
              <ul role="list">
                {MORE.filter((m) => !m.adminOnly || isAdmin).map((m) => (
                  <li key={m.href}>
                    <a href={m.href} aria-current={active === m.key && m.key !== 'none' ? 'page' : undefined}>
                      {m.label}
                    </a>
                  </li>
                ))}
                <li>
                  <a href="/admin/logout/">Sign out</a>
                </li>
              </ul>
            </details>
          </li>
        </ul>
        {pinned.length ? (
          <div className="c-side-views">
            <p className="c-group-label" id="crm-pinned-views">
              Saved views
            </p>
            <ul role="list" aria-labelledby="crm-pinned-views">
              {pinned.map((v) => (
                <li key={v.id}>
                  <a href={v.href} title={v.shared ? `${v.name} (shared)` : v.name}>
                    <span className="c-trunc">{v.name}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
          <div className="c-top-search">
            <PaletteTrigger />
          </div>
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
