import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * STEP-UP-1.1 (Auditor): the relaxed reply-handling setting never governs unsubscribe or suppression. Reply mode only
 * holds reply-dependent FOLLOW-UP emails (ers/reply-mode.ts, read by the engine's send rules); the code that records an
 * unsubscribe, the suppression ledger and the exit-for-address stop do not read it. A source guard pins that, so a later
 * change that makes them depend on it fails here.
 */
const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const USES = /reply_mode|replyMode|reply-mode|setReplyMode|MANUAL_CHECK/

describe('reply mode and the suppression floor are separate', () => {
  it('unsubscribe, suppression and the one-click route never read the reply mode', () => {
    for (const f of ['crm/ers/unsubscribe.ts', 'crm/suppression.ts', 'app/(intake)/api/ers/unsubscribe/route.ts']) expect(USES.test(read(f)), f).toBe(false)
  })
  it('the engine stops live enrollments for an address (exitForAddress) without consulting it', () => {
    const src = read('crm/ers/engine.ts')
    const start = src.indexOf('export async function exitForAddress')
    expect(start).toBeGreaterThan(0)
    const body = src.slice(start, src.indexOf('\nexport ', start + 10) > 0 ? src.indexOf('\nexport ', start + 10) : undefined)
    expect(USES.test(body)).toBe(false)
  })
})
