import type { Payload } from 'payload'
import { lintCopy } from '../../email/copy-lint'
import { scopeRefusal } from '../../email/scope-guard'
import { readEmailConfig } from '../../email/config'
import { choicesOf, fieldsOf, greetingFor, lintTemplate, renderTemplate, responseSentence, SEED_TEMPLATES, SUPERSEDED_SEED_HASHES, templateHash, type MergeValues, type RenderResult, type TemplateText } from '../../email/templates'
import { ersSettings } from '../ers/settings'
import type { Outcome } from '../workspace/mutations'
import { displayNameOf, type CrmSession } from '../workspace/session'

/**
 * Patch C: email templates — seeding, approval, and the merge values for one RFQ.
 *
 * Seeds (T1–T6) are inserted once, unapproved, the first time templates are needed (idempotent: the code is unique).
 * Editing and approving are admin actions, audited; any edit clears the approval (collection hook).
 */
type Doc = Record<string, unknown>
const SLUG = 'crm-email-templates' as never
const sys = { overrideAccess: true as const, depth: 0, context: { crmServer: {} } }
const fail = (code: string, message: string): Outcome => ({ ok: false, code, message })
const NOT_ADMIN = fail('FORBIDDEN', 'Email templates are edited by admins.')

/**
 * Insert any missing seed template (approved when the owner approved its wording: T1–T6 and the E1.1 steps). Safe to
 * call often and from several processes.
 * A stored seed that is still unapproved and exactly an earlier seed (owner rule 2026-10-06; T-R1) or the current seed
 * is brought to the current seed text, approved when the seed is (T-R1: the owner approved T2–T6 on 2026-10-06).
 * Anything edited or already approved is never touched.
 */
export async function ensureTemplates(payload: Payload): Promise<void> {
  const have = await payload.find({ collection: SLUG, limit: 100, depth: 0, overrideAccess: true, pagination: false })
  const stored = new Map((have.docs as unknown as Doc[]).map((d) => [String(d.code), d]))
  for (const t of SEED_TEMPLATES) {
    const old = stored.get(t.code)
    if (old) {
      const { approved, code: _c, name: _n, ...text } = t
      const have = templateHash(textOf(old))
      const unedited = (SUPERSEDED_SEED_HASHES[t.code] ?? []).includes(have) || have === templateHash(text)
      // Never approved and never withdrawn (a withdrawal is marked WITHDRAWN): an admin's decision always stands.
      if (old.approved !== true && old.approved_hash !== WITHDRAWN && unedited) {
        const seal = approved ? { approved: true, approved_hash: templateHash(text), approved_at: new Date().toISOString() } : {}
        await payload.update({ collection: SLUG, id: String(old.id), data: { ...text, ...seal } as never, ...sys }).catch(() => null)
      }
      continue
    }
    try {
      const { approved, ...text } = t
      const seal = approved ? { approved: true, approved_hash: templateHash(text), approved_at: new Date().toISOString() } : { approved: false }
      await payload.create({ collection: SLUG, data: { ...text, locale: 'en', version: 1, ...seal } as never, ...sys })
    } catch {
      // Another process inserted it first (unique code) — fine.
    }
  }
}

/** `approved_hash` of a template whose approval an admin withdrew (fits the column; never a real SHA-256). */
export const WITHDRAWN = 'WITHDRAWN'

export const textOf = (d: Doc): TemplateText => ({ subject: String(d.subject ?? ''), body: String(d.body ?? ''), purpose: String(d.purpose ?? '') })
export const isApproved = (d: Doc): boolean => d.approved === true && d.approved_hash === templateHash(textOf(d))

export async function listTemplates(payload: Payload): Promise<Doc[]> {
  await ensureTemplates(payload)
  const res = await payload.find({ collection: SLUG, sort: 'code', limit: 100, depth: 0, overrideAccess: true, pagination: false })
  return res.docs as unknown as Doc[]
}

export async function templateByCode(payload: Payload, code: string): Promise<Doc | null> {
  await ensureTemplates(payload)
  const res = await payload.find({ collection: SLUG, where: { code: { equals: code } } as never, limit: 1, depth: 0, overrideAccess: true })
  return (res.docs[0] as unknown as Doc | undefined) ?? null
}

