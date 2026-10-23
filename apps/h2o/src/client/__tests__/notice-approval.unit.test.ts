import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FORM_NOTICE_SHA256, PENDING_MARKER, assertApprovedForProduction, formNoticeStrings } from '../../rfq-native/registry'

/** Owner approval 23 Oct 2026 ("approved with defaults"): the quote-form notice and the cookie notice are approved; markers removed. */
const root = path.resolve(__dirname, '..', '..', '..', '..', '..', 'clients', 'icst')
const read = (p: string) => readFileSync(path.join(root, p), 'utf8')

describe('ICST notice and cookie approval (23 Oct 2026)', () => {
  it('the form notice carries no pending marker and its hash matches the registry pin', async () => {
    const { createHash } = await import('node:crypto')
    const md = read('content/rfq/form-notice-source.md')
    expect(md).not.toContain(PENDING_MARKER)
    expect(createHash('sha256').update(md).digest('hex')).toBe(FORM_NOTICE_SHA256)
    expect(() => formNoticeStrings(md)).not.toThrow()
    expect(read('content/rfq/icst-native-rfq-copy-r1.tsv')).not.toContain(PENDING_MARKER)
  })

  it('the production guard passes for the approved copy (and still refuses a pending one)', () => {
    const approved = read('content/rfq/icst-native-rfq-copy-r1.tsv')
    expect(() => assertApprovedForProduction(approved, read('content/rfq/form-notice-source.md'), { H2O_INDEXING_POLICY: 'production' } as NodeJS.ProcessEnv)).not.toThrow()
    expect(() => assertApprovedForProduction(`${approved}\n${PENDING_MARKER}`, '', { H2O_INDEXING_POLICY: 'production' } as NodeJS.ProcessEnv)).toThrow(/COPY_PENDING_APPROVAL/)
  })

  it('the cookie inventory is APPROVED with a review date, and /cookie-notice/ exists with its inventory block', () => {
    const inv = JSON.parse(read('cookies/inventory.json'))
    expect(inv.status).toBe('APPROVED')
    expect(inv.reviewedOn).toBe('2026-10-23')
    const page = JSON.parse(read('content/pages/cookie-notice.json'))
    expect(page.path).toBe('/cookie-notice/')
    expect(page.layout.some((b: { blockType: string }) => b.blockType === 'cookieInventory')).toBe(true)
    expect(existsSync(path.join(root, 'content', 'pages', 'cookie-notice.json'))).toBe(true)
  })
})
