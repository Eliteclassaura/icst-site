import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { CommandPalette } from './_components/CommandPalette'
import { currentSession } from './session'

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
  const { signedIn, session } = await currentSession()
  if (!signedIn) redirect(`/admin/login/?redirect=${encodeURIComponent(path)}`)
  if (!session && path !== '/crm/denied/') redirect('/crm/denied/')
  if (!session) return children
  // W1-2: one ⌘K palette for every workspace page. `display: contents` host keeps the design tokens in scope.
  return (
    <>
      {children}
      <div className="crm-app crm-portal-host">
        <CommandPalette />
      </div>
    </>
  )
}
