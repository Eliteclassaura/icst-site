import { describe, expect, it } from 'vitest'
import { officeMsBetween, replyDue, replyDueLabel, REPLY_SOON_MS } from '../workspace/replyDue'
import { densityFrom, densityReturnPath } from '../workspace/prefs'
import { parseInboxParams, weekStart } from '../workspace/queries'
import { firstResponseDueAt, relativeAge, type BusinessCalendar } from '../workspace/time'
import { MERGE_FIELDS, renderTemplate, SEED_TEMPLATES, SUPERSEDED_SEED_HASHES, templateHash } from '../../email/templates'
import { renderSalesAlert } from '../../email/messages'
import { scopeHits, scopeRefusal } from '../../email/scope-guard'

/**
 * CRM polish R1: the reply-due countdown (office hours 09:00–17:00 on the office's business days), the inbox's
 * reply / this-week filters, the density preference and the relative-age wording.
 *
 * October 2026: Denver is MDT (UTC−6); Bangkok is ICT (UTC+7, no DST). Mon 2026-10-05 … Fri 2026-10-09.
 */
const US: BusinessCalendar = { zone: 'America/Denver', holidays: new Set() }
const TH: BusinessCalendar = { zone: 'Asia/Bangkok', holidays: new Set(['2026-10-13']) }
const H = 3600_000
const at = (iso: string) => new Date(iso)
const open = (dueAt: Date | null) => ({ status: 'OPEN', dueAt })

describe('office hours between two instants', () => {
  it('counts only 09:00–17:00 on business days', () => {
    // Mon 10:00 MDT → Mon 15:00 MDT = 5 h
    expect(officeMsBetween(at('2026-10-05T16:00:00Z'), at('2026-10-05T21:00:00Z'), US)).toBe(5 * H)
    // Mon 16:00 → Tue 10:00 = 1 h (Mon) + 1 h (Tue)
    expect(officeMsBetween(at('2026-10-05T22:00:00Z'), at('2026-10-06T16:00:00Z'), US)).toBe(2 * H)
    // Fri 18:00 → Mon 09:30: the weekend and the evening count nothing
    expect(officeMsBetween(at('2026-10-10T00:00:00Z'), at('2026-10-12T15:30:00Z'), US)).toBe(0.5 * H)
    // Nothing when the end is not after the start
    expect(officeMsBetween(at('2026-10-06T16:00:00Z'), at('2026-10-05T16:00:00Z'), US)).toBe(0)
  })
  it('skips the office holidays (TH)', () => {
    // Mon 2026-10-12 16:00 ICT → Wed 2026-10-14 10:00 ICT; Tue 13 is a holiday: 1 h + 1 h
    expect(officeMsBetween(at('2026-10-12T09:00:00Z'), at('2026-10-14T03:00:00Z'), TH)).toBe(2 * H)
  })
})

describe('reply due', () => {
  it('is green with more than 4 office hours left, amber at 4 or fewer, red when overdue', () => {
    const received = at('2026-10-05T16:00:00Z') // Mon 10:00 MDT → due Tue end
    const due = firstResponseDueAt(received, US)
    const ok = replyDue(open(due), at('2026-10-05T17:00:00Z'), US) // Mon 11:00: 6 h Mon + 8 h Tue
    expect(ok.tone).toBe('ok')
    expect(ok.officeMsLeft).toBe(14 * H)
    expect(replyDueLabel(ok, at('2026-10-05T17:00:00Z'))).toBe('14 h left')
    const soon = replyDue(open(due), at('2026-10-06T19:30:00Z'), US) // Tue 13:30: 3 h 30 min left
    expect(soon.tone).toBe('soon')
    expect(replyDueLabel(soon, at('2026-10-06T19:30:00Z'))).toBe('3 h 30 min left')
    const edge = replyDue(open(due), at('2026-10-06T19:00:00Z'), US) // Tue 13:00: exactly 4 h
    expect(edge.officeMsLeft).toBe(REPLY_SOON_MS)
    expect(edge.tone).toBe('soon')
    const late = replyDue(open(due), at('2026-10-07T08:00:00Z'), US) // Wed 02:00, 2 h after the due instant
    expect(late.tone).toBe('overdue')
    expect(replyDueLabel(late, at('2026-10-07T08:00:00Z'))).toBe('Overdue 2 h')
    expect(replyDueLabel(late, at('2026-10-09T08:00:00Z'))).toBe('Overdue 2 d')
    expect(replyDueLabel(late, at('2026-10-07T09:01:00Z'))).toBe('Overdue 3 h')
    expect(replyDueLabel(late, at('2026-10-07T06:40:00Z'))).toBe('Overdue 40 min')
  })
  it('after the office closes on the due day it reads "Due today" (amber), not overdue', () => {
    const due = firstResponseDueAt(at('2026-10-05T16:00:00Z'), US) // Tue end
    const r = replyDue(open(due), at('2026-10-07T01:00:00Z'), US) // Tue 19:00 MDT
    expect(r.tone).toBe('soon')
    expect(r.officeMsLeft).toBe(0)
    expect(replyDueLabel(r, at('2026-10-07T01:00:00Z'))).toBe('Due today')
  })
  it('a Friday evening inquiry stays green over the weekend', () => {
    const received = at('2026-10-10T00:30:00Z') // Fri 18:30 MDT → counts from Mon → due Tue end
    const due = firstResponseDueAt(received, US)
    const r = replyDue(open(due), at('2026-10-11T18:00:00Z'), US) // Sun noon
    expect(r.tone).toBe('ok')
    expect(r.officeMsLeft).toBe(16 * H)
  })
  it('done, cancelled and missing tasks', () => {
    const now = at('2026-10-06T16:00:00Z')
    const done = replyDue({ status: 'DONE', dueAt: at('2026-10-05T16:00:00Z') }, now, US)
    expect(done.tone).toBe('done')
    expect(replyDueLabel(done, now)).toBe('Replied')
    expect(replyDue({ status: 'CANCELLED', dueAt: null }, now, US).tone).toBe('none')
    const none = replyDue(null, now, US)
    expect(none.state).toBe('NONE')
    expect(replyDueLabel(none, now)).toBe('No reply due')
    expect(replyDue(open(null), now, US)).toMatchObject({ tone: 'ok', officeMsLeft: null })
  })
})

