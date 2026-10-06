/**
 * Revenue Engine slice 1: RFC 3464 delivery status notifications (bounces that arrive later, by mail). Pure.
 *
 * A DSN's `message/delivery-status` part has one per-message block and then one block per recipient:
 *   Final-Recipient: rfc822; someone@example.test
 *   Action: failed
 *   Status: 5.1.1
 * Only `Action: failed` with a 5.x.x status is a hard bounce — except 5.7.x (policy / authentication / reputation),
 * which says nothing about the address. 4.x.x (delayed) is never a bounce.
 */
export type DsnRecipient = { recipient: string; action: string; status: string }

export function parseDeliveryStatus(text: string): DsnRecipient[] {
  const blocks = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]+/g, ' ').split(/\n\s*\n/)
  const out: DsnRecipient[] = []
  for (const block of blocks) {
    const fields = new Map<string, string>()
    for (const line of block.split('\n')) {
      const c = line.indexOf(':')
      if (c > 0) fields.set(line.slice(0, c).trim().toLowerCase(), line.slice(c + 1).trim())
    }
    const rcpt = fields.get('final-recipient') ?? fields.get('original-recipient')
    if (!rcpt) continue
    const addr = rcpt.includes(';') ? rcpt.slice(rcpt.indexOf(';') + 1).trim() : rcpt
    out.push({ recipient: addr.replace(/^<|>$/g, ''), action: (fields.get('action') ?? '').toLowerCase(), status: (fields.get('status') ?? '').split(/\s/)[0] ?? '' })
  }
  return out
}

export const isHardBounce = (r: DsnRecipient): boolean => r.action === 'failed' && /^5\.\d{1,3}\.\d{1,3}$/.test(r.status) && !r.status.startsWith('5.7.')
