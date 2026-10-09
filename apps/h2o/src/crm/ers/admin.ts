import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import { LINTER_SHA256, lintCopy } from '../../email/copy-lint'
import { readInboundConfig } from '../../email/config'
import { templateHash } from '../../email/templates'
import { ensureTemplates, isApproved, templateByCode, textOf } from '../settings/templates'
import type { Outcome } from '../workspace/mutations'
import type { CrmSession } from '../workspace/session'
import type { Step } from './engine'
import { ersSettings, inboundFresh } from './settings'

/**
 * Revenue Engine slice 1 — sequence administration (admins). LEAN CUT editing: a published version is frozen; a
 * running sequence can only be paused; to change it, duplicate the version into a draft, edit, publish (new hash).
 * Activation and resume need live reply detection (CT ruling 3). Everything here is audited by the collections.
 */
type Doc = Record<string, unknown>
const sys = { overrideAccess: true as const, depth: 0, context: { crmServer: {} } }
const fail = (code: string, message: string): Outcome => ({ ok: false, code, message })
const NOT_ADMIN = fail('FORBIDDEN', 'Sequences are managed by admins.')

/** E1.1 R2 in LEAN CUT form (CT-accepted brief §F.2): waits are business days relative to the previous step. */
const SEEDS: Array<{ key: string; name: string; needsMissing: boolean; steps: Array<Omit<Step, 'template'> & { template?: string }> }> = [
  {
    key: 'ICS_RFQ_QUALIFICATION_FOLLOWUP',
    name: 'RFQ qualification follow-up (E1.1)',
    needsMissing: false,
    steps: [
      { step_key: 'WAIT_1BD', type: 'WAIT', business_days: 1 },
      { step_key: 'QUALIFY_COMMERCIAL_MOTION', type: 'EMAIL', template: 'E11_QUAL_1' },
      { step_key: 'WAIT_3BD', type: 'WAIT', business_days: 3 },
      { step_key: 'QUALIFICATION_REMINDER', type: 'EMAIL', template: 'E11_QUAL_2' },
      { step_key: 'WAIT_4BD', type: 'WAIT', business_days: 4 },
      {
        step_key: 'QUALIFICATION_HUMAN_REVIEW',
        type: 'TASK',
        task_title: 'Human review: classify using submitted RFQ documents, request information manually if material, or mark qualification unknown without guessing.',
        task_due_days: 1,
      },
    ],
  },
  {
    key: 'ICS_MISSING_INFORMATION',
    name: 'RFQ missing information (E1.1)',
    needsMissing: true,
    steps: [
      { step_key: 'REQUEST_MISSING_INFO', type: 'EMAIL', template: 'E11_MISS_1' },
      { step_key: 'WAIT_3BD', type: 'WAIT', business_days: 3 },
      { step_key: 'MISSING_INFO_REMINDER', type: 'EMAIL', template: 'E11_MISS_2' },
      { step_key: 'WAIT_4BD', type: 'WAIT', business_days: 4 },
      {
        step_key: 'MISSING_INFO_HOLD',
        type: 'TASK',
        task_title: 'Pause for human review: decide whether to hold, close as incomplete, or contact manually based on project value and timing. Never auto-classify lost.',
        task_due_days: 1,
      },
    ],
  },
]

/** Insert the E1.1 sequences once, as DRAFT with a DRAFT version 1 (an admin publishes and activates them). */
export async function ensureSeedSequences(payload: Payload): Promise<void> {
  await ensureTemplates(payload)
  for (const seed of SEEDS) {
    const have = await payload.find({ collection: 'crm-sequences', where: { key: { equals: seed.key } } as never, limit: 1, depth: 0, overrideAccess: true })
    if (have.docs.length) continue
    try {
      const seq = (await payload.create({ collection: 'crm-sequences', data: { key: seed.key, name: seed.name, language: 'EN', message_purpose: 'ACCOUNT_RELATIONSHIP', run_state: 'DRAFT', approval_mode: 'AUTO', needs_missing_items: seed.needsMissing } as never, ...sys })) as unknown as Doc
      const steps = []
      for (const st of seed.steps) {
        const tpl = st.template ? await templateByCode(payload, st.template) : null
        steps.push({ ...st, template: tpl ? String(tpl.id) : null, template_hash: null })
      }
      await payload.create({ collection: 'crm-sequence-versions', data: { sequence: String(seq.id), version_number: 1, state: 'DRAFT', steps } as never, ...sys })
    } catch {
      // Another process seeded it first (unique key) — fine.
    }
  }
}