describe('inbox filters and preferences', () => {
  it('parses reply and received=week; drops unknown values', () => {
    expect(parseInboxParams({ reply: 'overdue', received: 'week' })).toMatchObject({ reply: 'overdue', received: 'week' })
    expect(parseInboxParams({ reply: 'today' }).reply).toBe('today')
    expect(parseInboxParams({ reply: 'soon', received: 'year' })).toMatchObject({ reply: null, received: null })
  })
  it('this week starts Monday 00:00 in the zone (a Sunday belongs to the week that started Monday)', () => {
    expect(weekStart(at('2026-10-08T18:00:00Z'), 'America/Denver').toISOString()).toBe('2026-10-05T06:00:00.000Z')
    expect(weekStart(at('2026-10-11T18:00:00Z'), 'America/Denver').toISOString()).toBe('2026-10-05T06:00:00.000Z')
    expect(weekStart(at('2026-10-05T06:00:00Z'), 'America/Denver').toISOString()).toBe('2026-10-05T06:00:00.000Z')
    expect(weekStart(at('2026-10-05T03:00:00Z'), 'Asia/Bangkok').toISOString()).toBe('2026-10-04T17:00:00.000Z')
  })
  it('density: compact or comfortable; the return path is a rebuilt inbox URL or My Work', () => {
    expect(densityFrom('compact')).toBe('compact')
    expect(densityFrom('dense')).toBe('comfortable')
    expect(densityFrom(undefined)).toBe('comfortable')
    expect(densityReturnPath('/crm/rfqs/?view=unassigned&reply=overdue&evil=https://x.example')).toBe('/crm/rfqs/?view=unassigned&reply=overdue')
    expect(densityReturnPath('https://evil.example/crm/rfqs/')).toBe('/crm/')
    expect(densityReturnPath('//evil.example/')).toBe('/crm/')
    expect(densityReturnPath(42)).toBe('/crm/')
  })
  it('relative age reads "2 h ago" with spaced units', () => {
    const now = at('2026-10-06T12:00:00Z')
    expect(relativeAge(at('2026-10-06T11:59:40Z'), now)).toBe('just now')
    expect(relativeAge(at('2026-10-06T11:55:00Z'), now)).toBe('5 min ago')
    expect(relativeAge(at('2026-10-06T10:00:00Z'), now)).toBe('2 h ago')
    expect(relativeAge(at('2026-10-03T12:00:00Z'), now)).toBe('3 d ago')
  })
})

/**
 * Owner rule 2026-10-06 (CT): no phone number and no postal address in any email — sequence steps, T1–T6 and alerts.
 * The signature is "ICS Sales Team" + the sales address; a missing phone or address never holds anything.
 */
