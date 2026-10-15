import type { Payload, Where } from 'payload'
import { readEmailConfig } from '../../email/config'
import { stepUp } from '../../email/sending-settings'
import { MERGE_FIELDS } from '../../email/templates'
import { ersSettings } from '../ers/settings'
import { signatureMergeValues } from '../settings/signatures'
import type { Outcome } from '../workspace/mutations'
import type { CrmSession } from '../workspace/session'
import { RFQ_PREFIX } from '../ids'
import {
  LIBRARY_APPROVAL,
  LIBRARY_LINT_BADGE,
  LIBRARY_PROGRAMS,
  LIBRARY_STATUS,
} from '../collections/email-library'
import { importLibrary, SEED_SOURCES, type ImportReport } from './import'
import { lintVariant, type LibLint } from './lint'

/**
 * EMAIL-LIB-1 service layer: reads for the Library screens and the two admin actions (change approval mode, import).
 * Every function re-checks the role itself (Admin + Sales may read; Admin + step-up may change). Nothing here can send.
 */
type Doc = Record<string, unknown>
const LIB = 'crm-email-library' as never
const sys = { overrideAccess: true as const, depth: 0, context: { crmServer: {} } }
const fail = (code: string, message: string): Outcome => ({ ok: false, code, message })
const NOT_ADMIN = fail('FORBIDDEN', 'Only an admin can do this.')

export type LibraryFilter = {
  q?: string
  program?: string
  sequence?: string
  status?: string
  approval?: string
  lint?: string
}
const oneOf = <T extends string>(v: string | undefined, list: readonly T[]): T | undefined =>
  (list as readonly string[]).includes(v ?? '') ? (v as T) : undefined

/** Parse filter values from a URL, keeping only known values. */
export function parseFilter(sp: Record<string, string | string[] | undefined>): LibraryFilter {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined
  return {
    program: oneOf(one('program'), LIBRARY_PROGRAMS),
    sequence: one('sequence')?.slice(0, 96) || undefined,
    status: oneOf(one('status'), LIBRARY_STATUS),
    approval: oneOf(one('approval'), LIBRARY_APPROVAL),
    lint: oneOf(one('lint'), LIBRARY_LINT_BADGE),
  }
}

export type LibraryRow = Doc & { id: string }
const PROGRAM_ORDER = Object.fromEntries(LIBRARY_PROGRAMS.map((p, i) => [p, i])) as Record<string, number>