const stepsOf = (v: Doc): Step[] => ((v.steps ?? []) as Step[]).map((s) => ({ step_key: s.step_key, type: s.type, template: s.template && typeof s.template === 'object' ? (s.template as Doc).id : s.template, template_hash: s.template_hash ?? null, business_days: s.business_days ?? null, task_title: s.task_title ?? null, task_due_days: s.task_due_days ?? null }))

/** E0.1 definition hash: steps (with each template's approval hash), purpose, language, overrides, the rule set. */
export function definitionHash(sequence: Doc, steps: Step[]): string {
  const canon = {
    purpose: sequence.message_purpose,
    language: sequence.language,
    compliance: sequence.compliance ?? {},
    rule_set: LINTER_SHA256,
    steps: steps.map((s) => [s.step_key, s.type, s.template ? String(s.template) : null, s.template_hash ?? null, s.business_days ?? null, s.task_title ?? null, s.task_due_days ?? null]),
  }
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex')
}

async function load(payload: Payload, collection: string, id: unknown): Promise<Doc | null> {
  return id ? ((await payload.findByID({ collection: collection as never, id: String(id), depth: 0, overrideAccess: true }).catch(() => null)) as Doc | null) : null
}

/** Freeze a draft version: every EMAIL step's template must be an approved SEQUENCE template that passes the linter. */
export async function publishVersion(s: CrmSession, versionId: string | undefined, now = new Date()): Promise<Outcome> {
  if (!s.isAdmin) return NOT_ADMIN
  const v = await load(s.payload, 'crm-sequence-versions', versionId)
  if (!v) return fail('NOT_FOUND', 'That version no longer exists.')
  if (v.state !== 'DRAFT') return fail('NOT_DRAFT', 'Only a draft can be published.')
  const seq = await load(s.payload, 'crm-sequences', v.sequence && typeof v.sequence === 'object' ? (v.sequence as Doc).id : v.sequence)
  if (!seq) return fail('NOT_FOUND', 'That sequence no longer exists.')
  const steps = stepsOf(v)
  if (!steps.some((st) => st.type === 'EMAIL')) return fail('NO_EMAIL_STEP', 'A sequence needs at least one email step.')
  for (const [i, st] of steps.entries()) {
    if (st.type === 'WAIT' && !(Number(st.business_days) >= 1 && Number(st.business_days) <= 60)) return fail('STEP_INVALID', `Step ${i + 1}: a wait is 1–60 business days.`)
    if (st.type === 'TASK' && !String(st.task_title ?? '').trim()) return fail('STEP_INVALID', `Step ${i + 1}: a task needs a title.`)
    if (st.type !== 'EMAIL') continue
    const tpl = await load(s.payload, 'crm-email-templates', st.template)
    if (!tpl || tpl.purpose !== 'SEQUENCE') return fail('STEP_TEMPLATE', `Step ${i + 1}: choose a sequence template.`)
    if (!isApproved(tpl)) return fail('STEP_TEMPLATE_UNAPPROVED', `Step ${i + 1}: template ${String(tpl.code)} is not approved.`)
    if (lintCopy(String(tpl.subject), String(tpl.body), 'TEMPLATE').decision === 'HOLD') return fail('STEP_TEMPLATE_LINT', `Step ${i + 1}: template ${String(tpl.code)} fails the copy-risk check.`)
    st.template_hash = templateHash(textOf(tpl))
  }
  const hash = definitionHash(seq, steps)
  await s.payload.update({ collection: 'crm-sequence-versions', id: String(v.id), data: { steps, definition_hash: hash, rule_set_sha: LINTER_SHA256, state: 'PUBLISHED', published_at: now.toISOString(), published_by: s.user.id } as never, ...sys, user: s.user as never })
  // The previous published version is retired; its enrollments carry on with it (E0.1 §7).
  const prev = seq.published_version && typeof seq.published_version === 'object' ? (seq.published_version as Doc).id : seq.published_version
  if (prev && String(prev) !== String(v.id)) await s.payload.update({ collection: 'crm-sequence-versions', id: String(prev), data: { state: 'RETIRED', retired_at: now.toISOString() } as never, ...sys, user: s.user as never })
  await s.payload.update({ collection: 'crm-sequences', id: String(seq.id), data: { published_version: String(v.id) } as never, ...sys, user: s.user as never })
  return { ok: true, message: `Version ${String(v.version_number)} published. New enrollments use it.` }
}

