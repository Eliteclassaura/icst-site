/**
 * 1.3a-C4: the RFQ inbox shows a one-line preview of the customer's request under the company and contact, and the reply-due chip is
 * graded by office hours left (green above 8 h, amber at 8 h or fewer, red when overdue) with words and icons, not colour alone.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PREVIEW_MAX, requestPreview } from '../workspace/preview'
import { replyDue, replyDueLabel } from '../workspace/replyDue'
import { RfqTable } from '../workspace/ui/RfqTable'
import { ReplyChip } from '../workspace/ui/Facets'
import type { RfqRow } from '../workspace/queries'
import type { BusinessCalendar } from '../workspace/time'

describe('requestPreview', () => {
  it('is the request as one plain line: whitespace and line breaks collapse, control and zero-width characters go', () => {
    expect(requestPreview('  We need\r\n two  gearboxes\t for cell 3.\n\n')).toBe('We need two gearboxes for cell 3.')
    expect(requestPreview('a\u0000b\u200bc\u0007d\u2060e\ufeff')).toBe('abcde')
  })
  it('is cut at 120 characters with an ellipsis, never splitting a character; shorter text is untouched', () => {
    expect(PREVIEW_MAX).toBe(120)
    const exact = 'x'.repeat(120)
    expect(requestPreview(exact)).toBe(exact)
    const cut = requestPreview('y'.repeat(121))!
    expect(cut).toBe(`${'y'.repeat(120)}…`)
    // an emoji (two UTF-16 units) across the boundary is kept whole or dropped, never half
    const emoji = requestPreview(`${'z'.repeat(119)}😀tail`)!
    expect(emoji).toBe(`${'z'.repeat(119)}😀…`)
    expect(Array.from(emoji).length).toBe(121)
    // a space at the cut does not leave "word …": the text is cut, trimmed, then the ellipsis added
    expect(requestPreview(`${'a'.repeat(119)} b`)).toBe(`${'a'.repeat(119)}…`)
    expect(requestPreview(`${'a'.repeat(119)}  ${'b'.repeat(10)}`)).toBe(`${'a'.repeat(119)}…`)
  })
  it('is null when there is nothing to show (missing, blank, not a string)', () => {
    for (const v of [undefined, null, '', '   \n\t', 42, {}, ['x']]) expect(requestPreview(v)).toBeNull()
  })
  it('keeps markup as text (the page escapes it); it is never parsed here', () => {
    expect(requestPreview('<img src=x onerror=alert(1)> & "quotes"')).toBe('<img src=x onerror=alert(1)> & "quotes"')
  })
})

const US: BusinessCalendar = { zone: 'America/Denver', holidays: new Set() }
const at = (iso: string) => new Date(iso)
const row = (over: Partial<RfqRow> = {}): RfqRow => ({
  id: '0b6a2d7e-9f1c-4a3b-8d2e-7c5f4e3d2c1b',
  rfqNumber: 'RFQ-SYN-0001',
  receivedAt: '2026-10-06T14:00:00.000Z',
  status: 'NEW',
  company: 'Synthetic Plant Ltd',
  companyLinked: true,
  contactName: 'Avery Example',
  interest: 'Gearbox',
  interestOrigin: 'CUSTOMER',
  ownerId: null,
  ownerName: null,
  nextAction: null,
  reply: replyDue({ status: 'OPEN', dueAt: at('2026-10-07T23:00:00Z') }, at('2026-10-06T14:30:00Z'), US),
  flags: { urgent: false, review: false, doNotContact: false },
  aged: false,
  sourceSystem: 'NATIVE_FORM',
  updatedAt: '2026-10-06T14:00:00.000Z',
  countryCode: 'US',
  office: 'US',
  countrySource: 'CUSTOMER',
  type: 'PARTS',
  typeSource: 'CUSTOMER',
  motion: null,
  accountId: null,
  contactId: null,
  opportunityId: null,
  preview: null,
  ...over,
})
const table = (rows: RfqRow[], compact = false) =>
  renderToStaticMarkup(<RfqTable rows={rows} now={at('2026-10-06T14:30:00Z')} hrefFor={(r) => `/crm/rfqs/?rfq=${r.id}`} caption="Open inquiries" compact={compact} />)

describe('the inbox row', () => {
  it('shows the preview under the company and contact, as escaped text, with the full line as its title', () => {
    const html = table([row({ preview: 'Need <b>two</b> gearboxes & a "fan" for cell 3…' })])
    expect(html).toContain('<span class="c-preview" title="Need &lt;b&gt;two&lt;/b&gt; gearboxes &amp; a &quot;fan&quot; for cell 3…">Need &lt;b&gt;two&lt;/b&gt; gearboxes &amp; a &quot;fan&quot; for cell 3…</span>')
    expect(html).not.toContain('<b>two</b>')
    // it sits after the company/contact link, inside the same cell
    expect(html.indexOf('Avery Example')).toBeLessThan(html.indexOf('c-preview'))
    expect(html.slice(html.indexOf('class="two who"'), html.indexOf('</td>', html.indexOf('class="two who"')))).toContain('c-preview')
  })
  it('shows nothing extra when the customer wrote no request, and in the compact list beside an open record too', () => {
    expect(table([row({ preview: null })])).not.toContain('c-preview')
    expect(table([row({ preview: undefined })])).not.toContain('c-preview')
    expect(table([row({ preview: 'A short request' })], true)).toContain('A short request')
  })
})

describe('the reply-due chip: words and icons, three grades', () => {
  const chip = (reply: RfqRow['reply'], now: Date) => renderToStaticMarkup(<ReplyChip reply={reply} now={now} />)
  const due = at('2026-10-07T23:00:00Z') // Wed 17:00 MDT
  it('green above 8 office hours left: "On time", the hours, a clock', () => {
    const now = at('2026-10-06T17:00:00Z') // Tue 11:00: 6 h Tue + 8 h Wed = 14 h
    const r = replyDue({ status: 'OPEN', dueAt: due }, now, US)
    expect(r.tone).toBe('ok')
    const html = chip(r, now)
    expect(html).toContain('c-due is-ok')
    expect(html).toContain('On time: ')
    expect(html).toContain(`<span>${replyDueLabel(r, now)}</span>`)
    expect(replyDueLabel(r, now)).toBe('14 h left')
    expect(html).toContain('<svg')
  })
  it('amber at 8 office hours or fewer: "Due soon" and the hours left, a different icon from green', () => {
    const now = at('2026-10-07T15:00:00Z') // Wed 09:00: exactly 8 h
    const r = replyDue({ status: 'OPEN', dueAt: due }, now, US)
    expect(r.tone).toBe('soon')
    const html = chip(r, now)
    expect(html).toContain('c-due is-soon')
    expect(html).toContain('Due soon: ')
    expect(html).toContain('<span>8 h left</span>')
    const green = chip(replyDue({ status: 'OPEN', dueAt: due }, at('2026-10-06T17:00:00Z'), US), at('2026-10-06T17:00:00Z'))
    const svg = (h: string) => /<svg[\s\S]*?<\/svg>/.exec(h)![0]
    expect(svg(html)).not.toBe(svg(green))
  })
  it('red when overdue: the word Overdue and how late, a third icon', () => {
    const now = at('2026-10-08T01:00:00Z') // Wed 19:00: 2 h after the due instant
    const r = replyDue({ status: 'OPEN', dueAt: due }, now, US)
    const html = chip(r, now)
    expect(html).toContain('c-due is-overdue')
    expect(html).toContain('<span>Overdue 2 h</span>')
    const soon = chip(replyDue({ status: 'OPEN', dueAt: due }, at('2026-10-07T15:00:00Z'), US), at('2026-10-07T15:00:00Z'))
    const svg = (h: string) => /<svg[\s\S]*?<\/svg>/.exec(h)![0]
    expect(svg(html)).not.toBe(svg(soon))
  })
})

describe('light and dark: the three chip grades have colour tokens in both themes', () => {
  const css = readFileSync(path.join(process.cwd(), 'src/crm/workspace/ui/crm.css'), 'utf8')
  it('each grade uses a tint and a text token, and each token is defined for the light and the dark theme', () => {
    for (const grade of ['ok', 'soon', 'overdue']) expect(css).toMatch(new RegExp(`\\.c-due\\.is-${grade} \\{[^}]*color: var\\(--c-(?:success|warning|error)-text\\)`))
    for (const token of ['--c-success-tint', '--c-success-text', '--c-warning-tint', '--c-warning-text', '--c-error-tint', '--c-error-text', '--c-text-2'])
      expect([...css.matchAll(new RegExp(`${token}:`, 'g'))].length, token).toBeGreaterThanOrEqual(2)
  })
  it('the preview line is one line, ellipsised, in the secondary text colour', () => {
    const block = /\.c-rfq-table td\.who \.c-preview \{([^}]*)\}/.exec(css)![1]!
    expect(block).toContain('white-space: nowrap')
    expect(block).toContain('text-overflow: ellipsis')
    expect(block).toContain('color: var(--c-text-2)')
  })
})
