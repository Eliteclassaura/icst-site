import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** ERS-HUB-1: the Overview reads and never writes; neither it nor the controls can reach a mail transport. */
const read = (f: string) => readFileSync(new URL(`../ers/${f}`, import.meta.url), 'utf8')

describe('ERS hub modules', () => {
  it('hub.ts only reads: no create, update or delete call and no transport', () => {
    const src = read('hub.ts')
    expect(src).not.toMatch(/\.(create|update|delete|updateGlobal)\(/)
    expect(src).not.toMatch(/email\/transport|nodemailer|sendMail|outbox-worker/)
  })

  it('control.ts writes only enrollments, never the outbox or a transport', () => {
    const src = read('control.ts')
    expect(src).not.toMatch(/email\/transport|nodemailer|sendMail|outbox-worker|crm-email-outbox/)
    expect([...src.matchAll(/collection: '([a-z-]+)'/g)].map((m) => m[1]).every((c) => c === 'crm-enrollments')).toBe(true)
  })
})