async function inboundLive(s: CrmSession): Promise<boolean> {
  return inboundFresh(await ersSettings(s.payload), readInboundConfig().enabled)
}

/** DRAFT/PAUSED → ACTIVE. Needs a published version and live reply detection (CT ruling 3). */
export async function activateSequence(s: CrmSession, sequenceId: string | undefined): Promise<Outcome> {
  if (!s.isAdmin) return NOT_ADMIN
  const seq = await load(s.payload, 'crm-sequences', sequenceId)
  if (!seq) return fail('NOT_FOUND', 'That sequence no longer exists.')
  if (!seq.published_version) return fail('NOT_PUBLISHED', 'Publish a version first.')
  if (!(await inboundLive(s)))
    return fail('INBOUND_NOT_LIVE', 'Reply detection is not running (inbound email is off, or its last check is more than 15 minutes old). A sequence cannot run without it.')
  await s.payload.update({ collection: 'crm-sequences', id: String(seq.id), data: { run_state: 'ACTIVE', paused_reason: null } as never, ...sys, user: s.user as never })
  return { ok: true, message: 'Sequence is running.' }
}

export async function pauseSequence(s: CrmSession, sequenceId: string | undefined): Promise<Outcome> {
  if (!s.isAdmin) return NOT_ADMIN
  const seq = await load(s.payload, 'crm-sequences', sequenceId)
  if (!seq) return fail('NOT_FOUND', 'That sequence no longer exists.')
  if (seq.run_state !== 'ACTIVE') return fail('NOT_RUNNING', 'The sequence is not running.')
  await s.payload.update({ collection: 'crm-sequences', id: String(seq.id), data: { run_state: 'PAUSED', paused_reason: 'ADMIN' } as never, ...sys, user: s.user as never })
  return { ok: true, message: 'Sequence paused. No step runs and queued emails wait.' }
}

/** "Duplicate to edit": a new DRAFT version with the latest version's steps (one draft at a time). */
export async function duplicateVersion(s: CrmSession, sequenceId: string | undefined): Promise<Outcome> {
  if (!s.isAdmin) return NOT_ADMIN
  const seq = await load(s.payload, 'crm-sequences', sequenceId)
  if (!seq) return fail('NOT_FOUND', 'That sequence no longer exists.')
  const versions = (await s.payload.find({ collection: 'crm-sequence-versions', where: { sequence: { equals: String(seq.id) } } as never, sort: '-version_number', limit: 50, depth: 0, overrideAccess: true })).docs as unknown as Doc[]
  if (versions.some((v) => v.state === 'DRAFT')) return fail('DRAFT_EXISTS', 'There is already a draft. Edit or publish it.')
  const latest = versions[0]
  const created = (await s.payload.create({ collection: 'crm-sequence-versions', data: { sequence: String(seq.id), version_number: Number(latest?.version_number ?? 0) + 1, state: 'DRAFT', steps: latest ? stepsOf(latest).map((st) => ({ ...st, template_hash: null })) : [] } as never, ...sys, user: s.user as never })) as unknown as Doc
  return { ok: true, message: 'Draft created. Edit its steps, then publish.', id: String(created.id) }
}

