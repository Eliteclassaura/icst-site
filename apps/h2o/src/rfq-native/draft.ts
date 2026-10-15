/**
 * Native RFQ: the session draft (contract §4: `<namespace>.rfq.draft.v1` = { submissionId, registryVersion, step, answers, source }).
 * Held in this tab's sessionStorage so the visitor can close the panel and continue; never sent before "Send request";
 * cleared once the request is sent. The submissionId changes only on "Start over" (or a server SUBMISSION_CONFLICT).
 */
import type { Answers } from './flow'
import type { RfqSource } from './submission'
import { STORAGE_NAMESPACE } from '../client/storage-namespace'

export const DRAFT_KEY = `${STORAGE_NAMESPACE}.rfq.draft.v1`
export type Draft = { submissionId: string; registryVersion: string; step: 'purpose' | 'details' | 'contact' | 'review' | 'confirm'; answers: Answers; source: RfqSource }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined

export function loadDraft(store: Store): Draft | null {
  try {
    const raw = store?.getItem(DRAFT_KEY)
    const d = raw ? (JSON.parse(raw) as Partial<Draft>) : null
    return d && typeof d.submissionId === 'string' && typeof d.registryVersion === 'string' && d.answers && typeof d.answers === 'object' ? (d as Draft) : null
  } catch {
    return null
  }
}
export function saveDraft(store: Store, draft: Draft): void {
  try {
    store?.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* storage full or blocked: the draft lives in memory only */
  }
}
export function clearDraft(store: Store): void {
  try {
    store?.removeItem(DRAFT_KEY)
  } catch {
    /* nothing to clear */
  }
}
