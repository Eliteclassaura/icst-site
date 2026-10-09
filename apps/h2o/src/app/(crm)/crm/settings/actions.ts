'use server'

import { refresh } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { adminMfaAction } from '../../../../auth/mfa/admin-actions'
import { retryFailed } from '../../../../sheets/sync'
import { pendingSession } from '../../../../auth/mfa/guard'
import * as routing from '../../../../email/routing'
import * as sending from '../../../../email/sending-settings'
import * as templates from '../../../../crm/settings/templates'
import type { Outcome } from '../../../../crm/workspace/mutations'
import type { CrmSession } from '../../../../crm/workspace/session'
import type { ActionState } from '../../../../crm/workspace/ui/actionState'
import { actionSession } from '../session'

/**
 * Patch C settings actions. Each one resolves the session again (direct POSTs are possible), and the service layer
 * repeats the admin and step-up checks. The session id for the step-up comes from the request, never from the form.
 */
const DENIED: ActionState = { ok: false, code: 'FORBIDDEN', message: 'You don’t have access to the Sales Workspace.' }
const f = (fd: FormData, k: string) => {
  const v = fd.get(k)
  return typeof v === 'string' ? v : undefined
}

async function run(fn: (s: CrmSession, sid: string | null) => Promise<Outcome>): Promise<ActionState> {
  const s = await actionSession()
  if (!s) return DENIED
  const pending = await pendingSession(s.payload, await headers())
  const out = await fn(s, pending?.sid ?? null)
  if (out.ok) refresh()
  return { ...out, nonce: Date.now() } as ActionState
}

export async function stepUpAction(_: ActionState, fd: FormData) {
  return run((s, sid) => sending.confirmSettingsStepUp(s, sid, f(fd, 'password')))
}

export async function saveProfileAction(_: ActionState, fd: FormData) {
  const id = f(fd, 'id')
  const out = await run((s, sid) =>
    sending.saveProfile(s, sid, {
      id,
      name: f(fd, 'name'),
      preset: f(fd, 'preset'),
      use: f(fd, 'use'),
      host: f(fd, 'host'),
      port: f(fd, 'port'),
      tls_servername: f(fd, 'tls_servername'),
      username: f(fd, 'username'),
      password: f(fd, 'password'),
      from_address: f(fd, 'from_address'),
      from_name: f(fd, 'from_name'),
    }),
  )
  if (out.ok && !id && out.id) redirect(`/crm/settings/sending/${encodeURIComponent(out.id)}/`)
  return out
}

export async function activateProfileAction(_: ActionState, fd: FormData) {
  return run((s, sid) => sending.setProfileActive(s, sid, f(fd, 'id'), f(fd, 'on') === '1'))
}

export async function checkProfileAction(_: ActionState, fd: FormData) {
  return run((s, sid) => sending.checkProfile(s, sid, f(fd, 'id')))
}

export async function testProfileAction(_: ActionState, fd: FormData) {
  return run((s, sid) => sending.testSendProfile(s, sid, f(fd, 'id')))
}

export async function deleteProfileAction(_: ActionState, fd: FormData) {
  const out = await run((s, sid) => sending.deleteProfile(s, sid, f(fd, 'id')))
  if (out.ok) redirect('/crm/settings/sending/')
  return out
}

// ── Patch C: email templates ─────────────────────────────────────────────────────────────────────────────────────
export async function saveTemplateAction(_: ActionState, fd: FormData) {
  return run((s) => templates.saveTemplate(s, { id: f(fd, 'id'), name: f(fd, 'name'), subject: f(fd, 'subject'), body: f(fd, 'body'), purpose: f(fd, 'purpose') }))
}

export async function approveTemplateAction(_: ActionState, fd: FormData) {
  return run((s) => templates.setTemplateApproved(s, f(fd, 'id'), f(fd, 'approve') === '1', f(fd, 'hash')))
}

// ── ALERTS-1: email routing ──────────────────────────────────────────────────────────────────────────────────────
export async function saveRoutingAction(_: ActionState, fd: FormData) {
  return run((s, sid) => routing.saveRouting(s, sid, { alerts_us: f(fd, 'alerts_us'), alerts_th: f(fd, 'alerts_th'), alerts_cc: f(fd, 'alerts_cc'), sales_address: f(fd, 'sales_address') }))
}

export async function testAlertAction(_: ActionState, _fd: FormData) {
  return run((s, sid) => routing.sendTestAlert(s, sid))
}

/** MFA-ADMIN-1: reset two-step sign-in, or turn it off / back on for a non-admin. The service repeats every check. */
export async function peopleMfaAction(_: ActionState, fd: FormData) {
  return run((s, sid) => adminMfaAction(s, sid, { userId: f(fd, 'userId'), action: f(fd, 'action'), reason: f(fd, 'reason') }))
}

/** SHEET-SYNC-1: put the failed Google Sheet rows back in the queue. Admins only; nothing sensitive is changed. */
export async function retrySheetRowsAction(): Promise<ActionState> {
  const s = await actionSession()
  if (!s) return DENIED
  if (!s.isAdmin) return { ok: false, code: 'FORBIDDEN', message: 'This is for admins.', nonce: Date.now() }
  const n = await retryFailed(s.payload)
  refresh()
  return { ok: true, message: n ? `${n} request${n === 1 ? '' : 's'} will be tried again within a minute.` : 'Nothing to retry.', nonce: Date.now() }
}