/**
 * Draft step editor, one step per line:
 *   WAIT <business days>          EMAIL <template code>          TASK <due business days> <title>
 */
export function parseSteps(text: string): { ok: true; steps: Array<Omit<Step, 'template'> & { templateCode?: string }> } | { ok: false; message: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0 || lines.length > 20) return { ok: false, message: 'Write 1 to 20 steps, one per line.' }
  const steps: Array<Omit<Step, 'template'> & { templateCode?: string }> = []
  for (const [i, l] of lines.entries()) {
    const m = /^(WAIT|EMAIL|TASK)\s+(.+)$/i.exec(l)
    if (!m) return { ok: false, message: `Line ${i + 1}: start with WAIT, EMAIL or TASK.` }
    const kind = m[1]!.toUpperCase() as Step['type']
    const rest = m[2]!.trim()
    if (kind === 'WAIT') {
      const n = Number(rest)
      if (!Number.isInteger(n) || n < 1 || n > 60) return { ok: false, message: `Line ${i + 1}: WAIT takes 1–60 business days.` }
      steps.push({ step_key: `S${i + 1}_WAIT`, type: 'WAIT', business_days: n })
    } else if (kind === 'EMAIL') {
      if (!/^[A-Z][A-Z0-9_]{1,23}$/.test(rest)) return { ok: false, message: `Line ${i + 1}: EMAIL takes a template code, e.g. E11_QUAL_1.` }
      steps.push({ step_key: `S${i + 1}_${rest}`, type: 'EMAIL', templateCode: rest })
    } else {
      const t = /^(\d{1,2})\s+(.{3,200})$/.exec(rest)
      if (!t) return { ok: false, message: `Line ${i + 1}: TASK takes due business days, then a title.` }
      steps.push({ step_key: `S${i + 1}_TASK`, type: 'TASK', task_due_days: Number(t[1]), task_title: t[2]! })
    }
  }
  return { ok: true, steps }
}

export const formatSteps = (steps: Step[], codeOf: (id: unknown) => string): string =>
  steps.map((st) => (st.type === 'WAIT' ? `WAIT ${st.business_days}` : st.type === 'EMAIL' ? `EMAIL ${codeOf(st.template)}` : `TASK ${st.task_due_days ?? 0} ${st.task_title ?? ''}`)).join('\n')

export async function saveDraftSteps(s: CrmSession, versionId: string | undefined, text: string | undefined): Promise<Outcome> {
  if (!s.isAdmin) return NOT_ADMIN
  const v = await load(s.payload, 'crm-sequence-versions', versionId)
  if (!v || v.state !== 'DRAFT') return fail('NOT_DRAFT', 'Only a draft can be edited. Duplicate the published version first.')
  const parsed = parseSteps(text ?? '')
  if (!parsed.ok) return fail('STEPS_INVALID', parsed.message)
  const steps = []
  for (const st of parsed.steps) {
    let template: string | null = null
    if (st.templateCode) {
      const tpl = await templateByCode(s.payload, st.templateCode)
      if (!tpl || tpl.purpose !== 'SEQUENCE') return fail('STEP_TEMPLATE', `No sequence template with the code ${st.templateCode}.`)
      template = String(tpl.id)
    }
    const { templateCode: _drop, ...rest } = st
    steps.push({ ...rest, template, template_hash: null })
  }
  await s.payload.update({ collection: 'crm-sequence-versions', id: String(v.id), data: { steps } as never, ...sys, user: s.user as never })
  return { ok: true, message: 'Draft saved.' }
}
