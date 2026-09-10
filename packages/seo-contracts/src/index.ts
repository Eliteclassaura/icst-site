import type { z } from 'zod'
export * from './common'
export * from './page-decisions'
export * from './qa-report'
export * from './deploy-event'
export * from './evidence-bundle'
export * from './blueprint'
import { pageDecisions } from './page-decisions'
import { qaReport } from './qa-report'
import { deployEvent } from './deploy-event'
import { evidenceBundle } from './evidence-bundle'
import { blueprint } from './blueprint'

export const CONTRACTS = {
  'factory.seo/page-decisions': pageDecisions,
  'factory.seo/qa-report': qaReport,
  'factory.seo/deploy-event': deployEvent,
  'factory.seo/evidence-bundle': evidenceBundle,
  'factory.seo/blueprint': blueprint,
} as const
export type ContractName = keyof typeof CONTRACTS

export type ValidationIssue = { path: string; message: string }
export type Validation<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] }

/** Validate a parsed JSON document against a named contract; issues carry JSON-pointer paths. */
export function validate<K extends ContractName>(
  name: K,
  doc: unknown,
): Validation<z.infer<(typeof CONTRACTS)[K]>> {
  const r = CONTRACTS[name].safeParse(doc)
  if (r.success) return { ok: true, value: r.data as z.infer<(typeof CONTRACTS)[K]> }
  return {
    ok: false,
    issues: r.error.issues.map((i) => ({ path: '/' + i.path.map(String).join('/'), message: i.message })),
  }
}

/** Picks the contract from the document itself (`contract` for envelopes, `version` for blueprints). */
export function detectContract(doc: unknown): ContractName | null {
  if (!doc || typeof doc !== 'object') return null
  const d = doc as Record<string, unknown>
  if (typeof d.contract === 'string' && d.contract in CONTRACTS) return d.contract as ContractName
  if (d.version === 2 && Array.isArray(d.pages)) return 'factory.seo/blueprint'
  return null
}
