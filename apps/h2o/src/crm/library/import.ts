import type { Payload } from 'payload'
import { client } from '../../client'
import { MERGE_FIELDS } from '../../email/templates'
import seed from './data/library-seed.json'
import { lintVariant, worstBadge, type LibLint } from './lint'
import { assertProvenance } from './provenance'
import type { ParsedStep } from './parse-e1'

/**
 * EMAIL-LIB-1: the one-off, idempotent load of the Email Library. Server code only; writes nothing in a dry run.
 *
 *   - E1.1–E1.4: every step of `E1_EXACT_SEQUENCE_STEPS_AND_COPY.md`, verbatim (status IMPORTED_EXACT);
 *   - E2: the 24-month topic bank as skeleton rows (status SKELETON, never sendable);
 *   - T-series: the existing crm-email-templates rows (T1–T6, E11_*) as LINKED rows. Their text is never copied.
 * A re-import creates nothing twice. If a source block changed, the new text is a NEW version of the row (the original
 * stays; `supersedes` points back); nothing is overwritten.
 */
type Row = Record<string, unknown>
const LIB = 'crm-email-library' as never
const TPL = 'crm-email-templates' as never
const sys = { overrideAccess: true as const, depth: 0, context: { crmServer: {} } }

export { assertProvenance }
export const SEED_SOURCES = (seed as { sources: Record<string, string> }).sources
const E1_FILE = 'E1_EXACT_SEQUENCE_STEPS_AND_COPY.md'

type SeedStep = ParsedStep & { sequence_label: string }
const E1 = (seed as unknown as { e1: SeedStep[] }).e1
const E2 = (
  seed as unknown as {
    e2: Array<{
      month_slot: number
      topic_id: string
      title: string
      draft_id: string
      subject: string
      body: string
      source_hash: string
    }>
  }
).e2

export const E2_SEQUENCE = 'ICS_E2_MONTHLY_TECHNICAL_PROGRAM'
const PROGRAM_NAME: Record<string, string> = {
  'E1.1': 'E1_1',
  'E1.2': 'E1_2',
  'E1.3': 'E1_3',
  'E1.4': 'E1_4',
}

/** Merge-field names the copy uses that the template engine cannot fill yet. Reported as a gap; never invented. */
const missingFields = (names: string[]): string[] => names.filter((n) => !(n in MERGE_FIELDS))

function lintAll(
  subjects: string[],
  bodies: string[],
): { lint: LibLint[]; badge: ReturnType<typeof worstBadge> } {
  // Each body is checked with its first subject; if there are several subjects, each is checked with the first body too.
  const list: LibLint[] = []
  const s0 = subjects[0] ?? ''
  for (const b of bodies) list.push(lintVariant(s0, b))
  for (const s of subjects.slice(1)) list.push(lintVariant(s, bodies[0] ?? ''))
  return { lint: list, badge: worstBadge(list) }
}

export type PlannedRow = { key: string; data: Row }

/** The library rows the sources produce (pure; no database). */
export function planRows(): PlannedRow[] {
  // KIT-0 H4: a client without the Library module (library.enabled = false in its manifest) seeds none of these rows.
  if (!client().moduleOn('library')) return []
  const out: PlannedRow[] = []
  for (const s of E1) {
    const roleSubjects = s.role_copy_variants.flatMap((r) => r.subject_variants)
    const roleBodies = s.role_copy_variants.flatMap((r) => r.copy_variants)
    const subjects = [...s.subject_variants, ...roleSubjects]
    const bodies = [...s.copy_variants, ...roleBodies]
    const { lint, badge } =
      s.type === 'EMAIL' ? lintAll(subjects, bodies) : { lint: [] as LibLint[], badge: 'PASS' as const }
    const findings = lint.flatMap((l) => l.findings)
    const key = `${s.program}|${s.sequence}|${s.step}`
    out.push({
      key,
      data: {
        key,
        program: s.program,
        sequence_code: s.sequence,
        sequence_label: s.sequence_label,
        step: s.step,
        step_code: s.step_code,
        type: s.type,
        timing: s.timing,
        subject_variants: s.subject_variants,
        copy_variants: s.copy_variants,
        role_variants: s.role_copy_variants,
        merge_fields: s.merge_fields,
        missing_merge_fields: missingFields(s.merge_fields),
        placeholders: s.placeholders,
        evidence_fields: s.evidence_fields,
        stop_conditions: s.stop_conditions,
        pause_conditions: s.pause_conditions,
        reply_handling: s.reply_handling,
        task_creation: s.task_creation,
        status: 'IMPORTED_EXACT',
        sendable: s.type === 'EMAIL',
        version: 1,
        // The contract's mode is REQUIRED for every customer-facing step; a task has no send to approve.
        approval_recommended: s.approval === 'REQUIRED' ? 'REQUIRED' : 'AUTO',
        approval_mode: 'AUTO',
        source_ref: `${E1_FILE} §${PROGRAM_NAME[s.program]} ${s.sequence} / ${s.step} / ${s.step_code} (line ${s.source_line})`,
        source_line: s.source_line,
        source_hash: s.source_hash,
        source_file_sha256: SEED_SOURCES[E1_FILE],
        lint: s.type === 'EMAIL' ? { rule_set: lint[0]?.rule_set ?? null, variants: lint } : null,
        lint_badge: s.type === 'EMAIL' ? badge : 'NOT_RUN',
        lint_rule_set: lint[0]?.rule_set ?? null,
        lint_run_at: s.type === 'EMAIL' ? new Date().toISOString() : null,
        flags: {
          source_approval: s.approval,
          persona_signoff: findings.some((f) => f.rule_id === 'ICS_OWNER_SIGNOFF_001'),
          scope: findings.filter((f) => f.category === 'SCOPE_INDUSTRIAL_ONLY').map((f) => f.matched ?? ''),
          phone_or_address: findings.some((f) => f.rule_id === 'ICS_OWNER_NOPHONE_001'),
        },
      },
    })
  }
  for (const k of E2) {
    const { lint, badge } = lintAll([k.subject], [k.body])
    const key = `E2|${E2_SEQUENCE}|${k.month_slot}`
    out.push({
      key,
      data: {
        key,
        program: 'E2',
        sequence_code: E2_SEQUENCE,
        sequence_label: 'Monthly technical program',
        step: k.month_slot,
        step_code: k.topic_id,
        type: 'EMAIL',
        timing: `Month ${k.month_slot} of 24`,
        subject_variants: [k.subject],
        copy_variants: [k.body],
        role_variants: [],
        merge_fields: [...new Set([...k.body.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)].map((m) => m[1]!))].sort(),
        missing_merge_fields: missingFields(
          [...new Set([...k.body.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)].map((m) => m[1]!))].sort(),
        ),
        reply_handling: '',
        task_creation: '',
        status: 'SKELETON',
        sendable: false,
        version: 1,
        approval_recommended: 'REQUIRED',
        approval_mode: 'AUTO',
        source_ref: `e2_draft_skeletons.json ${k.draft_id} (topic: ${k.title})`,
        source_hash: k.source_hash,
        source_file_sha256: SEED_SOURCES['e2_draft_skeletons.json'],
        lint: { rule_set: lint[0]?.rule_set ?? null, variants: lint },
        lint_badge: badge,
        lint_rule_set: lint[0]?.rule_set ?? null,
        lint_run_at: new Date().toISOString(),
        flags: { skeleton: 'Skeleton — not sendable copy' },
      },
    })
  }
  return out
}

