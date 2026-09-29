import type { PayloadRequest } from 'payload'
import {
  REASONS_NEVER_CLEARABLE,
  REASONS_REQUIRING_RECONSENT_TO_CLEAR,
  SUPPRESSION_PRECEDENCE,
  type SuppressionReason,
} from './vocabulary'

/**
 * Suppression evaluation — pure, and the only place "can this address be emailed?" is answered.
 *
 * The ledger (`crm-suppressions`) is append-only: an APPLY row records a suppression; a CLEAR row records
 * a privileged, evidenced clearing of one specific APPLY row. Nothing is ever deleted or edited, so a
 * migration of sequences, mail servers or salespeople cannot lose it (E0.1 migration_rules), and the answer
 * is keyed on the address identity (`email_match_key`), not on a contact row, a mailbox or a sending domain.
 *
 * CRM-1 sends nothing. This function exists so the future runtime has exactly one gate to call, and so the
 * tests can prove that gate is fail-closed today.
 */

export type LedgerRow = {
  id: string
  action: 'APPLY' | 'CLEAR'
  reason: SuppressionReason
  scope: 'MARKETING_EMAIL' | 'ALL_EMAIL' | 'ALL_OUTREACH'
  clears?: string | { id: string } | null
}

export type Purpose =
  | 'PERSONAL'
  | 'ACCOUNT_RELATIONSHIP'
  | 'SALES_RECONNECT'
  | 'SEQUENCE_OUTREACH'
  | 'BROADCAST'
  | 'TRANSACTIONAL'

export type ContactEligibility = {
  marketing_eligibility?: string | null
  jurisdiction?: string | null
  relationship_evidence?: string | null
}

const clearedId = (row: LedgerRow): string | null =>
  row.clears == null ? null : typeof row.clears === 'string' ? row.clears : String(row.clears.id)

/** APPLY rows not validly cleared. A CLEAR of a never-clearable reason is ignored (it cannot clear). */
export function activeFromLedger(rows: readonly LedgerRow[]): LedgerRow[] {
  const applies = new Map(rows.filter((r) => r.action === 'APPLY').map((r) => [String(r.id), r]))
  for (const r of rows) {
    if (r.action !== 'CLEAR') continue
    const target = applies.get(clearedId(r) ?? '')
    if (!target || REASONS_NEVER_CLEARABLE.includes(target.reason)) continue
    applies.delete(String(target.id))
  }
  return [...applies.values()].sort(
    (a, b) => SUPPRESSION_PRECEDENCE[a.reason] - SUPPRESSION_PRECEDENCE[b.reason],
  )
}

export type SendDecision = { allowed: false; blockedBy: string[] } | { allowed: true }

/**
 * Would a message of `purpose` be permitted to this address? Fail-closed on every unknown:
 *
 *   - any active DO_NOT_CONTACT / LEGAL_PROHIBITION / HARD_BOUNCE / INVALID_ADDRESS → everything blocked;
 *   - ALL_EMAIL / ALL_OUTREACH scope → everything blocked;
 *   - any active MARKETING_EMAIL-scope suppression → every non-TRANSACTIONAL purpose blocked;
 *   - non-transactional purposes additionally require marketing_eligibility = ELIGIBLE and a resolved
 *     jurisdiction — UNKNOWN consent is not consent;
 *   - TRANSACTIONAL is only ever *not blocked by suppression*; whether a transaction is active is a later
 *     runtime check, so this returns `allowed: false` with `TRANSACTIONAL_REQUIRES_ACTIVE_TRANSACTION`.
 *
 * In CRM-1 the transport does not exist, so `allowed: true` is reachable only in tests.
 */
export function evaluateSend(
  ledger: readonly LedgerRow[],
  contact: ContactEligibility,
  purpose: Purpose,
): SendDecision {
  const active = activeFromLedger(ledger)
  const blocked: string[] = []
  for (const r of active) {
    const hard = ['DO_NOT_CONTACT', 'LEGAL_PROHIBITION', 'HARD_BOUNCE', 'INVALID_ADDRESS'].includes(r.reason)
    if (hard || r.scope !== 'MARKETING_EMAIL') blocked.push(`SUPPRESSED_${r.reason}`)
    else if (purpose !== 'TRANSACTIONAL') blocked.push(`SUPPRESSED_${r.reason}`)
  }
  if (purpose === 'TRANSACTIONAL') {
    blocked.push('TRANSACTIONAL_REQUIRES_ACTIVE_TRANSACTION')
    return { allowed: false, blockedBy: blocked }
  }
  if (contact.marketing_eligibility !== 'ELIGIBLE')
    blocked.push(`ELIGIBILITY_${contact.marketing_eligibility ?? 'UNKNOWN'}`)
  const j = contact.jurisdiction ?? 'COUNTRY_UNKNOWN'
  if (j === 'COUNTRY_UNKNOWN' || j === 'LEGAL_REVIEW_REQUIRED') blocked.push(`JURISDICTION_${j}`)
  return blocked.length > 0 ? { allowed: false, blockedBy: blocked } : { allowed: true }
}

/** Is a CLEAR of this reason permitted at all, and does it require re-consent evidence? */
export function clearRule(
  reason: SuppressionReason,
): 'NEVER' | 'RECONSENT_REQUIRED' | 'PRIVILEGED_WITH_REASON' {
  if (REASONS_NEVER_CLEARABLE.includes(reason)) return 'NEVER'
  if (REASONS_REQUIRING_RECONSENT_TO_CLEAR.includes(reason)) return 'RECONSENT_REQUIRED'
  return 'PRIVILEGED_WITH_REASON'
}

export async function ledgerFor(req: PayloadRequest, emailMatchKey: string): Promise<LedgerRow[]> {
  const res = await req.payload.find({
    collection: 'crm-suppressions',
    where: { email_match_key: { equals: emailMatchKey } },
    depth: 0,
    limit: 1000,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return res.docs as unknown as LedgerRow[]
}

export async function activeSuppressionsFor(
  req: PayloadRequest,
  emailMatchKey: string,
): Promise<LedgerRow[]> {
  return activeFromLedger(await ledgerFor(req, emailMatchKey))
}