/** Rows for the list (latest version of each key), filtered. Text search runs in the browser (search terms never enter a URL). */
export async function listLibrary(s: CrmSession, f: LibraryFilter): Promise<LibraryRow[]> {
  const and: Where[] = []
  if (f.program) and.push({ program: { equals: f.program } })
  if (f.sequence) and.push({ sequence_code: { equals: f.sequence } })
  if (f.status) and.push({ status: { equals: f.status } })
  if (f.approval) and.push({ approval_mode: { equals: f.approval } })
  if (f.lint) and.push({ lint_badge: { equals: f.lint } })
  const res = await s.payload.find({
    collection: LIB,
    where: and.length ? { and } : undefined,
    limit: 1000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  let rows = res.docs as unknown as LibraryRow[]
  // Latest version only: an edited copy supersedes its original in the list (the original stays reachable from it).
  const superseded = new Set(rows.map((r) => String(r.supersedes ?? '')).filter(Boolean))
  rows = rows.filter((r) => !superseded.has(String(r.id)))
  return rows.sort(
    (a, b) =>
      (PROGRAM_ORDER[String(a.program)] ?? 9) - (PROGRAM_ORDER[String(b.program)] ?? 9) ||
      (Number(a.source_line) || 1e9) - (Number(b.source_line) || 1e9) ||
      String(a.sequence_code).localeCompare(String(b.sequence_code)) ||
      Number(a.step) - Number(b.step),
  )
}

export async function programCounts(s: CrmSession): Promise<Record<string, number>> {
  const res = await s.payload.find({
    collection: LIB,
    limit: 1000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { program: true, supersedes: true } as never,
  })
  const rows = res.docs as unknown as Doc[]
  const superseded = new Set(rows.map((r) => String(r.supersedes ?? '')).filter(Boolean))
  const out: Record<string, number> = {}
  for (const r of rows)
    if (!superseded.has(String(r.id))) out[String(r.program)] = (out[String(r.program)] ?? 0) + 1
  return out
}

export async function libraryRow(
  s: CrmSession,
  id: string,
): Promise<{ row: LibraryRow; template: Doc | null; original: LibraryRow | null } | null> {
  const row = (await s.payload
    .findByID({ collection: LIB, id, depth: 0, overrideAccess: true })
    .catch(() => null)) as unknown as LibraryRow | null
  if (!row) return null
  const tplId = row.linked_template ? String(row.linked_template) : ''
  const template = tplId
    ? ((await s.payload
        .findByID({ collection: 'crm-email-templates' as never, id: tplId, depth: 0, overrideAccess: true })
        .catch(() => null)) as unknown as Doc | null)
    : null
  const original = row.supersedes
    ? ((await s.payload
        .findByID({ collection: LIB, id: String(row.supersedes), depth: 0, overrideAccess: true })
        .catch(() => null)) as unknown as LibraryRow | null)
    : null
  return { row, template, original }
}

/** A variant ready to show: subject + body, which variant it is and its copy check (live for linked templates). */
export type ShownVariant = { label: string; subject: string; body: string; lint: LibLint }
export function variantsOf(row: Doc, template: Doc | null): ShownVariant[] {
  if (template)
    return [
      {
        label: String(template.code ?? 'Template'),
        subject: String(template.subject ?? ''),
        body: String(template.body ?? ''),
        lint: lintVariant(String(template.subject ?? ''), String(template.body ?? '')),
      },
    ]
  const subjects = (row.subject_variants as string[] | null) ?? []
  const bodies = (row.copy_variants as string[] | null) ?? []
  const out: ShownVariant[] = bodies.map((b, i) => ({
    label: `Variant ${i + 1}`,
    subject: subjects[0] ?? '',
    body: b,
    lint: lintVariant(subjects[0] ?? '', b),
  }))
  for (const r of (row.role_variants as Array<{
    role_class: string
    subject_variants: string[]
    copy_variants: string[]
  }> | null) ?? [])
    r.copy_variants.forEach((b, i) =>
      out.push({
        label: `${r.role_class.replace(/_/g, ' ').toLowerCase()} · variant ${i + 1}`,
        subject: r.subject_variants[0] ?? '',
        body: b,
        lint: lintVariant(r.subject_variants[0] ?? '', b),
      }),
    )
  // Extra subject lines are shown as their own variants of the first body.
  subjects.slice(1).forEach(
    (sj, i) =>
      bodies[0] &&
      out.push({
        label: `Subject ${i + 2}`,
        subject: sj,
        body: bodies[0],
        lint: lintVariant(sj, bodies[0]),
      }),
  )
  return out
}

export type SampleRecipient = { id: string; label: string; values: Record<string, string> }

/** Synthetic sample recipients for the preview (never a real contact). The settings supply A/B's signature below. */
export const SAMPLE_RECIPIENTS: SampleRecipient[] = [
  {
    id: 'a',
    label: 'Sample A (complete)',
    values: {
      first_name: 'Alex',
      customer_first_name: 'Alex',
      greeting: 'Hi Alex,',
      rfq_number: `${RFQ_PREFIX}SAMPLE-0001`,
      rfq_reference: `${RFQ_PREFIX}SAMPLE-0001`,
      quote_reference: 'Q-SAMPLE-0001',
      opportunity_reference: 'OPP-SAMPLE-0001',
      verified_account_name: 'Northwind Plant (sample)',
      verified_account_or_site_label: 'Northwind Plant (sample)',
      verified_site_name: 'Northwind East (sample)',
      verified_asset_label: 'Northwind tower A (sample)',
      verified_open_technical_item: 'the design-flow confirmation (sample)',
      verified_question: 'the requested water-temperature range (sample)',
      approved_upgrade_objective: 'reduce fan energy use (sample)',
      verified_scope_label: 'fan replacement for tower A (sample)',
      verified_next_review_date: 'October 20, 2026 (sample)',
      verified_open_revision_item: 'the revised fan specification (sample)',
      verified_service_window_phrase: 'the planned October outage (sample)',
      approved_condition_or_request_summary: 'The example fan assembly needs a condition review (sample).',
      approved_missing_part_identification_request: 'Please share a photo of the example name plate (sample).',
      verified_part_request_label: 'the example fan assembly (sample)',
      company: 'Northwind Plant (sample)',
      sales_rep_name: 'Example Sales Team (sample)',
      sales_rep_title: 'Example Sales Role (sample)',
      response_sentence: 'The example team will review this request (sample).',
      unsubscribe_url: 'https://example.invalid/unsubscribe/sample-a',
      missing_information_list: 'the design flow and the tower tag',
      safe_salutation: 'Hello',
    },
  },
  {
    id: 'b',
    label: 'Sample B (complete)',
    values: {
      first_name: 'Jordan',
      customer_first_name: 'Jordan',
      greeting: 'Hi Jordan,',
      rfq_number: `${RFQ_PREFIX}SAMPLE-0002`,
      rfq_reference: `${RFQ_PREFIX}SAMPLE-0002`,
      quote_reference: 'Q-SAMPLE-0002',
      opportunity_reference: 'OPP-SAMPLE-0002',
      verified_account_name: 'Harbor Process Co (sample)',
      verified_account_or_site_label: 'Harbor Process Co (sample)',
      verified_site_name: 'Harbor North (sample)',
      verified_asset_label: 'Harbor tower B (sample)',
      verified_open_technical_item: 'the water-source confirmation (sample)',
      verified_question: 'the requested operating schedule (sample)',
      approved_upgrade_objective: 'improve tower access for maintenance (sample)',
      verified_scope_label: 'fill replacement for tower B (sample)',
      verified_next_review_date: 'November 3, 2026 (sample)',
      verified_open_revision_item: 'the revised fill specification (sample)',
      verified_service_window_phrase: 'the planned November outage (sample)',
      approved_condition_or_request_summary: 'The example fill pack needs a condition review (sample).',
      approved_missing_part_identification_request: 'Please share the example tower tag and part photo (sample).',
      verified_part_request_label: 'the example fill pack (sample)',
      company: 'Harbor Process Co (sample)',
      sales_rep_name: 'Example Sales Team (sample)',
      sales_rep_title: 'Example Sales Role (sample)',
      response_sentence: 'The example team will review this request (sample).',
      unsubscribe_url: 'https://example.invalid/unsubscribe/sample-b',
      missing_information_list: 'the water source',
      safe_salutation: 'Hello',
    },
  },
  { id: 'c', label: 'Sample C (missing fields)', values: { first_name: 'Sam' } },
]

/**
 * SIGNATURES-1: A and B carry the REAL signature resolution (the standard signature for a sequence; the viewer's own or the
 * standard for a reply), the same as a real send. Read only, no contact, no write. C stays deliberately incomplete.
 */
export async function sampleRecipients(payload: Payload, viewerId?: string | number | null): Promise<SampleRecipient[]> {
  const sig = await signatureMergeValues(payload, viewerId)
  return SAMPLE_RECIPIENTS.map((sample) => ({
    ...sample,
    values: sample.id === 'c' ? { ...sample.values } : {
      ...sample.values,
      sequence_signature: sig.sequence_signature,
      email_signature: sig.email_signature,
    },
  }))
}

export type Rendered = { subject: string; body: string; missing: string[] }
/** Fill sample fields; preview-only choices use their first option. Real sends still require an explicit choice. */
export function renderSample(subject: string, body: string, values: Record<string, string>): Rendered {
  const missing = new Set<string>()
  const fill = (t: string) =>
    t.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, (_m, n: string) => {
      if (n.startsWith('choice:')) {
        const options = n.slice(7).split('|').map((option) => option.trim()).filter(Boolean)
        if (options.length >= 2) return options[0]!
      }
      const v = values[n]
      if (v) return v
      missing.add(n)
      return `«Missing: ${n}»`
    })
  return { subject: fill(subject), body: fill(body), missing: [...missing] }
}

/** Merge fields the template engine cannot fill yet (shown as a gap on the row). */
export const unknownFields = (names: string[]): string[] => names.filter((n) => !(n in MERGE_FIELDS))

export type EngineStatus = { state: 'OFF' | 'ON' | 'PAUSED'; reason: string | null; since: string | null }
/** The one engine state for the strip: OFF unless the engine switch is on AND email can actually leave (mode not off). */
export async function engineStatus(payload: Payload): Promise<EngineStatus> {
  const e = await ersSettings(payload).catch(() => null)
  if (!e) return { state: 'OFF', reason: 'The engine settings could not be read.', since: null }
  if (e.health.state === 'PAUSED')
    return { state: 'PAUSED', reason: e.health.reason, since: e.health.changedAt }
  if (!e.enabled) return { state: 'OFF', reason: 'The engine switch is off.', since: null }
  if (readEmailConfig().mode === 'off')
    return { state: 'OFF', reason: 'Email sending is switched off for this site.', since: null }
  return { state: 'ON', reason: null, since: null }
}

export async function changeApprovalMode(
  s: CrmSession,
  sid: string | null,
  input: { id?: string; mode?: string; reason?: string },
): Promise<Outcome> {
  if (!s.isAdmin) return NOT_ADMIN
  const mode = oneOf(input.mode, LIBRARY_APPROVAL)
  if (!input.id || !mode) return fail('LIBRARY_APPROVAL_INVALID', 'Choose an approval mode.')
  // STEP-UP-1: only switching an email to AUTOMATIC sending needs the step-up; the stricter modes never do.
  if (mode === 'AUTO') {
    const denied = await stepUp(s, sid, undefined)
    if (denied) return denied
  }
  const reason = (input.reason ?? '').trim()
  if (reason.length < 3)
    return fail('LIBRARY_REASON_REQUIRED', 'Say why the approval mode is changing (a few words).')
  const row = (await s.payload
    .findByID({ collection: LIB, id: input.id, depth: 0, overrideAccess: true })
    .catch(() => null)) as unknown as Doc | null
  if (!row) return fail('NOT_FOUND', 'That email is no longer in the library.')
  if (row.type !== 'EMAIL') return fail('LIBRARY_NOT_EMAIL', 'A task step has nothing to approve.')
  if (row.status === 'SKELETON')
    return fail('LIBRARY_SKELETON', 'A skeleton is not sendable copy, so its approval mode cannot change.')
  if (row.approval_mode === mode) return fail('LIBRARY_APPROVAL_SAME', 'It is already set to that.')
  await s.payload.update({
    collection: LIB,
    id: input.id,
    data: {
      approval_mode: mode,
      approval_reason: reason.slice(0, 300),
      approval_changed_at: new Date().toISOString(),
      approval_changed_by: s.user.id,
    } as never,
    ...sys,
    user: s.user as never, // the audit row records WHO changed it
  })
  return { ok: true, message: `Approval mode set to ${mode}.` }
}

export type ImportOutcome = Outcome & { report?: ImportReport }
/** Dry run is open to any admin; the real import needs the step-up. Idempotent. */
export async function runImport(s: CrmSession, sid: string | null, dryRun: boolean): Promise<ImportOutcome> {
  if (!s.isAdmin) return NOT_ADMIN
  if (!dryRun) {
    const denied = await stepUp(s, sid, undefined)
    if (denied) return denied
  }
  const report = await importLibrary(s.payload, { dryRun, user: s.user })
  const msg = dryRun
    ? `Dry run: ${report.create} to add, ${report.newVersion} new version${report.newVersion === 1 ? '' : 's'}, ${report.skip} already there. Nothing was written.`
    : `Imported: ${report.create} added, ${report.newVersion} new version${report.newVersion === 1 ? '' : 's'}, ${report.skip} already there.`
  return { ok: true, message: msg, report }
}

export const importSources = () => SEED_SOURCES
