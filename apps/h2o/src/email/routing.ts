import type { Payload } from 'payload'
import { stepUp } from './sending-settings'
import { kindAllowed, readEmailConfig, resolveSalesAddress as resolveSalesAddressEnv } from './config'
import { invalidateRouting, routingFromDoc, routingView, type RoutingValues } from './routing-read'
import { failureCode, gateRecipient, recipientRef } from './gate'
import { dedupeAddresses, parseAddressList, parseOneAddress } from './routing-parse'
import { resolveSending } from './profiles'
import { sendWith, type MailMessage } from './transport'
import { admit, ALERT_TEST_RULE, bucketFor } from '../crm/intake/native/limits'
import { recordEmailEvent } from '../crm/notify'
import { textToHtml } from './messages'
import type { Outcome } from '../crm/workspace/mutations'
import type { CrmSession } from '../crm/workspace/session'
import type { SmtpSettings } from './config'
import { identity } from './client-identity'

/**
 * ALERTS-1: Settings → Email routing. Who gets new quote alerts (per office), an optional copy list, and the public
 * sales address. Stored in the `crm-email-routing` global; an empty value falls back to the environment
 * (H2O_SALES_ALERT_TO for alerts, H2O_RFQ_SALES_EMAIL, then the client's default sales address, for the sales address), so a fresh
 * database behaves exactly as before.
 *
 * Saving and the test alert are admin-only and need the step-up (a fresh app code, 5 minutes). A save is audited with
 * old → new values and the actor, and applies to the next quote (no restart; other processes within `TTL_MS`).
 */
type Doc = Record<string, unknown>
const SLUG = 'crm-email-routing' as never
const sys = { overrideAccess: true as const, depth: 0 }
const fail = (code: string, message: string): Outcome => ({ ok: false, code, message })
const NOT_ADMIN = fail('FORBIDDEN', 'Email routing is for admins.')

export type RoutingInput = { alerts_us?: string; alerts_th?: string; alerts_cc?: string; sales_address?: string }
export type RoutingDeps = {
  now?: Date
  send?: (s: SmtpSettings, m: MailMessage) => Promise<void>
  /** The notice to the previous sales address (default: Payload's mail adapter, same gate as the password reset). */
  notify?: (to: string, subject: string, text: string) => Promise<void>
  /** Tests: the overall deadline for the alert-list-change notices. */
  noticeDeadlineMs?: number
}

/** Company domains the public sales address may use (env `H2O_SALES_ADDRESS_DOMAINS`; default the client's own domains). The alert lists are NOT restricted (the owner's list includes a Gmail address). */
export const salesAddressDomains = (env: NodeJS.ProcessEnv = process.env): string[] =>
  (env.H2O_SALES_ADDRESS_DOMAINS ?? identity.salesDomains.join(',')).split(',').map((d) => d.trim().toLowerCase()).filter(Boolean)

async function audit(payload: Payload, actorId: string, detail: Doc): Promise<boolean> {
  try {
    await payload.create({
      collection: 'audit-log',
      data: { action: 'email-routing-updated', collection: 'crm-email-routing', docId: 'global', changedKeys: Object.keys((detail.changes ?? {}) as Doc), summary: null, actor: actorId, actorEmail: null, ip: null, detail } as never,
      overrideAccess: true,
    })
    return true
  } catch (err) {
    payload.logger.error({ code: 'CRM_EMAIL_ROUTING_AUDIT_FAILED', errName: (err as Error)?.name })
    return false
  }
}

