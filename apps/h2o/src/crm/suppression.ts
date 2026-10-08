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
  /** SEC-CRM-1: where the row came from (a DSN-recorded hard bounce is admin-clearable; see `canClear`). */
  source?: string | null
  source_event_id?: string | null
}

/** SEC-CRM-1: the source-event prefix of a hard bounce recorded from an inbound delivery report (crm/inbound.ts). */
export const DSN_EVENT_PREFIX = 'dsn:'

/**
 * Can a CLEAR take this APPLY row off? Never for HARD_BOUNCE / INVALID_ADDRESS (E0.1), except a hard bounce that came
 * from an inbound delivery report (SEC-CRM-1: a report is mail from outside, so an admin can correct it, with a
 * written reason — the CLEAR row and its timeline entry are the audit trail). A bounce refused by our own mail
 * server at send time (source_event_id `send:…`) stays never-clearable.
 */
export function canClear(row: Pick<LedgerRow, 'reason' | 'source' | 'source_event_id'>): boolean {
  if (!REASONS_NEVER_CLEARABLE.includes(row.reason)) return true
  return row.reason === 'HARD_BOUNCE' && row.source === 'PROVIDER_EVENT' && typeof row.source_event_id === 'string' && row.source_event_id.startsWith(DSN_EVENT_PREFIX)
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
    if (!target || !canClear(target)) continue
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

/**
 * CRM email M1: a TRANSACTIONAL message about a transaction that exists (the acknowledgement of an RFQ the
 * person just submitted). `evaluateSend` deliberately cannot answer this — it does not know whether a
 * transaction is active — so the caller states it, and only the suppression ledger is consulted:
 *
 *   - any active DO_NOT_CONTACT / LEGAL_PROHIBITION / HARD_BOUNCE / INVALID_ADDRESS → blocked;
 *   - any active ALL_EMAIL / ALL_OUTREACH scope → blocked;
 *   - a MARKETING_EMAIL-scope suppression does not block a transactional message;
 *   - no active transaction → blocked (fail closed).
 */
export function evaluateTransactionalSend(
  ledger: readonly LedgerRow[],
  activeTransaction: boolean,
): SendDecision {
  const blocked: string[] = []
  for (const r of activeFromLedger(ledger)) {
    const hard = ['DO_NOT_CONTACT', 'LEGAL_PROHIBITION', 'HARD_BOUNCE', 'INVALID_ADDRESS'].includes(r.reason)
    if (hard || r.scope !== 'MARKETING_EMAIL') blocked.push(`SUPPRESSED_${r.reason}`)
  }
  if (!activeTransaction) blocked.push('TRANSACTIONAL_REQUIRES_ACTIVE_TRANSACTION')
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

/** SEC-CRM-1: the clear rule for one APPLY row (a DSN-recorded hard bounce: admin with a written reason). */
export function clearRuleFor(
  row: Pick<LedgerRow, 'reason' | 'source' | 'source_event_id'>,
): 'NEVER' | 'RECONSENT_REQUIRED' | 'PRIVILEGED_WITH_REASON' {
  if (!canClear(row)) return 'NEVER'
  if (REASONS_NEVER_CLEARABLE.includes(row.reason)) return 'PRIVILEGED_WITH_REASON'
  if (REASONS_REQUIRING_RECONSENT_TO_CLEAR.includes(row.reason)) return 'RECONSENT_REQUIRED'
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