export type ImportReport = {
  dryRun: boolean
  create: number
  skip: number
  newVersion: number
  linked: number
  skeletons: number
  exact: number
  flagged: number
  rows: Array<{ key: string; action: 'create' | 'skip' | 'new_version' }>
}

/** Load the library. `dryRun` reports what would happen and writes nothing. */
export async function importLibrary(
  payload: Payload,
  opts: { dryRun?: boolean; user?: unknown } = {},
): Promise<ImportReport> {
  const dryRun = opts.dryRun === true
  assertProvenance()
  const planned = planRows()
  const have = await payload.find({
    collection: LIB,
    limit: 2000,
    depth: 0,
    overrideAccess: true,
    pagination: false,
  })
  const byBase = new Map<string, Row[]>()
  for (const d of have.docs as unknown as Row[]) {
    const base = String(d.key).split('#v')[0]!
    byBase.set(base, [...(byBase.get(base) ?? []), d])
  }
  const report: ImportReport = {
    dryRun,
    create: 0,
    skip: 0,
    newVersion: 0,
    linked: 0,
    skeletons: 0,
    exact: 0,
    flagged: 0,
    rows: [],
  }
  for (const p of planned) {
    const existing = (byBase.get(p.key) ?? [])
      .filter((d) => d.status !== 'EDITED')
      .sort((a, b) => Number(b.version) - Number(a.version))
    const latest = existing[0]
    if (latest && latest.source_hash === p.data.source_hash) {
      report.skip++
      report.rows.push({ key: p.key, action: 'skip' })
      continue
    }
    const action = latest ? 'new_version' : 'create'
    report[action === 'create' ? 'create' : 'newVersion']++
    if (p.data.status === 'SKELETON') report.skeletons++
    else report.exact++
    if (p.data.lint_badge === 'REVIEW' || p.data.lint_badge === 'BLOCKED') report.flagged++
    report.rows.push({ key: p.key, action })
    if (dryRun) continue
    const data: Row = latest
      ? {
          ...p.data,
          key: `${p.key}#v${Number(latest.version) + 1}`,
          version: Number(latest.version) + 1,
          supersedes: latest.id,
        }
      : p.data
    await payload.create({ collection: LIB, data: data as never, ...sys, ...(opts.user ? { user: opts.user as never } : {}) })
  }
  // T-series: link the existing templates (never copy their text).
  const tpls = await payload.find({
    collection: TPL,
    limit: 200,
    depth: 0,
    overrideAccess: true,
    pagination: false,
  })
  for (const t of tpls.docs as unknown as Row[]) {
    const key = `T-series|${String(t.code)}|1`
    if ((byBase.get(key) ?? []).length) {
      report.skip++
      report.rows.push({ key, action: 'skip' })
      continue
    }
    report.create++
    report.linked++
    report.rows.push({ key, action: 'create' })
    if (dryRun) continue
    await payload.create({
      collection: LIB,
      data: {
        key,
        program: 'T-series',
        sequence_code: String(t.code),
        sequence_label: String(t.name ?? t.code),
        step: 1,
        step_code: String(t.code),
        type: 'EMAIL',
        timing: '',
        // The text stays in the template (single source); the Library reads it through `linked_template` and lints it live.
        subject_variants: [],
        copy_variants: [],
        role_variants: [],
        merge_fields: [],
        status: 'LINKED',
        sendable: true,
        version: 1,
        approval_recommended: 'REQUIRED',
        approval_mode: 'AUTO',
        source_ref: `crm-email-templates ${String(t.code)} (linked; text not copied)`,
        source_hash: String(t.approved_hash ?? ''),
        linked_template: t.id,
        lint_badge: 'NOT_RUN',
        flags: {},
      } as never,
      ...sys,
      ...(opts.user ? { user: opts.user as never } : {}),
    })
  }
  return report
}
