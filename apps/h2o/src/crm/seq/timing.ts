/**
 * SEQ-BUILD-1 — turning the contract's timing text into the engine's steps. The engine waits in BUSINESS days between
 * steps, so only timings that are business-day offsets (or immediate) can be built. Calendar-day timings, human
 * triggers and free-text timings are reported as unsupported with the reason; they are never guessed.
 */
export type TimingPlan =
  | { kind: 'IMMEDIATE' }
  | { kind: 'BUSINESS_DAYS'; days: number; after: number }
  | { kind: 'UNSUPPORTED'; reason: string }

export function parseTiming(text: string): TimingPlan {
  const t = (text ?? '').trim()
  if (/^IMMEDIATE(_|$)/.test(t)) return { kind: 'IMMEDIATE' }
  if (/^NEXT_BUSINESS_DAY(_|$)/.test(t)) return { kind: 'BUSINESS_DAYS', days: 1, after: 0 }
  const m = /^(\d{1,3})_BUSINESS_DAYS?_AFTER_STEP_(\d{1,2})(_|$)/.exec(t)
  if (m) return { kind: 'BUSINESS_DAYS', days: Number(m[1]), after: Number(m[2]) }
  if (/CALENDAR_DAYS?/.test(t)) return { kind: 'UNSUPPORTED', reason: 'It waits in calendar days; the engine waits in business days.' }
  return { kind: 'UNSUPPORTED', reason: 'Its timing depends on a person or a recorded date, not a fixed delay.' }
}

export type PlannedStep = {
  step_key: string
  type: 'EMAIL' | 'WAIT' | 'TASK'
  business_days?: number
  task_title?: string
  task_due_days?: number
  /** The Library step this comes from (EMAIL and TASK steps). */
  libraryStep?: number
}
export type PlanResult = { ok: true; steps: PlannedStep[]; totalDays: number } | { ok: false; reason: string }

/** Offsets are measured from the start (step 1 = day 0 unless its own timing says otherwise). */
export function planSteps(
  rows: Array<{ step: number; type: 'EMAIL' | 'TASK'; step_code: string; timing: string; task_creation?: string | null }>,
): PlanResult {
  const out: PlannedStep[] = []
  const offset = new Map<number, number>()
  let elapsed = 0
  for (const r of rows) {
    const plan = parseTiming(r.timing)
    if (plan.kind === 'UNSUPPORTED') return { ok: false, reason: `Step ${r.step}: ${plan.reason}` }
    let target = elapsed
    if (plan.kind === 'BUSINESS_DAYS') {
      const base = plan.after === 0 ? 0 : offset.get(plan.after)
      if (base === undefined) return { ok: false, reason: `Step ${r.step}: it waits from step ${plan.after}, which comes later.` }
      target = base + plan.days
    }
    const wait = target - elapsed
    if (wait < 0) return { ok: false, reason: `Step ${r.step}: its delay is shorter than the steps before it.` }
    if (wait > 0) {
      if (wait > 60) return { ok: false, reason: `Step ${r.step}: a wait is 1–60 business days.` }
      out.push({ step_key: `WAIT_${wait}BD_${r.step}`, type: 'WAIT', business_days: wait })
    }
    if (r.type === 'EMAIL') out.push({ step_key: r.step_code.slice(0, 64), type: 'EMAIL', libraryStep: r.step })
    else
      out.push({
        step_key: r.step_code.slice(0, 64),
        type: 'TASK',
        task_title: shortTitle(String(r.task_creation ?? 'Human review')),
        task_due_days: 1,
        libraryStep: r.step,
      })
    offset.set(r.step, target)
    elapsed = target
  }
  return { ok: true, steps: out, totalDays: elapsed }
}

/** A task title is one line of up to 200 characters; cut at a sentence end when the text is longer. */
export function shortTitle(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= 200) return t
  const cut = t.slice(0, 200)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '))
  return end > 80 ? cut.slice(0, end + 1) : `${cut.slice(0, 197)}…`
}

/** "Email 1 on day 0, email 2 after 3 more business days": the delays between emails in plain words. */
export function delaysSummary(steps: PlannedStep[]): string {
  let day = 0
  const days: number[] = []
  for (const s of steps) {
    if (s.type === 'WAIT') day += s.business_days ?? 0
    else if (s.type === 'EMAIL') days.push(day)
  }
  if (!days.length) return 'No emails'
  const bd = (n: number) => `${n} business day${n === 1 ? '' : 's'}`
  return days
    .map((d, i) => {
      const gap = i === 0 ? d : d - days[i - 1]!
      return i === 0 ? (d === 0 ? 'Email 1 on day 0' : `Email 1 after ${bd(d)}`) : `email ${i + 1} after ${gap === 0 ? 'no wait' : `${gap} more business day${gap === 1 ? '' : 's'}`}`
    })
    .join(', ')
}
