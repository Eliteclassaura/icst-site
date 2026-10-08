/**
 * Business time for the Sales Workspace.
 *
 *   Monday–Friday in an office's time zone, minus that office's holidays (Patch L1, 2026-10-05). Offices and their
 *   zones are in `../offices.ts`; holidays are data (`crm-office-settings`, seeded from `../data/holidays.ts`).
 *
 * Every function takes the zone or the calendar explicitly. The defaults are the pre-L1 behaviour — America/Denver
 * with no holidays — so a caller that has no office context keeps working exactly as before.
 *
 * "Aging" is an internal operational indicator for unassigned inquiries. It is never presented as a
 * customer or contractual SLA: the words SLA, late and breach are not used anywhere in the workspace.
 */
export const BUSINESS_TIME_ZONE = 'America/Denver'

/** A business calendar: a time zone plus its holiday dates (yyyy-mm-dd, local to that zone). */
export type BusinessCalendar = { readonly zone: string; readonly holidays: ReadonlySet<string> }
export const DEFAULT_CALENDAR: BusinessCalendar = { zone: BUSINESS_TIME_ZONE, holidays: new Set() }

type Parts = { year: number; month: number; day: number; weekday: number }

const dtfCache = new Map<string, Intl.DateTimeFormat>()
const zoneDtf = (zone: string) => {
  let f = dtfCache.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    dtfCache.set(zone, f)
  }
  return f
}
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** True when `zone` is an IANA time zone this runtime knows. */
export function isTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || !zone) return false
  try {
    zoneDtf(zone)
    return true
  } catch {
    return false
  }
}

function partsInZone(d: Date, zone: string): Parts & { hour: number; minute: number; second: number } {
  const map: Record<string, string> = {}
  for (const p of zoneDtf(zone).formatToParts(d)) map[p.type] = p.value
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: WEEKDAYS[map.weekday ?? 'Mon'] ?? 1,
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  }
}

/** Offset (ms) of `zone` from UTC at instant `d` (handles DST). */
function zoneOffsetMs(d: Date, zone: string): number {
  const p = partsInZone(d, zone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(d.getTime() / 1000) * 1000
}

/** The UTC instant of local midnight (in `zone`) on the calendar day containing `d`. */
export function startOfBusinessDay(d: Date, zone: string = BUSINESS_TIME_ZONE): Date {
  const p = partsInZone(d, zone)
  const guess = new Date(Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0))
  // Two passes settle the offset across a DST boundary.
  let t = guess.getTime() - zoneOffsetMs(guess, zone)
  t = guess.getTime() - zoneOffsetMs(new Date(t), zone)
  return new Date(t)
}

/** The UTC instant just before local midnight ending the calendar day containing `d`. */
export function endOfBusinessDay(d: Date, zone: string = BUSINESS_TIME_ZONE): Date {
  const start = startOfBusinessDay(d, zone)
  const nextStart = startOfBusinessDay(new Date(start.getTime() + 36 * 3600 * 1000), zone)
  return new Date(nextStart.getTime() - 1)
}

/**
 * The last instant of local calendar date `ymd` (yyyy-mm-dd) in `zone`. Noon UTC of that date is the same local
 * calendar date in every zone from UTC−11 to UTC+11, which covers every office and every user zone offered.
 */
export function endOfLocalDate(ymd: string, zone: string = BUSINESS_TIME_ZONE): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return null
  const noon = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
  if (Number.isNaN(noon.getTime()) || businessDate(noon, zone) !== ymd) return null
  return endOfBusinessDay(noon, zone)
}

