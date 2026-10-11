import { MERGE_FIELDS } from '../../email/templates'
import { listLibrary, type LibraryRow } from '../library/service'
import type { CrmSession } from '../workspace/session'
import { delaysSummary, planSteps, type PlannedStep } from './timing'

/**
 * SEQ-BUILD-1 — the prebuilt catalogue: one row per Library sequence, with what it would build and, when it cannot be
 * built yet, exactly why (a merge field the CRM cannot fill, a timing the engine cannot run, an unwritten skeleton).
 * Nothing is invented to make a row buildable. Reads only.
 */
type Doc = Record<string, unknown>

const PURPOSE: Record<string, { purpose: string; entry: string }> = {
  ICS_RFQ_RECEIPT_FIRST_RESPONSE: { purpose: 'Confirm we have the RFQ and ask for nothing more than needed.', entry: 'RFQ received' },
  ICS_RFQ_QUALIFICATION_FOLLOWUP: { purpose: 'Ask one question to route an RFQ correctly.', entry: 'RFQ received, still unresolved' },
  ICS_MISSING_INFORMATION: { purpose: 'Ask only for the items still missing on an RFQ.', entry: 'RFQ needs info' },
  ICS_QUOTE_PROPOSAL_FOLLOWUP: { purpose: 'Follow up a quote or proposal that was sent.', entry: 'Deal stage “Quote sent”' },
  ICS_DORMANT_OPPORTUNITY_RECOVERY: { purpose: 'Re-open a deal that has gone quiet.', entry: 'No activity for a set number of days' },
  ICS_INSTALLED_BASE_INSPECTION_MAINTENANCE: { purpose: 'Offer inspection or maintenance at a verified service window.', entry: 'Manual or list' },
}
export const PINNED = Object.keys(PURPOSE)

export type CatalogueStep = { step: number; type: 'EMAIL' | 'TASK'; code: string; timing: string; subject: string | null; library_id: string }
export type CatalogueRow = {
  code: string
  program: string
  name: string
  purpose: string
  entry: string
  emails: number
  waits: number
  tasks: number
  delays: string
  exitGoals: number
  flags: number
  missingFields: string[]
  buildable: boolean
  blockers: string[]
  autoSteps: number
  steps: CatalogueStep[]
  planned: PlannedStep[]
}

const latest = (rows: LibraryRow[]) => rows.filter((r) => r.status !== 'LINKED')

/** Actual sequenceMergeValues capabilities. Declaring a template field does not supply a CRM resolver. */
export const SEQUENCE_RESOLVED_FIELDS = ['first_name', 'rfq_reference', 'missing_information_list', 'sequence_signature'] as const
const sequenceFields = new Set<string>(SEQUENCE_RESOLVED_FIELDS)

export async function catalogue(s: CrmSession): Promise<CatalogueRow[]> {
  const rows = latest(await listLibrary(s, {}))
  const groups = new Map<string, LibraryRow[]>()
  for (const r of rows) {
    if (r.program === 'T-series' || r.program === 'CUSTOM') continue
    const k = String(r.sequence_code)
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  const out: CatalogueRow[] = []
  for (const [code, rs] of groups) out.push(rowFor(code, rs.sort((a, b) => Number(a.step) - Number(b.step))))
  return out.sort((a, b) => {
    const pa = PINNED.indexOf(a.code)
    const pb = PINNED.indexOf(b.code)
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb) || a.program.localeCompare(b.program) || a.name.localeCompare(b.name)
  })
}

export function rowFor(code: string, rs: LibraryRow[]): CatalogueRow {
  const first = rs[0]! as Doc
  const blockers: string[] = []
  const skeleton = rs.some((r) => r.status === 'SKELETON')
  if (skeleton) blockers.push('This is a skeleton. The copy is not written yet, so it cannot be built or activated.')
  const missing = [
    ...new Set(
      rs.flatMap((r) => ((r.merge_fields ?? []) as string[]).filter((f) => !(f in MERGE_FIELDS) || !sequenceFields.has(f))),
    ),
  ].sort()
  if (missing.length) blockers.push(`The CRM cannot fill ${missing.map((m) => m.replace(/_/g, ' ')).join(', ')} yet.`)
  for (const r of rs) {
    if (r.type === 'EMAIL' && !((r.copy_variants ?? []) as string[]).length && !skeleton)
      blockers.push(`Step ${String(r.step)} has copy only per role; choose a role before it can be built.`)
  }
  const plan = skeleton
    ? ({ ok: false, reason: '' } as const)
    : planSteps(
        rs.map((r) => ({
          step: Number(r.step),
          type: r.type as 'EMAIL' | 'TASK',
          step_code: String(r.step_code),
          timing: String(r.timing ?? ''),
          task_creation: (r.task_creation as string | null) ?? null,
        })),
      )
  if (!skeleton && !plan.ok) blockers.push(plan.reason)
  const planned = plan.ok ? plan.steps : []
  const flags = rs.reduce(
    (n, r) =>
      n + (((r.lint as { variants?: Array<{ counts: Record<string, number> }> } | null)?.variants ?? []).reduce((m, v) => m + (v.counts?.REVIEW ?? 0) + (v.counts?.BLOCK ?? 0), 0)),
    0,
  )
  const meta = PURPOSE[code]
  return {
    code,
    program: String(first.program),
    name: String(first.sequence_label),
    purpose: meta?.purpose ?? 'Built from the Library exactly as written.',
    entry: meta?.entry ?? (String(first.program) === 'E2' ? 'Subscription list' : 'Manual'),
    emails: rs.filter((r) => r.type === 'EMAIL').length,
    waits: planned.filter((p) => p.type === 'WAIT').length,
    tasks: rs.filter((r) => r.type === 'TASK').length,
    delays: plan.ok ? delaysSummary(planned) : '—',
    exitGoals: ((first.stop_conditions ?? []) as unknown[]).length,
    flags,
    missingFields: missing,
    buildable: blockers.length === 0,
    blockers,
    autoSteps: rs.filter((r) => r.type === 'EMAIL' && r.approval_mode === 'AUTO').length,
    steps: rs.map((r) => ({
      step: Number(r.step),
      type: r.type as 'EMAIL' | 'TASK',
      code: String(r.step_code),
      timing: String(r.timing ?? ''),
      subject: ((r.subject_variants as string[] | null) ?? [])[0] ?? null,
      library_id: String(r.id),
    })),
    planned,
  }
}
