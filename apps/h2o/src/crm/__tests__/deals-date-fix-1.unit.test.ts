import { describe, expect, it } from 'vitest'
import { officeCalendar, EMPTY_OFFICE_SETTINGS, type OfficeSettings } from '../offices'
import { quickDueDates, type BusinessCalendar } from '../workspace/time'

/**
 * DATE-FIX-1: the quick controls on a deal form (Today, Next business day, Next week) are read in the deal's office
 * calendar. Frozen instants; both directions; weekend; differing holidays; DST. The same function the dialogs call.
 */
const settings = (us: string[] = [], th: string[] = []): OfficeSettings => ({ ...EMPTY_OFFICE_SETTINGS, holidays: { US: new Set(us), TH: new Set(th) } })
// ICST: the stored US slot is unused here (it takes the client's own zone), so the "Denver" calendar is built explicitly: the quick-date logic is
// generic over any calendar, and this keeps both directions (an office west of the date line and one east of it) under test.
const DEN = (s = settings()): BusinessCalendar => ({ zone: 'America/Denver', holidays: s.holidays.US })
const BKK = (s = settings()) => officeCalendar('TH', s)

describe('quick dates in the office calendar', () => {
  const NOW = new Date('2026-10-08T17:30:00Z') // Denver Thu Oct 8 11:30; Bangkok Fri Oct 9 00:30
  it('Today and Next business day, both directions', () => {
    expect(quickDueDates(NOW, DEN())).toMatchObject({ today: '2026-10-08', tomorrow: '2026-10-09' })
    expect(quickDueDates(NOW, BKK())).toMatchObject({ today: '2026-10-09', tomorrow: '2026-10-12' })
  })
  it('Next week is the following Monday of that office', () => {
    expect(quickDueDates(NOW, DEN()).next_week).toBe('2026-10-12')
    expect(quickDueDates(NOW, BKK()).next_week).toBe('2026-10-12')
    // Sunday evening in Denver is already Monday in Bangkok: the two offices disagree about which Monday is "next".
    const sunNight = new Date('2026-10-11T18:00:00Z') // Denver Sun 12:00; Bangkok Mon Oct 12 01:00
    expect(quickDueDates(sunNight, DEN())).toMatchObject({ today: '2026-10-11', tomorrow: '2026-10-12', next_week: '2026-10-12' })
    expect(quickDueDates(sunNight, BKK())).toMatchObject({ today: '2026-10-12', tomorrow: '2026-10-13', next_week: '2026-10-19' })
  })
  it('Friday goes to Monday across the weekend, in each office', () => {
    const fri = new Date('2026-10-09T17:30:00Z') // Denver Fri; Bangkok Sat Oct 10 00:30
    expect(quickDueDates(fri, DEN()).tomorrow).toBe('2026-10-12')
    expect(quickDueDates(fri, BKK())).toMatchObject({ today: '2026-10-10', tomorrow: '2026-10-12' })
  })
  it('each office skips only its own holidays', () => {
    const s = settings(['2026-10-09'], ['2026-10-12'])
    expect(quickDueDates(NOW, DEN(s)).tomorrow).toBe('2026-10-12') // Friday is a US holiday
    expect(quickDueDates(NOW, BKK(s)).tomorrow).toBe('2026-10-13') // Monday is a TH holiday
    expect(quickDueDates(NOW, DEN(settings([], ['2026-10-09']))).tomorrow).toBe('2026-10-09') // a TH holiday does not touch Denver
  })
  it('DST: the day is still the calendar day in the office zone across a clock change', () => {
    // US clocks go back Sun 2026-11-01; Fri Oct 30 evening Denver is Sat Oct 31 in Bangkok.
    const fri = new Date('2026-10-31T01:30:00Z') // Denver Fri Oct 30 19:30 MDT
    expect(quickDueDates(fri, DEN()).tomorrow).toBe('2026-11-02')
    expect(quickDueDates(fri, BKK())).toMatchObject({ today: '2026-10-31', tomorrow: '2026-11-02' })
    // Sun 2026-11-01 05:30Z is Sat 23:30 MDT / Sun 12:30 Bangkok, just before the change.
    const before = new Date('2026-11-01T05:30:00Z')
    expect(quickDueDates(before, DEN())).toMatchObject({ today: '2026-10-31', tomorrow: '2026-11-02' })
    // After the change (Sun 07:30Z = Sun 00:30 MST) Denver's today is Nov 1.
    expect(quickDueDates(new Date('2026-11-01T07:30:00Z'), DEN()).today).toBe('2026-11-01')
  })
})
