import type { ReactNode } from 'react'
import { engineStatus } from '../../../../../crm/library/service'
import { t } from '../../../../../crm/library/ui-strings'
import { Shell } from '../../../../../crm/workspace/ui/Shell'
import { ToneChip } from '../../../../../crm/workspace/ui/Status'
import type { CrmSession } from '../../../../../crm/workspace/session'

export type ErTab = 'overview' | 'campaigns' | 'sequences' | 'library' | 'advanced'
const TABS: Array<{ key: ErTab; href: string; label: string }> = [
  { key: 'overview', href: '/crm/email-revenue/', label: 'Overview' },
  { key: 'campaigns', href: '/crm/email-revenue/campaigns/', label: 'Campaigns' },
  { key: 'sequences', href: '/crm/email-revenue/sequences/', label: 'Sequences' },
  { key: 'library', href: '/crm/email-revenue/library/', label: 'Library' },
  { key: 'advanced', href: '/crm/email-revenue/advanced/', label: 'Advanced' },
]

/**
 * The Email Revenue area frame: the persistent engine status strip (text, never a toggle), the section tabs and the
 * page. The strip reads the engine state on every render; turning the engine on or off is not done here.
 */
export async function EmailRevenueFrame({
  s,
  tab,
  title,
  crumb,
  children,
}: {
  s: CrmSession
  tab: ErTab
  title: string
  crumb?: ReactNode
  children: ReactNode
}) {
  const e = await engineStatus(s.payload)
  return (
    <Shell
      active="revenue"
      title={title}
      userName={s.displayName}
      session={s}
      isAdmin={s.isAdmin}
      crumb={crumb}
    >
      <div className={`c-banner er-strip${e.state === 'PAUSED' ? ' is-error' : ''}`} role="status">
        {e.state === 'ON' ? (
          <ToneChip tone="success">{t('ers.strip.on')}</ToneChip>
        ) : e.state === 'PAUSED' ? (
          <ToneChip tone="warning">
            {t('ers.strip.paused', {
              reason: e.reason ?? 'The engine paused itself.',
              since: e.since ? new Date(e.since).toUTCString() : 'earlier',
            })}
          </ToneChip>
        ) : (
          <>
            <ToneChip tone="terminal">{t('ers.strip.off')}</ToneChip>
            <span className="er-strip-detail">
              {t('ers.strip.off.detail')} {e.reason}
            </span>
          </>
        )}
      </div>
      <nav className="c-tabs er-tabs" aria-label="Email Revenue sections">
        {TABS.map((x) => (
          <a key={x.key} href={x.href} aria-current={tab === x.key ? 'page' : undefined}>
            {x.label}
          </a>
        ))}
      </nav>
      {children}
    </Shell>
  )
}
