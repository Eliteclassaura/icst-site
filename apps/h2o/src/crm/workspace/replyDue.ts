import { atHour } from '../ers/calendar'
import { isBusinessDay, startOfBusinessDay, type BusinessCalendar } from './time'

/**
 * Polish R1 (CT brief, must-have 1): the reply-due countdown against the one-business-day promise (D-1). The due
 * instant is the open first-response task's due date (set by the D-1 rule on the office calendar). The countdown
 * counts **office hours** — 09:00–17:00 office time on the office's business days (holidays excluded) — so a Friday
 * evening inquiry does not turn amber over the weekend.
 *
 *   - OK       more than 4 office hours left
 *   - SOON     4 office hours or fewer left (including "due later today" after the office has closed)
 *   - OVERDUE  past the due instant
 *   - DONE     the first-response task is done (a reply went out)
 *   - NONE     no first-response task (closed, qualified, legacy) — nothing is due
 *
 * Internal operational indicator only; never presented as a customer SLA (see time.ts).
 */
export const OFFICE_OPEN_HOUR = 9
export const OFFICE_CLOSE_HOUR = 17
export const REPLY_SOON_MS = 4 * 3600_000

export type ReplyState = 'OPEN' | 'DONE' | 'NONE'
export type ReplyTone = 'ok' | 'soon' | 'overdue' | 'done' | 'none'
export type ReplyDue = { dueAt: string | null; state: ReplyState; tone: ReplyTone; officeMsLeft: number | null }

/** Office-hours milliseconds between `from` and `to` on `cal` (0 when `to` is not after `from`). */
export function officeMsBetween(from: Date, to: Date, cal: BusinessCalendar, open = OFFICE_OPEN_HOUR, close = OFFICE_CLOSE_HOUR): number {
  if (!(to.getTime() > from.getTime())) return 0
  let total = 0
  let day = startOfBusinessDay(from, cal.zone)
  for (let guard = 0; guard < 4000 && day.getTime() < to.getTime(); guard++) {
    if (isBusinessDay(new Date(day.getTime() + 12 * 3600_000), cal)) {
      const a = Math.max(atHour(day, open, cal.zone).getTime(), from.getTime())
      const b = Math.min(atHour(day, close, cal.zone).getTime(), to.getTime())
      if (b > a) total += b - a
    }
    day = startOfBusinessDay(new Date(day.getTime() + 36 * 3600_000), cal.zone)
  }
  return total
}

export function replyDue(task: { status: string; dueAt: Date | null } | null, now: Date, cal: BusinessCalendar): ReplyDue {
  if (!task || task.status === 'CANCELLED') return { dueAt: null, state: 'NONE', tone: 'none', officeMsLeft: null }
  if (task.status === 'DONE') return { dueAt: task.dueAt?.toISOString() ?? null, state: 'DONE', tone: 'done', officeMsLeft: null }
  if (!task.dueAt) return { dueAt: null, state: 'OPEN', tone: 'ok', officeMsLeft: null }
  if (task.dueAt.getTime() < now.getTime()) return { dueAt: task.dueAt.toISOString(), state: 'OPEN', tone: 'overdue', officeMsLeft: 0 }
  const left = officeMsBetween(now, task.dueAt, cal)
  return { dueAt: task.dueAt.toISOString(), state: 'OPEN', tone: left <= REPLY_SOON_MS ? 'soon' : 'ok', officeMsLeft: left }
}

const hm = (ms: number): string => {
  const min = Math.max(0, Math.round(ms / 60_000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** The short label in lists and headers. Words carry the meaning; the colour only repeats it. */
export function replyDueLabel(r: ReplyDue, now: Date): string {
  switch (r.tone) {
    case 'done':
      return 'Replied'
    case 'none':
      return 'No reply due'
    case 'overdue':
      {
        const late = now.getTime() - new Date(r.dueAt as string).getTime()
        // Whole days past a day, whole hours past an hour: "Overdue 2 d", "Overdue 5 h", "Overdue 40 min".
        return `Overdue ${late >= 24 * 3600_000 ? `${Math.floor(late / (24 * 3600_000))} d` : late >= 3600_000 ? `${Math.floor(late / 3600_000)} h` : hm(late)}`
      }
    default:
      if (r.officeMsLeft === null) return 'Reply due'
      return r.officeMsLeft === 0 ? 'Due today' : `${hm(r.officeMsLeft)} left`
  }
}