/** Save the routing. Admin only, step-up required, strict validation; nothing is written when nothing changed. */
export async function saveRouting(s: CrmSession, sid: string | null, input: RoutingInput, deps: RoutingDeps = {}): Promise<Outcome> {
  if (!s.isAdmin) return NOT_ADMIN
  const denied = await stepUp(s, sid, undefined, deps.now)
  if (denied) return denied
  const us = parseAddressList(input.alerts_us, 'Extra recipients for the US office')
  if (!us.ok) return fail(us.code, us.message)
  const th = parseAddressList(input.alerts_th, 'Extra recipients for the Thailand office')
  if (!th.ok) return fail(th.code, th.message)
  const cc = parseAddressList(input.alerts_cc, 'Everyone who gets all new quote requests')
  if (!cc.ok) return fail(cc.code, cc.message)
  const sales = parseOneAddress(input.sales_address, 'Sales address customers see')
  if (!sales.ok) return fail(sales.code, sales.message)
  if (sales.value && !salesAddressDomains().includes(sales.value.slice(sales.value.lastIndexOf('@') + 1)))
    return fail('ROUTING_SALES_DOMAIN', `Sales address customers see: use an address at ${salesAddressDomains().join(' or ')}. (The alert lists can use any address.)`)
  const next: RoutingValues = { alerts_us: us.list, alerts_th: th.list, alerts_cc: cc.list, sales_address: sales.value }
  const prev = routingFromDoc(await s.payload.findGlobal({ slug: SLUG, ...sys }).catch(() => ({})))
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const k of Object.keys(next) as Array<keyof RoutingValues>) if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) changes[k] = { from: prev[k], to: next[k] }
  if (Object.keys(changes).length === 0) return { ok: true, message: 'Nothing changed.' }
  // The audit entry comes FIRST: if it cannot be written, nothing is saved.
  if (!(await audit(s.payload, s.userId, { changes }))) return fail('AUDIT_FAILED', 'Not saved: the change could not be recorded. Try again in a moment.')
  await s.payload.updateGlobal({ slug: SLUG, data: { ...next } as never, ...sys })
  invalidateRouting()
  // A changed public sales address: tell the PREVIOUS address (best effort; the outcome is recorded).
  const before = prev.sales_address ?? resolveSalesAddressEnv(process.env)
  const after = next.sales_address ?? resolveSalesAddressEnv(process.env)
  const send = deps.notify ?? ((to: string, sub: string, body: string) => s.payload.sendEmail({ to, subject: sub, text: body }).then(() => undefined))
  const actor = s.displayName.replace(/[\r\n]/g, ' ').slice(0, 80)
  if (changes.sales_address && before !== after) {
    const subject = 'The sales address shown to customers was changed'
    const text = `The public sales address on the H2O website was changed from ${before} to ${after} by ${actor}.\n\nIf this was not expected, sign in to the CRM and check Settings → Email routing.\n`
    let ok = true
    try {
      await send(before, subject, text)
    } catch {
      ok = false
    }
    await audit(s.payload, s.userId, { notice: { kind: 'sales-address-changed', sent: ok } })
  }
  // CRM-B-4C-FIX note A: when ANY alert list changes, the people who were on the lists before, and every admin, are told
  // (one message each; best effort, audited with counts only; a failed notice never fails the save).
  const listsChanged = (['alerts_us', 'alerts_th', 'alerts_cc'] as const).some((k) => changes[k])
  if (listsChanged) {
    const previousEveryone = prev.alerts_cc.length > 0 ? prev.alerts_cc : readEmailConfig().salesAlertTo
    const adminEmails = await adminAddresses(s.payload)
    const recipients = dedupeAddresses([previousEveryone, prev.alerts_us, prev.alerts_th, adminEmails])
    const changedNames = (['alerts_cc', 'alerts_us', 'alerts_th'] as const).filter((k) => changes[k]).map((k) => LIST_LABEL[k])
    const subject = 'Who gets new quote alerts was changed'
    const text = `The list of people who get new quote alerts on the H2O website was changed by ${actor}.\n\nChanged: ${changedNames.join('; ')}.\n\nIf this was not expected, sign in to the CRM and check Settings → Email routing.\n`
    // 4C-FIX.1 (Auditor N2): all at once under ONE overall deadline, so a slow mail server delays the save by at most the
    // deadline, not by the sum of the timeouts. A notice still in flight when the deadline passes counts as failed.
    const { sent, failed } = await sendAllWithin(recipients, (to) => send(to, subject, text), deps.noticeDeadlineMs ?? NOTICE_DEADLINE_MS)
    await audit(s.payload, s.userId, { notice: { kind: 'alert-lists-changed', recipients: recipients.length, sent, failed } })
  }
  return { ok: true, message: 'Saved. The next quote uses these settings.' }
}

export const NOTICE_DEADLINE_MS = 8000
/** Run every send at once; resolve when all are done or the deadline passes, whichever is first. */
async function sendAllWithin(items: string[], one: (to: string) => Promise<void>, ms: number): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0
  const jobs = items.map((to) => one(to).then(() => void sent++, () => void failed++))
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([Promise.all(jobs), new Promise<void>((r) => (timer = setTimeout(r, ms)))])
  clearTimeout(timer)
  return { sent, failed: items.length - sent }
}

const LIST_LABEL = { alerts_cc: 'everyone who gets all new quote requests', alerts_us: 'extra recipients for the US office', alerts_th: 'extra recipients for the Thailand office' } as const

