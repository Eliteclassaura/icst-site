import type { AmountStatus, OpportunityStage, RevenueTruthState } from './vocabulary'

/**
 * Opportunity economics (E3 `opportunity_economics.json`, `revenue_truth.json`, `currency_fx_contract.json`).
 *
 * The rules, stated once and enforced everywhere they matter:
 *
 *   - UNKNOWN amount is not zero. A missing amount is `null` with a non-KNOWN `amount_status`.
 *   - An explicit zero is allowed only with `amount_status = KNOWN` **and** `source_record_explicit_zero`.
 *   - A KNOWN amount needs a currency. UNKNOWN currency is not USD; there is no default currency.
 *   - Probability is forecast-only and nullable. UNKNOWN probability is not 0 %.
 *   - Only WON + KNOWN + `revenue_verification_state = CONFIRMED` is confirmed revenue. RFQ, reply, click,
 *     open and pipeline value are never revenue.
 *   - Different currencies are never summed. Without an explicit FX source the normalised total is UNKNOWN.
 */

export type Economics = {
  amount?: number | null
  amount_status?: AmountStatus | null
  currency?: string | null
  source_record_explicit_zero?: boolean | null
  probability?: number | null
  stage?: OpportunityStage | null
  revenue_verification_state?: string | null
}

export type EconomicsProblem =
  | 'AMOUNT_WITHOUT_KNOWN_STATUS'
  | 'KNOWN_STATUS_WITHOUT_AMOUNT'
  | 'KNOWN_AMOUNT_WITHOUT_CURRENCY'
  | 'CURRENCY_MALFORMED'
  | 'NEGATIVE_AMOUNT'
  | 'ZERO_WITHOUT_EXPLICIT_SOURCE'
  | 'PROBABILITY_OUT_OF_RANGE'
  | 'CONFIRMED_REVENUE_REQUIRES_WON_AND_KNOWN'

export function economicsProblems(e: Economics): EconomicsProblem[] {
  const p: EconomicsProblem[] = []
  const has = e.amount !== null && e.amount !== undefined
  const status = e.amount_status ?? 'UNKNOWN'
  if (has && status !== 'KNOWN') p.push('AMOUNT_WITHOUT_KNOWN_STATUS')
  if (!has && status === 'KNOWN') p.push('KNOWN_STATUS_WITHOUT_AMOUNT')
  if (has && (e.amount as number) < 0) p.push('NEGATIVE_AMOUNT')
  if (has && e.amount === 0 && e.source_record_explicit_zero !== true) p.push('ZERO_WITHOUT_EXPLICIT_SOURCE')
  if (e.currency !== null && e.currency !== undefined && e.currency !== '' && !/^[A-Z]{3}$/.test(e.currency))
    p.push('CURRENCY_MALFORMED')
  if (status === 'KNOWN' && (e.currency === null || e.currency === undefined || e.currency === ''))
    p.push('KNOWN_AMOUNT_WITHOUT_CURRENCY')
  if (e.probability !== null && e.probability !== undefined && (e.probability < 0 || e.probability > 100))
    p.push('PROBABILITY_OUT_OF_RANGE')
  if (e.revenue_verification_state === 'CONFIRMED' && (e.stage !== 'WON' || status !== 'KNOWN'))
    p.push('CONFIRMED_REVENUE_REQUIRES_WON_AND_KNOWN')
  return p
}

export function outcomeFor(
  stage: OpportunityStage | null | undefined,
): 'OPEN' | 'WON' | 'LOST' | 'CANCELLED' | 'UNKNOWN' {
  if (!stage) return 'UNKNOWN'
  if (stage === 'WON' || stage === 'LOST' || stage === 'CANCELLED') return stage
  return 'OPEN'
}

/** E3 revenue-truth state, derived — never entered. */
export function revenueTruthFor(e: Economics): RevenueTruthState {
  const status = e.amount_status ?? 'UNKNOWN'
  if (e.stage === 'LOST') return 'LOST_NO_REVENUE'
  if (e.stage === 'CANCELLED') return 'CANCELLED_NO_REVENUE'
  if (e.stage === 'WON' && status === 'KNOWN' && e.revenue_verification_state === 'CONFIRMED')
    return 'WON_REVENUE_CONFIRMED'
  if (status === 'KNOWN') return 'OPPORTUNITY_VALUE_KNOWN'
  if (status === 'NOT_ENTERED') return 'VALUE_NOT_ENTERED'
  if (status === 'WITHHELD_OR_NOT_AVAILABLE') return 'VALUE_WITHHELD_OR_NOT_AVAILABLE'
  return 'REVENUE_UNKNOWN'
}

/**
 * Display string for an amount. Unknown is **said**, never shown as `$0`. No currency symbol is invented:
 * the ISO code is shown as stored.
 */
export function amountDisplay(e: Economics): string {
  const status = e.amount_status ?? 'UNKNOWN'
  if (status === 'NOT_ENTERED') return 'Value not entered'
  if (status === 'WITHHELD_OR_NOT_AVAILABLE') return 'Value withheld / not available'
  if (status !== 'KNOWN' || e.amount === null || e.amount === undefined) return 'Value unknown'
  if (!e.currency) return 'Value unknown (no currency)'
  const n = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(e.amount)
  return e.amount === 0 ? `${e.currency} 0 (explicit zero)` : `${e.currency} ${n}`
}

/**
 * Pipeline totals, per native currency. Unknown values are **counted, not summed as zero**, and no FX
 * conversion is performed (E3: FX source and base currency are owner inputs). There is no cross-currency
 * total here by design.
 */
export function pipelineByCurrency(rows: readonly Economics[]): {
  byCurrency: Record<string, { total: number; count: number }>
  unknownValueCount: number
  explicitZeroCount: number
} {
  const byCurrency: Record<string, { total: number; count: number }> = {}
  let unknownValueCount = 0
  let explicitZeroCount = 0
  for (const r of rows) {
    if ((r.amount_status ?? 'UNKNOWN') !== 'KNOWN' || r.amount == null || !r.currency) {
      unknownValueCount++
      continue
    }
    if (r.amount === 0) explicitZeroCount++
    const slot = (byCurrency[r.currency] ??= { total: 0, count: 0 })
    slot.total += r.amount
    slot.count++
  }
  return { byCurrency, unknownValueCount, explicitZeroCount }
}

/**
 * Confirmed revenue per currency. Each opportunity counts **once**, however many touches, activities or
 * attribution rows point at it (E3 multi-touch dedupe): the input is keyed by opportunity id.
 */
export function confirmedRevenueByCurrency(
  rows: ReadonlyArray<Economics & { id: string }>,
): Record<string, number> {
  const seen = new Set<string>()
  const out: Record<string, number> = {}
  for (const r of rows) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    if (revenueTruthFor(r) !== 'WON_REVENUE_CONFIRMED' || !r.currency || r.amount == null) continue
    out[r.currency] = (out[r.currency] ?? 0) + r.amount
  }
  return out
}
