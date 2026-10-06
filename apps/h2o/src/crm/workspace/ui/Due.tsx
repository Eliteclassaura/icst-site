import { BUSINESS_TIME_ZONE, compactTime } from '../time'

/**
 * How a task's due date reads everywhere it appears. A task without a due date says so in words
 * ("No due date") — never a bare "Due" — and is never shown as overdue.
 */
export function DueLabel({ dueAt, overdue, now, zone = BUSINESS_TIME_ZONE }: { dueAt: string | null; overdue: boolean; now: Date; zone?: string }) {
  if (!dueAt) return <span className="c-unknown">No due date</span>
  return (
    <>
      {overdue ? <span className="c-overdue">Overdue</span> : 'Due'} {compactTime(new Date(dueAt), now, zone)}
    </>
  )
}
