import { createHash } from 'node:crypto'
import { stepUp } from '../../email/sending-settings'
import { templateHash } from '../../email/templates'
import type { LibraryRow } from '../library/service'
import { listLibrary } from '../library/service'
import { setTemplateApproved, textOf } from '../settings/templates'
import type { Outcome } from '../workspace/mutations'
import type { CrmSession } from '../workspace/session'
import { rowFor } from './catalogue'

/**
 * SEQ-BUILD-1 — "Create from this": assemble a DRAFT sequence from the Library, with the contract's delays. Admin +
 * step-up. The email wording is the Library's exact text (variant 1 of each step; the owner's "- Rhonda" sign-off is
 * kept; the seeded E11 `{{sequence_signature}}` variants are not used). Each wording is stored as a sequence template
 * and approved for exactly that text (the existing hash approval); the copy-risk and industrial-scope checks still
 * refuse anything they block. The draft is not published, not ready and not running: it sends nothing.
 */
type Doc = Record<string, unknown>
const SLUG_T = 'crm-email-templates'
const sys = { overrideAccess: true as const, depth: 0, context: { crmServer: {} } }
const fail = (code: string, message: string): Outcome => ({ ok: false, code, message })

/** Template codes are at most 24 characters. The headline sequences get readable codes; the rest a short hash. */
const SHORT: Record<string, string> = {
  ICS_RFQ_RECEIPT_FIRST_RESPONSE: 'RECEIPT',
  ICS_RFQ_QUALIFICATION_FOLLOWUP: 'QUAL',
  ICS_MISSING_INFORMATION: 'MISS',
}
export const templateCode = (sequenceCode: string, step: number): string =>
  `LIB_${SHORT[sequenceCode] ?? createHash('sha256').update(sequenceCode).digest('hex').slice(0, 8).toUpperCase()}_${step}`

/** What each Library program is for. Only inquiry-based programs can be built today (the catalogue says why for the rest). */
const PURPOSE_BY_PROGRAM: Record<string, string> = { 'E1.1': 'RFQ_RESPONSE', 'E1.2': 'RELATIONSHIP', 'E1.3': 'RELATIONSHIP', 'E1.4': 'COHORT', E2: 'PUBLICATION' }
export const purposeFor = (program: string, sequenceCode: string): string =>
  sequenceCode === 'ICS_QUOTE_PROPOSAL_FOLLOWUP' ? 'QUOTE_FOLLOWUP' : (PURPOSE_BY_PROGRAM[program] ?? 'RFQ_RESPONSE')

export type BuildOutcome = Outcome & { sequenceId?: string; versionId?: string }

