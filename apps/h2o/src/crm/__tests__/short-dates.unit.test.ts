import { describe, expect, it } from 'vitest'
import { shortCalendarDate, shortDate } from '../workspace/time'

const NOW = new Date('2026-10-08T12:00:00Z')

describe('short dates (DD S2, S3)', () => {
  it('shows a stored calendar date in the current year as "Dec 1", never ISO', () => {
    expect(shortCalendarDate('2026-12-01', NOW)).toBe('Dec 1')
    expect(shortCalendarDate('2026-01-05', NOW)).toBe('Jan 5')
  })

  it('shows the year when the date is not in the current year, so next year is not read as past', () => {
    expect(shortCalendarDate('2027-01-05', NOW)).toBe('Jan 5, 2027')
    expect(shortCalendarDate('2027-12-01', NOW)).toBe('Dec 1, 2027')
    expect(shortCalendarDate('2025-12-01', NOW)).toBe('Dec 1, 2025')
  })

  it('follows the year as time passes', () => {
    expect(shortCalendarDate('2027-01-05', new Date('2027-01-02T12:00:00Z'))).toBe('Jan 5')
    expect(shortCalendarDate('2026-12-01', new Date('2027-01-02T12:00:00Z'))).toBe('Dec 1, 2026')
  })

  it('does not shift a calendar date by the viewer or the zone', () => {
    expect(shortCalendarDate('2026-11-01', NOW)).toBe('Nov 1')
    expect(shortCalendarDate('2027-03-14', new Date('2027-03-01T00:00:00Z'))).toBe('Mar 14')
  })

  it('leaves anything that is not a calendar date unchanged', () => {
    expect(shortCalendarDate('soon')).toBe('soon')
    expect(shortCalendarDate('2026-12-01T10:00:00Z')).toBe('2026-12-01T10:00:00Z')
  })

  it('shows an instant as a short date in the given zone', () => {
    const d = new Date('2026-10-03T23:30:00Z')
    expect(shortDate(d, 'America/Denver', NOW)).toBe('Oct 3')
    expect(shortDate(d, 'Asia/Bangkok', NOW)).toBe('Oct 4')
  })

  it('an instant outside the current year shows its year, judged in the given zone', () => {
    expect(shortDate(new Date('2025-12-30T12:00:00Z'), 'America/Denver', NOW)).toBe('Dec 30, 2025')
    // 2026-12-31 23:30 UTC is already 2027 in Bangkok, still 2026 in Denver.
    const edge = new Date('2026-12-31T23:30:00Z')
    expect(shortDate(edge, 'Asia/Bangkok', NOW)).toBe('Jan 1, 2027')
    expect(shortDate(edge, 'America/Denver', NOW)).toBe('Dec 31')
  })
})
