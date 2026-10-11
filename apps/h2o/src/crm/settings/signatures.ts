import type { Payload } from 'payload'
import { STANDARD_SIGNATURE_DEFAULT } from '../globals/signatures'
import { sanitizeSignature } from '../signatureText'
import { ersSettings } from '../ers/settings'
import type { Outcome } from '../workspace/mutations'
import type { CrmSession } from '../workspace/session'

/**
 * SIGNATURES-1 (owner 2026-10-09): email signatures. One organisation STANDARD signature (admin-editable, pre-seeded
 * "ICS Sales Team") and an optional signature per person with a "use the standard one" switch (on by default).
 *
 * Resolution for a manual reply: the sender's own signature when they have turned "use the standard" OFF and wrote one,
 * otherwise the standard. A sequence email has no sending person (the shared sending profile), so it always uses the
 * standard. If the standard were ever empty it falls back to the Revenue Engine settings' team lines, then to "ICS Sales
 * Team", so nothing is ever held for a missing signature.
 *
 * Plain text only (the send path is plain text; the HTML part is made from these words). A signature never carries a
 * phone number or street address by default; typing one gets a gentle advisory, not a block (the owner decides).
 */
type Doc = Record<string, unknown>
const fail = (code: string, message: string, extra: Partial<Extract<Outcome, { ok: false }>> = {}): Outcome => ({ ok: false, code, message, ...extra }) as Outcome

export { addressPhoneWarnings, sanitizeSignature, SIGNATURE_MAX_CHARS, SIGNATURE_MAX_LINE, SIGNATURE_MAX_LINES, type Sanitized } from '../signatureText'

/** The organisation's standard signature as stored (never empty: the migration seeds it, and this falls back if it is blank). */
export async function loadStandard(payload: Payload): Promise<string> {
  try {
    const g = (await payload.findGlobal({ slug: 'crm-signatures' as never, depth: 0, overrideAccess: true })) as unknown as Doc
    const t = typeof g.standard_text === 'string' ? g.standard_text.trim() : ''
    if (t) return t
  } catch {
    // fall through to the defaults
  }
  try {
    const e = await ersSettings(payload)
    const legacy = [e.signature.signer, e.signature.email].filter(Boolean).join('\n')
    if (legacy.trim()) return legacy
  } catch {
    // fall through
  }
  return STANDARD_SIGNATURE_DEFAULT.split('\n')[0]!
}

export type SignatureUsed = { text: string; source: 'USER' | 'STANDARD'; label: string }

/** Which signature a message from `userId` (or from the shared sending profile, `null`) carries. */
export async function resolveSignature(payload: Payload, userId: string | number | null | undefined): Promise<SignatureUsed> {
  const standard = await loadStandard(payload)
  if (userId !== null && userId !== undefined && userId !== '') {
    const u = (await payload.findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true }).catch(() => null)) as Doc | null
    const own = typeof u?.signature_text === 'string' ? u.signature_text.trim() : ''
    if (u && u.signature_use_standard === false && own) return { text: own, source: 'USER', label: 'your own signature' }
  }
  return { text: standard, source: 'STANDARD', label: 'the standard signature' }
}

/** The merge values for the two signature fields, for a preview or a send. `userId` null = a sequence (the standard). */
export async function signatureMergeValues(payload: Payload, userId: string | number | null | undefined): Promise<{ email_signature: string; sequence_signature: string; used: SignatureUsed }> {
  const used = await resolveSignature(payload, userId)
  return { email_signature: used.text, sequence_signature: (await resolveSignature(payload, null)).text, used }
}

async function audit(payload: Payload, e: { action: string; collection: string; docId: string; actorId: string; detail: Doc }): Promise<boolean> {
  try {
    await payload.create({
      collection: 'audit-log',
      data: { action: e.action, collection: e.collection, docId: e.docId, changedKeys: Object.keys(e.detail), summary: null, actor: e.actorId, actorEmail: null, ip: null, detail: e.detail } as never,
      overrideAccess: true,
    })
    return true
  } catch (err) {
    payload.logger.error({ code: 'CRM_SIGNATURE_AUDIT_FAILED', errName: (err as Error)?.name })
    return false
  }
}

export type SaveOutcome = Outcome & { warnings?: string[] }
const withWarnings = (m: string, w: string[]): string => (w.length ? `${m} ${w.join(' ')}` : m)