export async function createFromPrebuilt(s: CrmSession, sid: string | null, input: { code?: string }): Promise<BuildOutcome> {
  if (!s.isAdmin) return fail('FORBIDDEN', 'Only an admin creates a sequence.')
  const denied = await stepUp(s, sid, undefined)
  if (denied) return denied
  if (!input.code) return fail('PREBUILT_UNKNOWN', 'Choose a prebuilt sequence.')
  const all = (await listLibrary(s, { sequence: input.code })) as LibraryRow[]
  const rows = all.filter((r) => r.status !== 'LINKED').sort((a, b) => Number(a.step) - Number(b.step))
  if (!rows.length) return fail('PREBUILT_UNKNOWN', 'That sequence is not in the Library.')
  const cat = rowFor(input.code, rows)
  if (!cat.buildable) return fail('PREBUILT_BLOCKED', cat.blockers[0] ?? 'This sequence cannot be built yet.')

  // 1. Wording → sequence templates, approved for exactly this text.
  const byStep = new Map(rows.map((r) => [Number(r.step), r]))
  const stepTemplates = new Map<number, Doc>()
  const used: Array<{ step: number; library_id: string; source_hash: string; template: string }> = []
  for (const p of cat.planned.filter((x) => x.type === 'EMAIL')) {
    const r = byStep.get(p.libraryStep!)! as Doc
    const subject = String(((r.subject_variants as string[]) ?? [])[0] ?? '').replace(/\s+/g, ' ').trim()
    const body = String(((r.copy_variants as string[]) ?? [])[0] ?? '').replace(/\r\n?/g, '\n').trim()
    const code = templateCode(input.code, p.libraryStep!)
    const name = `${cat.name} · step ${p.libraryStep}`.slice(0, 120)
    const have = (await s.payload.find({ collection: SLUG_T, where: { code: { equals: code } } as never, limit: 1, ...sys })).docs[0] as unknown as Doc | undefined
    let tpl: Doc
    if (!have) {
      tpl = (await s.payload.create({
        collection: SLUG_T,
        data: { code, name, purpose: 'SEQUENCE', locale: 'en', subject, body } as never,
        ...sys,
        user: s.user as never,
      })) as unknown as Doc
    } else if (templateHash(textOf(have)) !== templateHash({ subject, body, purpose: 'SEQUENCE' })) {
      tpl = (await s.payload.update({ collection: SLUG_T, id: String(have.id), data: { name, purpose: 'SEQUENCE', subject, body } as never, ...sys, user: s.user as never })) as unknown as Doc
    } else tpl = have
    const ok = await setTemplateApproved(s, String(tpl.id), true, templateHash(textOf(tpl)))
    if (!ok.ok) return fail(ok.code, `${cat.name}, step ${p.libraryStep}: ${ok.message}`)
    stepTemplates.set(p.libraryStep!, tpl)
    used.push({ step: p.libraryStep!, library_id: String(r.id), source_hash: String(r.source_hash ?? ''), template: code })
  }

  // 2. The sequence (new, or the existing one with this key) and a draft version holding the steps.
  const steps = cat.planned.map((p) =>
    p.type === 'EMAIL'
      ? { step_key: p.step_key, type: 'EMAIL', template: String(stepTemplates.get(p.libraryStep!)!.id), template_hash: null }
      : p.type === 'WAIT'
        ? { step_key: p.step_key, type: 'WAIT', business_days: p.business_days }
        : { step_key: p.step_key, type: 'TASK', task_title: p.task_title, task_due_days: p.task_due_days },
  )
  const needsMissing = rows.some((r) => ((r.merge_fields as string[]) ?? []).includes('missing_information_list'))
  let seq = (await s.payload.find({ collection: 'crm-sequences', where: { key: { equals: input.code } } as never, limit: 1, ...sys })).docs[0] as unknown as Doc | undefined
  const source = { program: cat.program, sequence_code: input.code, steps: used, built_at: new Date().toISOString() }
  if (!seq)
    seq = (await s.payload.create({
      collection: 'crm-sequences',
      data: { key: input.code, name: cat.name, language: 'EN', message_purpose: 'ACCOUNT_RELATIONSHIP', purpose: purposeFor(cat.program, input.code), run_state: 'DRAFT', approval_mode: 'AUTO', needs_missing_items: needsMissing, library_source: source } as never,
      ...sys,
      user: s.user as never,
    })) as unknown as Doc
  else
    await s.payload.update({ collection: 'crm-sequences', id: String(seq.id), data: { library_source: source, readiness: 'NOT_READY', needs_missing_items: needsMissing } as never, ...sys, user: s.user as never })
  const versions = (await s.payload.find({ collection: 'crm-sequence-versions', where: { sequence: { equals: String(seq.id) } } as never, sort: '-version_number', limit: 20, ...sys })).docs as unknown as Doc[]
  const draft = versions.find((v) => v.state === 'DRAFT')
  let versionId: string
  if (draft) {
    await s.payload.update({ collection: 'crm-sequence-versions', id: String(draft.id), data: { steps } as never, ...sys, user: s.user as never })
    versionId = String(draft.id)
  } else {
    const v = (await s.payload.create({
      collection: 'crm-sequence-versions',
      data: { sequence: String(seq.id), version_number: Number(versions[0]?.version_number ?? 0) + 1, state: 'DRAFT', steps } as never,
      ...sys,
      user: s.user as never,
    })) as unknown as Doc
    versionId = String(v.id)
  }
  return {
    ok: true,
    message: `Draft created from ${cat.name}. Copy is imported exactly; edit the template in the Library, not here.`,
    sequenceId: String(seq.id),
    versionId,
  }
}
