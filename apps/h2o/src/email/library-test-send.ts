import { libraryRow, renderSample, sampleRecipients, variantsOf } from '../crm/library/service'
import { recordEmailEvent } from '../crm/notify'
import type { Outcome } from '../crm/workspace/mutations'
import type { CrmSession } from '../crm/workspace/session'
import { readEmailConfig, recipientKey } from './config'
import { failureCode, gateRecipient, recipientRef } from './gate'
import { textToHtml } from './messages'
import { resolveSending } from './profiles'
import { stepUp, testRateLimit, type SendingDeps } from './sending-settings'
import { sendWith } from './transport'

/**
 * LIB-TEST-SEND-1 (owner/CT 2026-10-11). It lives in email/, not in crm/library/: the library itself can never send. An admin sends ONE library email to their own address to see it in a real
 * mailbox. No sequence step and no engine: the same preview samples (so every field fills), the same missing-field rule (a
 * preview that would be held is not sent), the viewer's real signature, the mode gate, and the active sending profile.
 * Own address only (never typed in), password step-up, the shared test rate limit, recorded by reference.
 */
const fail = (code: string, message: string): Outcome => ({ ok: false, code, message })

export async function sendLibraryTest(
  s: CrmSession,
  sid: string | null,
  input: { id?: string; variant?: unknown; sample?: unknown },
  deps: SendingDeps = {},
): Promise<Outcome> {
  if (!s.isAdmin) return fail('FORBIDDEN', 'Test emails are sent by admins.')
  const now = deps.now ?? new Date()
  const denied = await stepUp(s, sid, undefined, now)
  if (denied) return denied
  const found = input.id ? await libraryRow(s, input.id) : null
  if (!found) return fail('NOT_FOUND', 'That library email was not found.')
  const { row, template } = found
  if (row.type !== 'EMAIL' || row.status === 'SKELETON') return fail('NOT_AN_EMAIL', 'Only a written email can be sent as a test.')
  const variants = variantsOf(row, template)
  const vi = Math.min(Math.max(Number(input.variant ?? 0) || 0, 0), Math.max(variants.length - 1, 0))
  const shown = variants[vi]
  if (!shown) return fail('NO_COPY', 'This email has no copy to send yet.')
  const samples = await sampleRecipients(s.payload, s.userId)
  const who = samples.find((x) => x.id === input.sample) ?? samples[0]!
  if (who.id === 'c') return fail('SAMPLE_INCOMPLETE', 'Sample C is incomplete on purpose. Choose Sample A or B.')
  const merged = renderSample(shown.subject, shown.body, who.values)
  if (merged.missing.length) return fail('TEST_HELD', `This email would be held: missing ${merged.missing.join(', ')}. It is not sent.`)

  const to = recipientKey(s.user.email)
  if (!to) return fail('NO_ADDRESS', 'Your account has no usable email address.')
  const cfg = readEmailConfig()
  if (gateRecipient(cfg, to) !== 'SEND')
    return fail(
      'MODE_BLOCKS_TEST',
      cfg.mode === 'off' ? 'Email is off on this server (a server setting), so nothing can be sent.' : 'Your address isn’t on the server’s list of allowed test recipients.',
    )
  const blocked = await testRateLimit(s, now)
  if (blocked) return blocked
  const sending = await resolveSending(s.payload, cfg, 'TRANSACTIONAL', now.getTime(), { resolve: deps.resolve })
  if (!sending.ok) return fail(sending.code, 'There is no usable sending profile. Check Settings → Sending profiles.')
  const text = `${merged.body.trimEnd()}\n\n— This is a test of the Email Library, sent only to you. Nothing was sent to a customer. —\n`
  const ref = recipientRef(to)
  try {
    await (deps.send ?? sendWith)(sending.smtp, {
      from: `"${sending.fromName.replace(/["\\\r\n]/g, '')}" <${sending.fromAddress}>`,
      to,
      subject: `[TEST] ${merged.subject}`.replace(/[\r\n]+/g, ' ').slice(0, 200),
      text,
      html: textToHtml(text),
      headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
    })
  } catch (err) {
    const { code } = failureCode(err)
    await recordEmailEvent({ payload: s.payload } as never, { event: 'DIRECT_FAILED', kind: 'LIBRARY_TEST', code, recipient_ref: ref })
    return fail(code, 'The test email could not be sent. Check Settings → Sending profiles.')
  }
  await recordEmailEvent({ payload: s.payload } as never, { event: 'DIRECT_SENT', kind: 'LIBRARY_TEST', recipient_ref: ref })
  return { ok: true, message: 'Test email sent to your address.' }
}