/** Admin: change the organisation's standard signature. Audited with lengths only. A blank value restores the default. */
export async function saveStandard(s: CrmSession, input: { text?: unknown }): Promise<SaveOutcome> {
  if (!s.isAdmin) return fail('FORBIDDEN', 'The standard signature is changed by admins.')
  const clean = sanitizeSignature(input.text)
  if (!clean.ok) return fail(clean.code, clean.message)
  const text = clean.value.text || STANDARD_SIGNATURE_DEFAULT
  const before = await loadStandard(s.payload)
  if (before === text) return { ok: true, message: withWarnings('The standard signature is already this.', clean.value.warnings), warnings: clean.value.warnings }
  if (!(await audit(s.payload, { action: 'signature-standard-updated', collection: 'crm-signatures', docId: 'global', actorId: s.userId, detail: { from_length: before.length, to_length: text.length } })))
    return fail('AUDIT_FAILED', 'Not saved: the change could not be recorded. Try again in a moment.')
  await s.payload.updateGlobal({ slug: 'crm-signatures' as never, data: { standard_text: text } as never, depth: 0, overrideAccess: true, context: { crmServer: {} } })
  return { ok: true, message: withWarnings('Saved. The standard signature is used from the next email.', clean.value.warnings), warnings: clean.value.warnings }
}

/** Save a person's own signature and their "use the standard" switch. Self, or an admin for anyone; never one sales user for another. */
export async function saveUserSignature(s: CrmSession, input: { userId?: unknown; text?: unknown; useStandard?: unknown }): Promise<SaveOutcome> {
  const target = typeof input.userId === 'string' && input.userId ? input.userId : s.userId
  if (target !== s.userId && !s.isAdmin) return fail('FORBIDDEN', 'You can change your own signature only.')
  const clean = sanitizeSignature(input.text)
  if (!clean.ok) return fail(clean.code, clean.message)
  const useStandard = input.useStandard === true || input.useStandard === 'on' || input.useStandard === 'true' || input.useStandard === '1'
  if (!useStandard && !clean.value.text) return fail('SIGNATURE_EMPTY', 'Type your signature, or switch on “Use the standard signature”.', { fields: { text: 'Type your signature or use the standard one.' } })
  const u = (await s.payload.findByID({ collection: 'users', id: target, depth: 0, overrideAccess: true }).catch(() => null)) as Doc | null
  if (!u) return fail('NOT_FOUND', 'That person was not found.')
  const wasText = typeof u.signature_text === 'string' ? u.signature_text : ''
  const wasStd = u.signature_use_standard !== false
  if (wasText === clean.value.text && wasStd === useStandard) return { ok: true, message: withWarnings('Nothing changed.', clean.value.warnings), warnings: clean.value.warnings }
  if (!(await audit(s.payload, { action: 'signature-user-updated', collection: 'users', docId: target, actorId: s.userId, detail: { from_length: wasText.length, to_length: clean.value.text.length, use_standard: useStandard, by: target === s.userId ? 'self' : 'admin' } })))
    return fail('AUDIT_FAILED', 'Not saved: the change could not be recorded. Try again in a moment.')
  await s.payload.update({ collection: 'users', id: target, data: { signature_text: clean.value.text, signature_use_standard: useStandard } as never, depth: 0, overrideAccess: true, context: { crmServer: {} } })
  return { ok: true, message: withWarnings(useStandard ? 'Saved. Your emails use the standard signature.' : 'Saved. Your emails use your own signature.', clean.value.warnings), warnings: clean.value.warnings }
}

export type SignatureRow = { id: string; name: string; roles: string[]; useStandard: boolean; text: string }

/** Admin: every CRM user's signature state, for the Signatures page. */
export async function listUserSignatures(s: CrmSession): Promise<SignatureRow[]> {
  if (!s.isAdmin) return []
  const res = await s.payload.find({ collection: 'users', where: { roles: { in: ['platform-admin', 'client-admin', 'sales'] } } as never, limit: 100, sort: 'name', depth: 0, overrideAccess: true })
  return (res.docs as unknown as Doc[]).map((u) => ({
    id: String(u.id),
    name: typeof u.name === 'string' && u.name.trim() ? u.name.trim() : 'CRM user',
    roles: Array.isArray(u.roles) ? (u.roles as string[]) : [],
    useStandard: u.signature_use_standard !== false,
    text: typeof u.signature_text === 'string' ? u.signature_text : '',
  }))
}