/** Every admin's address (platform-admin and client-admin): they are told when the alert lists change. */
async function adminAddresses(payload: Payload): Promise<string[]> {
  try {
    const res = await payload.find({ collection: 'users', where: { roles: { in: ['platform-admin', 'client-admin'] } } as never, limit: 100, depth: 0, overrideAccess: true })
    return (res.docs as unknown as Doc[]).map((u) => (typeof u.email === 'string' ? u.email : '')).filter(Boolean)
  } catch {
    return []
  }
}

/** Subject and body of the test alert: plainly a test; no customer data, no phone, no address. */
export const TEST_ALERT_SUBJECT = '[TEST] H2O CRM new quote alert routing check'
export const testAlertText = (senderName: string): string =>
  `TEST — this is not a real quote.\n\nAn admin (${senderName.replace(/[\r\n]/g, ' ').slice(0, 80)}) pressed “Send test alert” in CRM → Settings → Email routing. If you can read this, you are on the list that receives new quote alerts.\n\nNo action needed.\n`

/** One clearly labelled TEST alert to each configured alert recipient (both offices and the copy list), nothing else. */
export async function sendTestAlert(s: CrmSession, sid: string | null, deps: RoutingDeps = {}): Promise<Outcome> {
  if (!s.isAdmin) return NOT_ADMIN
  const now = deps.now ?? new Date()
  const denied = await stepUp(s, sid, undefined, now)
  if (denied) return denied
  const cfg = readEmailConfig()
  // The same launch gate as every queued kind (checked here, as the worker does before submit): an operator who narrowed
  // H2O_EMAIL_ALLOWED_KINDS without TEST_ALERT turns the button off.
  if (!kindAllowed('TEST_ALERT', cfg)) return fail('KIND_NOT_ALLOWED', 'Test alerts are switched off on this server.')
  const v = await routingView(s.payload)
  const recipients = dedupeAddresses([v.effective.everyone, v.effective.us, v.effective.th])
  if (recipients.length === 0) return fail('NO_RECIPIENTS', 'There are no alert recipients yet. Add at least one address first.')
  const sendable = recipients.filter((to) => gateRecipient(cfg, to) === 'SEND')
  if (sendable.length === 0)
    return fail('MODE_BLOCKS_TEST', cfg.mode === 'off' ? 'Email is off on this server (a server setting), so nothing can be sent.' : 'None of these addresses is on the server’s list of allowed test recipients.')
  // Atomic: the attempt is counted first, then checked (admit), so parallel clicks cannot all pass.
  const wait = await admit(s.payload, [{ bucket: bucketFor(ALERT_TEST_RULE.bucket, s.userId), rules: [ALERT_TEST_RULE] }], now)
  if (wait > 0) return fail('RATE_LIMITED', `A test alert was sent recently. Try again in ${wait > 90 ? `${Math.ceil(wait / 60)} minutes` : `${wait} second${wait === 1 ? '' : 's'}`}.`)
  const sending = await resolveSending(s.payload, cfg, 'TRANSACTIONAL')
  if (!sending.ok) return fail(sending.code, 'Email can’t be sent right now: no working sending profile. Check Settings → Sending profiles.')
  // ONE message with every recipient in To, like the real alert (owner ruling 2026-10-08).
  let sent = 0
  let failed = 0
  const text = testAlertText(s.displayName)
  try {
    await (deps.send ?? sendWith)(sending.smtp, {
      from: `"${sending.fromName.replace(/["\\\r\n]/g, '')}" <${sending.fromAddress}>`,
      to: sendable.join(', '),
      subject: TEST_ALERT_SUBJECT,
      text,
      html: textToHtml(text),
      headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
    })
    sent = sendable.length
    for (const to of sendable) await recordEmailEvent({ payload: s.payload } as never, { event: 'DIRECT_SENT', kind: 'RFQ_SALES_ALERT', code: 'TEST_ALERT', recipient_ref: recipientRef(to) })
  } catch (err) {
    failed = sendable.length
    for (const to of sendable) await recordEmailEvent({ payload: s.payload } as never, { event: 'DIRECT_FAILED', kind: 'RFQ_SALES_ALERT', code: failureCode(err).code, recipient_ref: recipientRef(to) })
  }
  await audit(s.payload, s.userId, { test: { recipients: recipients.length, sent, failed, blockedByMode: recipients.length - sendable.length } })
  if (sent === 0) return fail('TEST_FAILED', 'The test alert could not be sent. Check Settings → Sending profiles.')
  const skipped = recipients.length - sendable.length
  return { ok: true, message: `Test alert sent to ${sent} address${sent === 1 ? '' : 'es'}.${failed ? ` ${failed} failed.` : ''}${skipped ? ` ${skipped} not sent because of the server’s email mode.` : ''}` }
}