/** The calendar date (yyyy-mm-dd) in `zone` of instant `d`. */
export function businessDate(d: Date, zone: string = BUSINESS_TIME_ZONE): string {
  const p = partsInZone(d, zone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Monday–Friday in the calendar's zone, and not one of its holidays. */
export function isBusinessDay(d: Date, cal: BusinessCalendar = DEFAULT_CALENDAR): boolean {
  const w = partsInZone(d, cal.zone).weekday
  return w >= 1 && w <= 5 && !cal.holidays.has(businessDate(d, cal.zone))
}

/**
 * Business milliseconds elapsed between `from` and `to`, counting only business days of `cal`.
 * Walks at most one step per calendar day, so it is bounded for any realistic inquiry age.
 */
export function businessMsBetween(from: Date, to: Date, cal: BusinessCalendar = DEFAULT_CALENDAR): number {
  if (!(to.getTime() > from.getTime())) return 0
  let total = 0
  let cursor = new Date(from.getTime())
  for (let guard = 0; guard < 4000 && cursor.getTime() < to.getTime(); guard++) {
    const dayEnd = endOfBusinessDay(cursor, cal.zone).getTime() + 1
    const segmentEnd = Math.min(dayEnd, to.getTime())
    if (isBusinessDay(cursor, cal)) total += segmentEnd - cursor.getTime()
    cursor = new Date(segmentEnd)
  }
  return total
}

export const BUSINESS_DAY_MS = 24 * 3600 * 1000

/**
 * D-1 (owner decision, Control Tower 2026-10-02; office-aware since Patch L1): the first-response task is due at the
 * **end of the next business day of the office handling the inquiry**.
 *
 *   - Business days are Monday–Friday in the office's zone, minus the office's holidays.
 *   - An arrival on a business day before `BUSINESS_DAY_CLOSE_HOUR` (17:00 office time) counts from that day; an
 *     arrival at or after it, or on a weekend or holiday, counts from the next business day.
 *   - The due instant is the end of the business day after the day the arrival counts from (the last
 *     millisecond before local midnight, the same "end of day" the Due-today views use), DST-correct.
 *
 *   Mon 10:00 → Tue end · Mon 18:00 → Wed end · Fri 10:00 → Mon end · Fri 18:00 → Tue end · Sat/Sun → Tue end.
 */
export const BUSINESS_DAY_CLOSE_HOUR = 17

/** Local midnight starting the first business day strictly after the day of `d`. */
export function nextBusinessDayStart(d: Date, cal: BusinessCalendar = DEFAULT_CALENDAR): Date {
  let cursor = startOfBusinessDay(d, cal.zone)
  // 40 days: more than any run of weekends plus holidays (Songkran plus a weekend is the longest seeded run).
  for (let guard = 0; guard < 40; guard++) {
    cursor = startOfBusinessDay(new Date(cursor.getTime() + 36 * 3600 * 1000), cal.zone)
    if (isBusinessDay(cursor, cal)) return cursor
  }
  return cursor
}

/** The business day an arrival counts from (local midnight of that day). */
export function countsFromBusinessDay(receivedAt: Date, cal: BusinessCalendar = DEFAULT_CALENDAR): Date {
  const p = partsInZone(receivedAt, cal.zone)
  return isBusinessDay(receivedAt, cal) && p.hour < BUSINESS_DAY_CLOSE_HOUR
    ? startOfBusinessDay(receivedAt, cal.zone)
    : nextBusinessDayStart(receivedAt, cal)
}

/** D-1: when the first-response task for an inquiry received at `receivedAt` is due. */
export function firstResponseDueAt(receivedAt: Date, cal: BusinessCalendar = DEFAULT_CALENDAR): Date {
  return endOfBusinessDay(nextBusinessDayStart(countsFromBusinessDay(receivedAt, cal), cal), cal.zone)
}

/** Local midnight starting the Monday after the week containing `d` (Sat/Sun count as "this week"). */
export function nextWeekStart(d: Date, zone: string = BUSINESS_TIME_ZONE): Date {
  let cursor = startOfBusinessDay(d, zone)
  for (let guard = 0; guard < 8; guard++) {
    cursor = startOfBusinessDay(new Date(cursor.getTime() + 36 * 3600 * 1000), zone)
    if (partsInZone(cursor, zone).weekday === 1) return cursor
  }
  return cursor
}

/**
 * Wave 1 W1-9 quick due dates, as calendar dates in the user's business calendar. "Tomorrow" is the next business
 * day (a Friday's tomorrow is Monday; a holiday is skipped) and "Next week" is the following Monday. Computed on the
 * server so a browser in another time zone offers the same days.
 */
export const QUICK_DUE = ['today', 'tomorrow', 'next_week'] as const
export type QuickDue = (typeof QUICK_DUE)[number]
export function quickDueDates(now: Date, cal: BusinessCalendar = DEFAULT_CALENDAR): Record<QuickDue, string> {
  return {
    today: businessDate(now, cal.zone),
    tomorrow: businessDate(nextBusinessDayStart(now, cal), cal.zone),
    next_week: businessDate(nextWeekStart(now, cal.zone), cal.zone),
  }
}

/** Unassigned for more than one business day (the internal aging indicator), on the handling office's calendar. */
export const isAgedUnassigned = (receivedAt: Date, now: Date, cal: BusinessCalendar = DEFAULT_CALENDAR): boolean =>
  businessMsBetween(receivedAt, now, cal) > BUSINESS_DAY_MS

/** "Received 2 d ago" style (Polish R1: spaced units, "2 h ago") relative age in calendar terms, for display only. */
export function relativeAge(from: Date, now: Date): string {
  const ms = now.getTime() - from.getTime()
  if (!(ms > 0)) return 'just now'
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.floor(h / 24)} d ago`
}

type DisplayFormats = { time: Intl.DateTimeFormat; dayTime: Intl.DateTimeFormat; date: Intl.DateTimeFormat; full: Intl.DateTimeFormat; year: Intl.DateTimeFormat }
const displayCache = new Map<string, DisplayFormats>()
function display(zone: string): DisplayFormats {
  let f = displayCache.get(zone)
  if (!f) {
    f = {
      time: new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
      dayTime: new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
      date: new Intl.DateTimeFormat('en-US', { timeZone: zone, day: 'numeric', month: 'short' }),
      full: new Intl.DateTimeFormat('en-US', { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' }),
      year: new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric' }),
    }
    displayCache.set(zone, f)
  }
  return f
}

/** Short zone labels people in the offices use; any other zone shows its IANA name. */
const ZONE_LABEL: Record<string, string> = { 'America/Denver': 'MT', 'Asia/Bangkok': 'ICT', UTC: 'UTC' }
export const zoneLabel = (zone: string): string => ZONE_LABEL[zone] ?? zone

/** Compact list time: "14:32" today, "Tue 14:32" this week, "27 Sep" otherwise — in the viewer's zone. */
export function compactTime(d: Date, now: Date, zone: string = BUSINESS_TIME_ZONE): string {
  const f = display(zone)
  const startToday = startOfBusinessDay(now, zone).getTime()
  if (d.getTime() >= startToday && d.getTime() <= endOfBusinessDay(now, zone).getTime()) return f.time.format(d)
  if (d.getTime() >= startToday - 6 * BUSINESS_DAY_MS && d.getTime() < startToday) return f.dayTime.format(d)
  return f.date.format(d)
}

/**
 * "Last activity" in lists (CT UX note, 2026-10-05): a bare time is ambiguous, so today reads "Today 07:44"; earlier
 * this week "Tue 14:32"; older "3 Oct".
 */
export function activityTime(d: Date, now: Date, zone: string = BUSINESS_TIME_ZONE): string {
  const t = compactTime(d, now, zone)
  return /^\d{2}:\d{2}$/.test(t) ? `Today ${t}` : t
}

/** "Oct 3": a short calendar date in the given zone. */
export function shortDate(d: Date, zone: string = BUSINESS_TIME_ZONE, now: Date = new Date()): string {
  const f = display(zone)
  return f.year.format(d) === f.year.format(now) ? display(zone).date.format(d) : yearDate(zone).format(d)
}

const yearDates = new Map<string, Intl.DateTimeFormat>()
/** "Dec 1, 2027": the same short date with its year, for a date outside the current year (so next year is not read as past). */
const yearDate = (zone: string): Intl.DateTimeFormat => {
  let f = yearDates.get(zone)
  if (!f) yearDates.set(zone, (f = new Intl.DateTimeFormat('en-US', { timeZone: zone, day: 'numeric', month: 'short', year: 'numeric' })))
  return f
}

/**
 * "Dec 1" for a stored calendar date ("2026-12-01") in the current year, "Dec 1, 2027" in any other, so a date next
 * year is never read as a date already past. Anything that is not a calendar date comes back unchanged.
 */
export function shortCalendarDate(iso: string, now: Date = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  const thisYear = Number(display('UTC').year.format(now))
  return Number(m[1]) === thisYear ? display('UTC').date.format(date) : yearDate('UTC').format(date)
}

/** Absolute time with zone, for tooltips and detail headers. */
export const absoluteTime = (d: Date, zone: string = BUSINESS_TIME_ZONE): string => `${display(zone).full.format(d)} ${zoneLabel(zone)}`

/** Parse an ISO string defensively; `null` for anything that is not a valid date. */
export function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null
  const d = new Date(value as string)
  return Number.isNaN(d.getTime()) ? null : d
}
