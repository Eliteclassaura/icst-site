/**
 * Business time for the Sales Workspace (Control Tower frozen decision, CRM UI-1 R1.1):
 *
 *   one business day · America/Denver · Monday–Friday · no holiday calendar in UI-1.
 *
 * "Aging" is an internal operational indicator for unassigned inquiries. It is never presented as a
 * customer or contractual SLA: the words SLA, late and breach are not used anywhere in the workspace.
 */
export const BUSINESS_TIME_ZONE = 'America/Denver'

type Parts = { year: number; month: number; day: number; weekday: number }

const dtf = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function partsInZone(d: Date): Parts & { hour: number; minute: number; second: number } {
  const map: Record<string, string> = {}
  for (const p of dtf.formatToParts(d)) map[p.type] = p.value
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

/** Offset (ms) of the business zone from UTC at instant `d` (handles DST). */
function zoneOffsetMs(d: Date): number {
  const p = partsInZone(d)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(d.getTime() / 1000) * 1000
}

/** The UTC instant of local midnight (business zone) on the calendar day containing `d`. */
export function startOfBusinessDay(d: Date): Date {
  const p = partsInZone(d)
  const guess = new Date(Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0))
  // Two passes settle the offset across a DST boundary.
  let t = guess.getTime() - zoneOffsetMs(guess)
  t = guess.getTime() - zoneOffsetMs(new Date(t))
  return new Date(t)
}

/** The UTC instant just before local midnight ending the calendar day containing `d`. */
export function endOfBusinessDay(d: Date): Date {
  const start = startOfBusinessDay(d)
  const nextStart = startOfBusinessDay(new Date(start.getTime() + 36 * 3600 * 1000))
  return new Date(nextStart.getTime() - 1)
}

const isWeekday = (d: Date) => {
  const w = partsInZone(d).weekday
  return w >= 1 && w <= 5
}

/**
 * Business milliseconds elapsed between `from` and `to`, counting only Monday–Friday in the business zone.
 * Walks at most one step per calendar day, so it is bounded for any realistic inquiry age.
 */
export function businessMsBetween(from: Date, to: Date): number {
  if (!(to.getTime() > from.getTime())) return 0
  let total = 0
  let cursor = new Date(from.getTime())
  for (let guard = 0; guard < 4000 && cursor.getTime() < to.getTime(); guard++) {
    const dayEnd = endOfBusinessDay(cursor).getTime() + 1
    const segmentEnd = Math.min(dayEnd, to.getTime())
    if (isWeekday(cursor)) total += segmentEnd - cursor.getTime()
    cursor = new Date(segmentEnd)
  }
  return total
}

export const BUSINESS_DAY_MS = 24 * 3600 * 1000

/**
 * D-1 (owner decision, Control Tower 2026-10-02): the first-response task is due at the **end of the next Denver
 * business day**.
 *
 *   - Business days are Monday–Friday in America/Denver. **No holiday calendar** (known limitation): a holiday
 *     counts as a business day.
 *   - An arrival on a business day before `BUSINESS_DAY_CLOSE_HOUR` (17:00 Denver) counts from that day; an
 *     arrival at or after it, or on a Saturday/Sunday, counts from the next business day.
 *   - The due instant is the end of the business day after the day the arrival counts from (the last
 *     millisecond before local midnight, the same "end of day" the Due-today views use), DST-correct.
 *
 *   Mon 10:00 → Tue end · Mon 18:00 → Wed end · Fri 10:00 → Mon end · Fri 18:00 → Tue end · Sat/Sun → Tue end.
 */
export const BUSINESS_DAY_CLOSE_HOUR = 17

/** Local midnight (business zone) starting the first Monday–Friday calendar day strictly after the day of `d`. */
export function nextBusinessDayStart(d: Date): Date {
  let cursor = startOfBusinessDay(d)
  for (let guard = 0; guard < 8; guard++) {
    cursor = startOfBusinessDay(new Date(cursor.getTime() + 36 * 3600 * 1000))
    if (isWeekday(cursor)) return cursor
  }
  return cursor
}

/** The business day an arrival counts from (local midnight of that day). */
export function countsFromBusinessDay(receivedAt: Date): Date {
  const p = partsInZone(receivedAt)
  const weekday = p.weekday >= 1 && p.weekday <= 5
  return weekday && p.hour < BUSINESS_DAY_CLOSE_HOUR ? startOfBusinessDay(receivedAt) : nextBusinessDayStart(receivedAt)
}

/** D-1: when the first-response task for an inquiry received at `receivedAt` is due. */
export function firstResponseDueAt(receivedAt: Date): Date {
  return endOfBusinessDay(nextBusinessDayStart(countsFromBusinessDay(receivedAt)))
}

/** Unassigned for more than one business day (the internal aging indicator). */
export const isAgedUnassigned = (receivedAt: Date, now: Date): boolean =>
  businessMsBetween(receivedAt, now) > BUSINESS_DAY_MS

/** "Received 2d ago" style relative age in calendar terms, for display only. */
export function relativeAge(from: Date, now: Date): string {
  const ms = now.getTime() - from.getTime()
  if (!(ms > 0)) return 'just now'
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const dayTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const dateFmt = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TIME_ZONE, day: 'numeric', month: 'short' })
const fullFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
})

/** Compact list time: "14:32" today, "Tue 14:32" this week, "27 Sep" otherwise. */
export function compactTime(d: Date, now: Date): string {
  const startToday = startOfBusinessDay(now).getTime()
  if (d.getTime() >= startToday && d.getTime() <= endOfBusinessDay(now).getTime()) return timeFmt.format(d)
  if (d.getTime() >= startToday - 6 * BUSINESS_DAY_MS && d.getTime() < startToday) return dayTimeFmt.format(d)
  return dateFmt.format(d)
}

/** Absolute time with zone, for tooltips and detail headers. */
export const absoluteTime = (d: Date): string => `${fullFmt.format(d)} MT`

/** Parse an ISO string defensively; `null` for anything that is not a valid date. */
export function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null
  const d = new Date(value as string)
  return Number.isNaN(d.getTime()) ? null : d
}