describe('owner rule: no phone number, no postal address in any email', () => {
  const phoneLine = (text: string) => text.split('\n').filter((l) => /^\+?[\d ()-]{7,}$/.test(l.trim()) || /\bcall (me )?(at )?\+?\d/i.test(l))
  it('no seed template asks for a phone (the field is retired) or carries an address', () => {
    expect('office_phone' in MERGE_FIELDS).toBe(false)
    for (const t of SEED_TEMPLATES) {
      expect(t.body + t.subject, t.code).not.toMatch(/office_phone|\bcall (me )?(at )?\{\{/i)
      expect(t.body, t.code).not.toMatch(/Synthetic Way|Street|Road|Suite|P\.?O\.? Box/i)
    }
  })
  it('T2–T6 render with the team signature only; T1 keeps its approved wording (hash unchanged)', () => {
    const values = { rfq_number: 'RFQ-1', customer_first_name: 'Pat', company: 'Plant (synthetic)', email_signature: 'ICS Sales Team\nsales@example.test' }
    for (const code of ['T2', 'T3', 'T4', 'T6']) {
      const r = renderTemplate(SEED_TEMPLATES.find((t) => t.code === code)!, values, ['attached'])
      expect(r.ok, code).toBe(true)
      if (!r.ok) continue
      expect(r.text, code).toContain('Best regards,\nICS Sales Team\nsales@example.test')
      expect(phoneLine(r.text), code).toEqual([])
    }
    const t1 = SEED_TEMPLATES.find((t) => t.code === 'T1')!
    expect(templateHash(t1)).toBe('87124e4ace9603567b1dd2a380ef1fdb37889a2edfbee621a84d8c7c7472a897') // as owner-approved 2026-10-05
  })
  it('only an unedited earlier seed is superseded; the current seeds are not in the superseded list', () => {
    for (const t of SEED_TEMPLATES) expect(SUPERSEDED_SEED_HASHES[t.code] ?? [], t.code).not.toContain(templateHash(t))
    expect(Object.keys(SUPERSEDED_SEED_HASHES).sort()).toEqual(['T2', 'T3', 'T4', 'T5', 'T6'])
  })
  it('the internal sales alert carries no phone number or address', () => {
    const a = renderSalesAlert({ rfqNumber: 'RFQ-1', company: 'Plant (synthetic)', products: ['Fan blades'], pagePath: '/', ctaPlacement: 'launcher', crmUrl: 'http://localhost/crm/rfqs/x/' } as never)
    expect(phoneLine(a.text)).toEqual([])
    expect(a.text).not.toMatch(/Synthetic Way|Street|Suite|P\.?O\.? Box/i)
  })
})

/** T-R1 (owner, 2026-10-06): T2–T6 approved; every template stays industrial cooling (no HVAC / residential / small towers). */
describe('T-R1: approved T2–T6 and the industrial-scope guard', () => {
  it('every seed (T1–T6 and the E1.1 steps) is in scope', () => {
    for (const t of SEED_TEMPLATES) expect(scopeHits(t.subject, t.body), t.code).toEqual([])
  })
  it('flags each out-of-scope term (REVIEW), word-bounded and case-insensitive', () => {
    const cases: Array<[string, string]> = [
      ['We service HVAC systems.', 'SCOPE_HVAC'],
      ['hvac', 'SCOPE_HVAC'],
      ['Rooftop units and RTU replacements', 'SCOPE_ROOFTOP_UNIT'],
      ['roof-top unit', 'SCOPE_ROOFTOP_UNIT'],
      ['Residential customers welcome', 'SCOPE_RESIDENTIAL'],
      ['for your home', 'SCOPE_RESIDENTIAL'],
      ['Small cooling towers too', 'SCOPE_SMALL_TOWER'],
      ['smaller towers', 'SCOPE_SMALL_TOWER'],
      ['Packaged cooling tower', 'SCOPE_PACKAGED_TOWER'],
      ['air-conditioning', 'SCOPE_AIR_CONDITIONING'],
      ['Air conditioners and A/C', 'SCOPE_AIR_CONDITIONING'],
    ]
    for (const [text, rule] of cases) expect(scopeHits('', text).map((h) => h.rule_id), text).toContain(rule)
    expect(scopeHits('', 'HVAC').every((h) => h.severity === 'REVIEW')).toBe(true)
    // Word boundaries: no false positives on in-scope words.
    for (const ok of ['Visit our homepage', 'industrial cooling tower', 'thermal performance', 'conditions of the site', 'the start-up date', 'virtual tour'])
      expect(scopeHits('', ok), ok).toEqual([])
    expect(scopeRefusal('S', 'We do HVAC')).toMatch(/“HVAC”.*industrial cooling/)
    expect(scopeRefusal('S', 'Industrial cooling tower parts')).toBeNull()
  })
  it('T2–T6 are seeded approved; T6 closes with the industrial-scope line; the R1.1 T6 is superseded', () => {
    for (const code of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']) expect(SEED_TEMPLATES.find((t) => t.code === code)!.approved, code).toBe(true)
    const t6 = SEED_TEMPLATES.find((t) => t.code === 'T6')!
    expect(t6.body).toContain("We'd be glad to help with industrial cooling tower parts, maintenance and repairs, dry soda blasting or new towers in the future. Just reply to this email.")
    expect(SUPERSEDED_SEED_HASHES.T6).toContain('75b7e9c3f8ea90a4f723405cb111c48fe1ad96f0ce772c779b9d540ed7499e72')
  })
})
