import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { CrmCalendarProvider } from './_components/CalendarContext'
import { CommandPalette } from './_components/CommandPalette'
import { CrmThemeProvider } from '../../../crm/workspace/ui/Theme'
import { themeAction } from './actions'
import { themeFrom } from '../../../crm/workspace/theme'
import { officeSettings } from '../../../crm/officeSettings'
import { currentSession, mfaPath } from './session'

/**
 * Workspace gate, above the streaming boundary (`loading.tsx`).
 *
 * Every page still calls `requireCrmSession` itself (defence in depth, and it needs the session). This
 * layout runs the same check first, before anything is streamed, so a signed-out or non-CRM request gets
 * a real HTTP redirect instead of a streamed shell with a client-side redirect. The return path comes from
 * `x-crm-path`, which `src/proxy.ts` overwrites on every CRM request (a client cannot supply it) and which
 * is accepted only in its expected shape.
 */
const SAFE_PATH = /^\/crm\/(?:[A-Za-z0-9_-]+\/)*$/

export default async function CrmGate({ children }: { children: ReactNode }) {
  const raw = (await headers()).get('x-crm-path') ?? ''
  const path = SAFE_PATH.test(raw) ? raw : '/crm/'
  // Patch L2: the two-factor page serves a password-only session; it authenticates that session itself.
  if (path === '/crm/mfa/') return children
  const { signedIn, mfaPending, session } = await currentSession()
  if (!signedIn) redirect(mfaPending ? mfaPath(path) : `/admin/login/?redirect=${encodeURIComponent(path)}`)
  if (!session && path !== '/crm/denied/') redirect('/crm/denied/')
  if (!session) return children
  // W1-2: one ⌘K palette for every workspace page. `display: contents` host keeps the design tokens in scope.
  // Patch L1: client quick dates use the viewer's zone and their office's holidays.
  const holidays = [...(await officeSettings(session.payload)).holidays[session.office]]
  return (
    <CrmCalendarProvider zone={session.timeZone} holidays={holidays}>
      {/* DARK-1: the user's theme wraps the workspace and the palette host (crm.css token sets). */}
      <CrmThemeProvider theme={themeFrom(session.user.crm_theme)} save={themeAction}>
        {children}
        <div className="crm-app crm-portal-host">
          <CommandPalette />
        </div>
      </CrmThemeProvider>
    </CrmCalendarProvider>
  )
}
