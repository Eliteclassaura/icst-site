import type { Payload } from 'payload'
import { stepUp } from './sending-settings'
import { readEmailConfig } from './config'
import { invalidateRouting, routingFromDoc, routingView, type RoutingValues } from './routing-read'
import { failureCode, gateRecipient, recipientRef } from './gate'
import { dedupeAddresses, parseAddressList, parseOneAddress } from './routing-parse'
import { resolveSending } from './profiles'
import { sendWith, type MailMessage } from './transport'
import { ALERT_TEST_RULE, bucketFor, count, retryAfter } from '../crm/intake/native/limits'
import { recordEmailEvent } from '../crm/notify'
import type { Outcome } from '../crm/workspace/mutations'
import type { CrmSession } from '../crm/workspace/session'
import type { SmtpSettings } from './config'

/**
 * ALERTS-1: Settings → Email routing. Who gets new quote alerts (per office), an optional copy list, and the public
 * sales address. Stored in the `crm-email-routing` global; an empty value falls back to the environment
 * (H2O_SALES_ALERT_TO for alerts, H2O_RFQ_SALES_EMAIL, then sales@h2ocooling.com, for the sales address), so a fresh
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
export type RoutingDeps = { now?: Date; send?: (s: SmtpSettings, m: MailMessage) => Promise<void> }

async function audit(payload: Payload, actorId: string, detail: Doc) {
  try {
    await payload.create({
      collection: 'audit-log',
      data: { action: 'email-routing-updated', collection: 'crm-email-routing', docId: 'global', changedKeys: Object.keys((detail.changes ?? {}) as Doc), summary: null, actor: actorId, actorEmail: null, ip: null, detail } as never,
      overrideAccess: true,
    })
  } catch (err) {
    payload.logger.error({ code: 'CRM_EMAIL_ROUTING_AUDIT_FAILED', errName: (err as Error)?.name })
  }
}

/** Save the routing. Admin only, step-up required, strict validation; nothing is written when nothing changed. */
export async function saveRouting(s: CrmSession, sid: string | null, input: RoutingInput, deps: RoutingDeps = {}): Promise<Outcome> {
  if (!s.isAdmin) return NOT_ADMIN
  const denied = await stepUp(s, sid, undefined, deps.now)
  if (denied) return denied
  const us = parseAddressList(input.alerts_us, 'Who gets new quote alerts (US)')
  if (!us.ok) return fail(us.code, us.message)
  const th = parseAddressList(input.alerts_th, 'Who gets new quote alerts (Thailand)')
  if (!th.ok) return fail(th.code, th.message)
  const cc = parseAddressList(input.alerts_cc, 'Also send a copy to')
  if (!cc.ok) return fail(cc.code, cc.message)
  const sales = parseOneAddress(input.sales_address, 'Sales address customers see')
  if (!sales.ok) return fail(sales.code, sales.message)
  const next: RoutingValues = { alerts_us: us.list, alerts_th: th.list, alerts_cc: cc.list, sales_address: sales.value }
  const prev = routingFromDoc(await s.payload.findGlobal({ slug: SLUG, ...sys }).catch(() => ({})))
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const k of Object.keys(next) as Array<keyof RoutingValues>) if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) changes[k] = { from: prev[k], to: next[k] }
  if (Object.keys(changes).length === 0) return { ok: true, message: 'Nothing changed.' }
  await s.payload.updateGlobal({ slug: SLUG, data: { ...next, alerts_us: next.alerts_us, alerts_th: next.alerts_th, alerts_cc: next.alerts_cc, sales_address: next.sales_address } as never, ...sys })
  invalidateRouting()
  await audit(s.payload, s.userId, { changes })
  return { ok: true, message: 'Saved. The next quote uses these settings.' }
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
  const v = await routingView(s.payload)
  const recipients = dedupeAddresses([v.effective.us, v.effective.th, v.effective.cc])
  if (recipients.length === 0) return fail('NO_RECIPIENTS', 'There are no alert recipients yet. Add at least one address first.')
  const sendable = recipients.filter((to) => gateRecipient(cfg, to) === 'SEND')
  if (sendable.length === 0)
    return fail('MODE_BLOCKS_TEST', cfg.mode === 'off' ? 'Email is off on this server (a server setting), so nothing can be sent.' : 'None of these addresses is on the server’s list of allowed test recipients.')
  const bucket = bucketFor(ALERT_TEST_RULE.bucket, s.userId)
  const wait = await retryAfter(s.payload, bucket, [ALERT_TEST_RULE], now)
  if (wait > 0) return fail('RATE_LIMITED', `A test alert was just sent. Try again in ${wait} second${wait === 1 ? '' : 's'}.`)
  await count(s.payload, bucket, now)
  const sending = await resolveSending(s.payload, cfg, 'TRANSACTIONAL')
  if (!sending.ok) return fail(sending.code, 'Email can’t be sent right now: no working sending profile. Check Settings → Sending profiles.')
  let sent = 0
  let failed = 0
  for (const to of sendable) {
    const ref = recipientRef(to)
    try {
      await (deps.send ?? sendWith)(sending.smtp, {
        from: `"${sending.fromName.replace(/["\\\r\n]/g, '')}" <${sending.fromAddress}>`,
        to,
        subject: TEST_ALERT_SUBJECT,
        text: testAlertText(s.displayName),
        headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
      })
      sent++
      await recordEmailEvent({ payload: s.payload } as never, { event: 'DIRECT_SENT', kind: 'RFQ_SALES_ALERT', code: 'TEST_ALERT', recipient_ref: ref })
    } catch (err) {
      failed++
      await recordEmailEvent({ payload: s.payload } as never, { event: 'DIRECT_FAILED', kind: 'RFQ_SALES_ALERT', code: failureCode(err).code, recipient_ref: ref })
    }
  }
  await audit(s.payload, s.userId, { test: { recipients: recipients.length, sent, failed, blockedByMode: recipients.length - sendable.length } })
  if (sent === 0) return fail('TEST_FAILED', 'The test alert could not be sent. Check Settings → Sending profiles.')
  const skipped = recipients.length - sendable.length
  return { ok: true, message: `Test alert sent to ${sent} address${sent === 1 ? '' : 'es'}.${failed ? ` ${failed} failed.` : ''}${skipped ? ` ${skipped} not sent because of the server’s email mode.` : ''}` }
}