export async function saveTemplate(s: CrmSession, input: { id?: string; name?: string; subject?: string; body?: string; purpose?: string }): Promise<Outcome> {
  if (!s.isAdmin) return NOT_ADMIN
  const doc = input.id ? ((await s.payload.findByID({ collection: SLUG, id: input.id, ...sys }).catch(() => null)) as Doc | null) : null
  if (!doc) return fail('NOT_FOUND', 'That template no longer exists.')
  const text: TemplateText = {
    subject: (input.subject ?? '').replace(/\s+/g, ' ').trim(),
    body: (input.body ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim(),
    purpose: input.purpose ?? String(doc.purpose),
  }
  // T1 is the automatic acknowledgement: it stays transactional and keeps its fields' meaning.
  if (doc.code === 'T1' && text.purpose !== 'TRANSACTIONAL') return fail('TEMPLATE_T1_TRANSACTIONAL', 'T1 is the automatic acknowledgement and stays transactional.')
  const problems = lintTemplate(text)
  if (problems.length) return fail(problems[0]!.code, problems.map((p) => p.message).join(' '))
  const name = (input.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || String(doc.name)
  const changed = templateHash(text) !== templateHash(textOf(doc))
  await s.payload.update({ collection: SLUG, id: String(doc.id), data: { name, ...text } as never, ...sys, user: s.user as never })
  return { ok: true, message: changed && doc.approved === true ? 'Saved. The text changed, so it needs approval again before it is used.' : 'Saved.' }
}

export async function setTemplateApproved(s: CrmSession, id: string | undefined, approve: boolean, expectedHash?: string): Promise<Outcome> {
  if (!s.isAdmin) return NOT_ADMIN
  const doc = id ? ((await s.payload.findByID({ collection: SLUG, id, ...sys }).catch(() => null)) as Doc | null) : null
  if (!doc) return fail('NOT_FOUND', 'That template no longer exists.')
  const hash = templateHash(textOf(doc))
  // The admin approves the text they were looking at: if it changed meanwhile, they must look again.
  if (approve && expectedHash && expectedHash !== hash) return fail('STALE', 'The template changed since you opened it. Reload and review it again.')
  if (approve && lintTemplate(textOf(doc)).length) return fail('TEMPLATE_INVALID', 'Fix the template before approving it.')
  // T-R1 (owner condition 2026-10-06): every template stays industrial cooling (no HVAC, residential or small-tower wording).
  const outOfScope = approve ? scopeRefusal(String(doc.subject ?? ''), String(doc.body ?? '')) : null
  if (outOfScope) return fail('TEMPLATE_OUT_OF_SCOPE', outOfScope)
  // Revenue Engine: a sequence template must pass the E1.1 copy-risk linter (BLOCK or REVIEW hits refuse approval).
  if (approve && doc.purpose === 'SEQUENCE') {
    const lint = lintCopy(String(doc.subject), String(doc.body), 'TEMPLATE')
    if (lint.decision === 'HOLD')
      return fail('TEMPLATE_COPY_RISK', `The copy-risk check found ${lint.hits.filter((h) => h.severity === 'BLOCK' || h.severity === 'REVIEW').map((h) => h.rule_id).join(', ')}. Rewrite before approving.`)
  }
  await s.payload.update({
    collection: SLUG,
    id: String(doc.id),
    data: (approve
      ? { approved: true, approved_hash: hash, approved_by: s.user.id, approved_at: new Date().toISOString() }
      : // A withdrawal is marked, so re-seeding never re-approves wording an admin deliberately withdrew (T-R1).
        { approved: false, approved_hash: WITHDRAWN, approved_by: null, approved_at: null }) as never,
    ...sys,
    user: s.user as never,
  })
  return { ok: true, message: approve ? 'Approved. This wording is now used.' : 'Approval withdrawn. The template isn’t used until it is approved again.' }
}

/** Merge values for a reply about one RFQ, written by `sender` (Patch C composer). Missing values stay empty. */
export async function mergeValuesFor(payload: Payload, rfq: Doc, sender: CrmSession['user']): Promise<MergeValues> {
  const submitted = (rfq.submitted ?? {}) as Doc
  let contact: Doc | null = null
  const contactId = rfq.contact && typeof rfq.contact === 'object' ? (rfq.contact as Doc).id : rfq.contact
  if (contactId) contact = (await payload.findByID({ collection: 'crm-contacts', id: String(contactId), depth: 0, overrideAccess: true }).catch(() => null)) as Doc | null
  // The company: the linked account's name when there is one, else what the customer typed.
  let account: Doc | null = null
  const accountId = rfq.account && typeof rfq.account === 'object' ? (rfq.account as Doc).id : rfq.account
  if (accountId) account = (await payload.findByID({ collection: 'crm-accounts', id: String(accountId), depth: 0, overrideAccess: true }).catch(() => null)) as Doc | null
  const ers = await ersSettings(payload)
  const name = displayNameOf(sender)
  return {
    rfq_number: String(rfq.rfq_number ?? ''),
    customer_first_name: String(contact?.first_name ?? submitted.first_name ?? ''),
    greeting: greetingFor(contact?.first_name ?? submitted.first_name),
    company: String(account?.canonical_name ?? submitted.company ?? ''),
    // The fallback "CRM user …" label is not a real name: treat it as missing.
    sales_rep_name: typeof sender.name === 'string' && sender.name.trim() ? name : '',
    sales_rep_title: typeof sender.crm_title === 'string' ? sender.crm_title : '',
    // Owner rule 2026-10-06: the team signature only ("ICS Sales Team" + the sales address); no phone, no address.
    email_signature: [ers.signature.signer, ers.signature.email].filter(Boolean).join('\n'),
    response_sentence: responseSentence(readEmailConfig().responsePromise),
  }
}

export const FIELD_FIX: Record<string, string> = {
  sales_rep_name: 'Add your name to your account.',
  sales_rep_title: 'Add your job title to your account.',
  company: 'This inquiry has no company.',
  rfq_number: 'This inquiry has no RFQ number.',
}

export type Prefill = { ok: true; subject: string; body: string } | { ok: false; message: string; choices?: string[][] }

/** Render an approved template for the composer. A missing field or choice explains what to fix; nothing is guessed. */
export function prefill(doc: Doc, values: MergeValues, choices: string[]): Prefill {
  if (!isApproved(doc)) return { ok: false, message: 'That template isn’t approved yet.' }
  const r: RenderResult = renderTemplate(textOf(doc), values, choices)
  if (r.ok) return { ok: true, subject: r.subject, body: r.text.trimEnd() }
  if (r.code === 'CHOICE_MISSING') return { ok: false, message: 'Pick the options for this template.', choices: choicesOf(textOf(doc)) }
  if (r.code === 'MERGE_FIELD_MISSING')
    return { ok: false, message: `This template can’t be used yet: ${r.missing.map((m) => FIELD_FIX[m] ?? `${m} is missing.`).join(' ')}` }
  return { ok: false, message: 'That template can’t be used.' }
}

export { fieldsOf }

/** Patch C composer: the templates a person may start a reply from (approved, transactional, not the automatic T1). */
export type ComposerTemplates = {
  options: Array<{ code: string; name: string; choices: string[][] }>
  picked: { code: string; choices: string[]; result: Prefill } | null
}

export async function composerTemplates(s: CrmSession, rfq: Doc, picked: { code?: string; choices: string[] }): Promise<ComposerTemplates> {
  const all = await listTemplates(s.payload)
  const usable = all.filter((d) => d.code !== 'T1' && d.purpose === 'TRANSACTIONAL' && isApproved(d))
  const options = usable.map((d) => ({ code: String(d.code), name: String(d.name), choices: choicesOf(textOf(d)) }))
  const doc = picked.code ? usable.find((d) => d.code === picked.code) : undefined
  if (!doc) return { options, picked: null }
  return { options, picked: { code: String(doc.code), choices: picked.choices, result: prefill(doc, await mergeValuesFor(s.payload, rfq, s.user), picked.choices) } }
}
