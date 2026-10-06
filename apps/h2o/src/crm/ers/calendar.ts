import { businessDate, isBusinessDay, nextBusinessDayStart, startOfBusinessDay, type BusinessCalendar } from '../workspace/time'

/**
 * Revenue Engine slice 1: business-day arithmetic for sequences, on the office calendar of the enrollment's RFQ
 * (Patch L1: US Denver / TH Bangkok, office holidays). Pure.
 *
 *   - WAIT N business days ends at the sending window's opening hour of the Nth business day after today.
 *   - The sending window is Monday–Friday (holidays excluded), [startHour, endHour) office-local time.
 */
const hourIn = (d: Date, zone: string): number =>
  Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' }).format(d))

/** `hour` o'clock on the local day that starts at `dayStart` (DST-safe: measured from local midnight). */
export function atHour(dayStart: Date, hour: number, zone: string): Date {
  let t = new Date(dayStart.getTime() + hour * 3600_000)
  // A DST change between midnight and `hour` shifts the wall clock by one hour; correct it once.
  const got = hourIn(t, zone)
  if (got !== hour % 24) t = new Date(t.getTime() + (hour - got) * 3600_000)
  return t
}

export function afterBusinessDays(from: Date, n: number, cal: BusinessCalendar, startHour: number): Date {
  let cursor = from
  for (let i = 0; i < Math.max(0, n); i++) cursor = nextBusinessDayStart(cursor, cal)
  if (n <= 0) return from
  return atHour(startOfBusinessDay(cursor, cal.zone), startHour, cal.zone)
}

export const inWindow = (now: Date, cal: BusinessCalendar, startHour: number, endHour: number): boolean => {
  if (!isBusinessDay(now, cal)) return false
  const h = hourIn(now, cal.zone)
  return h >= startHour && h < endHour
}

/** The next moment the window is open: `now` if it is, else the next opening. */
export function nextWindowOpen(now: Date, cal: BusinessCalendar, startHour: number, endHour: number): Date {
  if (inWindow(now, cal, startHour, endHour)) return now
  if (isBusinessDay(now, cal) && hourIn(now, cal.zone) < startHour) return atHour(startOfBusinessDay(now, cal.zone), startHour, cal.zone)
  return atHour(nextBusinessDayStart(now, cal), startHour, cal.zone)
}

/** Whole business days from the local day of `from` up to (not including) the local day of `to`. */
export function businessDaysBetween(from: Date, to: Date, cal: BusinessCalendar): number {
  let n = 0
  let cursor = startOfBusinessDay(from, cal.zone)
  const end = businessDate(to, cal.zone)
  for (let guard = 0; guard < 4000 && businessDate(cursor, cal.zone) < end; guard++) {
    if (isBusinessDay(cursor, cal)) n++
    cursor = startOfBusinessDay(new Date(cursor.getTime() + 36 * 3600_000), cal.zone)
  }
  return n
}
