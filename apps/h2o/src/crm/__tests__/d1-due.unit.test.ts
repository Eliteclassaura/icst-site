import { describe, expect, it } from 'vitest'
import { BUSINESS_DAY_CLOSE_HOUR, BUSINESS_TIME_ZONE, countsFromBusinessDay, firstResponseDueAt } from '../workspace/time'

/**
 * D-1 (owner decision, Control Tower 2026-10-02): the first-response task is due at the END OF THE NEXT DENVER
 * BUSINESS DAY. America/Denver, Monday–Friday; a weekend or after-hours (≥ 17:00) arrival counts from the next
 * business day; no holiday calendar.
 *
 * Instants are written in UTC with the Denver wall clock beside them. October 2026 is MDT (UTC−6); US DST ends
 * Sunday 2026-11-01 02:00 (→ MST, UTC−7) and starts Sunday 2026-03-08 02:00 (→ MDT).
 */
const due = (iso: string) => firstResponseDueAt(new Date(iso)).toISOString()
// End of a Denver calendar day = 23:59:59.999 local.
const endMDT = (ymd: string) => new Date(`${ymd}T23:59:59.999-06:00`).toISOString()
const endMST = (ymd: string) => new Date(`${ymd}T23:59:59.999-07:00`).toISOString()
const local = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

describe('D-1 weekdays', () => {
  it('a weekday arrival during the day is due at the end of the next business day', () => {
    expect(due('2026-10-05T16:00:00Z')).toBe(endMDT('2026-10-06')) // Mon 10:00 → Tue end
    expect(due('2026-10-06T14:00:00Z')).toBe(endMDT('2026-10-07')) // Tue 08:00 → Wed end
    expect(due('2026-10-08T21:30:00Z')).toBe(endMDT('2026-10-09')) // Thu 15:30 → Fri end
  })
  it('an early-morning arrival (before opening) counts from that same day', () => {
    expect(due('2026-10-06T08:00:00Z')).toBe(endMDT('2026-10-07')) // Tue 02:00 → Wed end
    expect(due('2026-10-06T06:00:00Z')).toBe(endMDT('2026-10-07')) // Tue 00:00 exactly → Wed end
  })
})

describe('D-1 Friday to Monday', () => {
  it('a Friday daytime arrival is due at the end of Monday', () => {
    expect(due('2026-10-09T16:00:00Z')).toBe(endMDT('2026-10-12')) // Fri 10:00 → Mon end
    expect(due('2026-10-09T22:59:59Z')).toBe(endMDT('2026-10-12')) // Fri 16:59:59 → Mon end
  })
  it('a Friday after-hours arrival counts from Monday and is due at the end of Tuesday', () => {
    expect(due('2026-10-09T23:00:00Z')).toBe(endMDT('2026-10-13')) // Fri 17:00 → Tue end
    expect(due('2026-10-10T05:59:00Z')).toBe(endMDT('2026-10-13')) // Fri 23:59 → Tue end
  })
})

describe('D-1 weekend', () => {
  it('Saturday and Sunday arrivals count from Monday and are due at the end of Tuesday', () => {
    expect(due('2026-10-10T06:00:00Z')).toBe(endMDT('2026-10-13')) // Sat 00:00 → Tue end
    expect(due('2026-10-10T18:00:00Z')).toBe(endMDT('2026-10-13')) // Sat 12:00 → Tue end
    expect(due('2026-10-12T05:59:59Z')).toBe(endMDT('2026-10-13')) // Sun 23:59:59 → Tue end
  })
  it('Monday 00:00 is a Monday arrival (due Tuesday end), not a weekend one', () => {
    expect(due('2026-10-12T06:00:00Z')).toBe(endMDT('2026-10-13'))
  })
})

describe('D-1 after hours', () => {
  it(`the cut-off is ${BUSINESS_DAY_CLOSE_HOUR}:00 Denver: 16:59:59 counts today, 17:00:00 counts tomorrow`, () => {
    expect(BUSINESS_DAY_CLOSE_HOUR).toBe(17)
    expect(due('2026-10-05T22:59:59Z')).toBe(endMDT('2026-10-06')) // Mon 16:59:59 → Tue end
    expect(due('2026-10-05T23:00:00Z')).toBe(endMDT('2026-10-07')) // Mon 17:00:00 → Wed end
    expect(due('2026-10-06T05:30:00Z')).toBe(endMDT('2026-10-07')) // Mon 23:30 → Wed end
  })
  it('Thursday after hours counts from Friday and is due at the end of Monday', () => {
    expect(due('2026-10-09T01:00:00Z')).toBe(endMDT('2026-10-12')) // Thu 19:00 → Mon end
  })
})

describe('D-1 DST boundaries (America/Denver)', () => {
  it('autumn: due days after the 2026-11-01 change end at 23:59:59.999 MST', () => {
    expect(due('2026-10-30T16:00:00Z')).toBe(endMST('2026-11-02')) // Fri 10:00 MDT → Mon end MST
    expect(due('2026-10-31T18:00:00Z')).toBe(endMST('2026-11-03')) // Sat → Tue end MST
    expect(due('2026-11-01T08:30:00Z')).toBe(endMST('2026-11-03')) // Sun 01:30 MST (repeated hour) → Tue end
    expect(due('2026-11-03T00:00:00Z')).toBe(endMST('2026-11-04')) // Mon 17:00 MST → Wed end
    expect(due('2026-11-02T23:59:59Z')).toBe(endMST('2026-11-03')) // Mon 16:59:59 MST → Tue end
  })
  it('spring: due days after the 2026-03-08 change end at 23:59:59.999 MDT', () => {
    expect(due('2026-03-06T17:00:00Z')).toBe(endMDT('2026-03-09')) // Fri 10:00 MST → Mon end MDT
    expect(due('2026-03-08T09:30:00Z')).toBe(endMDT('2026-03-10')) // Sun 03:30 MDT (after the gap) → Tue end
    expect(due('2026-03-07T00:30:00Z')).toBe(endMDT('2026-03-10')) // Fri 17:30 MST → Tue end MDT
  })
})

describe('D-1 invariants over a full year (every hour of 2026–2027)', () => {
  it('always ends a Mon–Fri Denver day at 23:59:59, after the arrival, 1–5 calendar days later', () => {
    const start = Date.UTC(2026, 0, 1)
    for (let t = start; t < start + 400 * 24 * 3600 * 1000; t += 3600 * 1000 + 7 * 60 * 1000) {
      const received = new Date(t)
      const d = firstResponseDueAt(received)
      const parts = Object.fromEntries(local.formatToParts(d).map((p) => [p.type, p.value]))
      expect(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], received.toISOString()).toContain(parts.weekday)
      expect(`${parts.hour}:${parts.minute}:${parts.second}`, received.toISOString()).toBe('23:59:59')
      expect(d.getTime()).toBeGreaterThan(received.getTime())
      const days = (d.getTime() - received.getTime()) / (24 * 3600 * 1000)
      expect(days, received.toISOString()).toBeGreaterThan(1 / 24)
      expect(days, received.toISOString()).toBeLessThanOrEqual(5)
      // The arrival counts from the day it arrived (weekday before 17:00) or a later business day.
      expect(countsFromBusinessDay(received).getTime()).toBeLessThan(d.getTime())
    }
  })
  it('no holiday calendar (known limitation): a US holiday counts as a business day', () => {
    // Thanksgiving, Thu 2026-11-26: a Wednesday daytime arrival is due at the end of Thanksgiving.
    expect(due('2026-11-25T17:00:00Z')).toBe(endMST('2026-11-26'))
  })
})
