import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * IMPORT-GUARD-1 (Security Auditor item 8, GO contract): a contact import never queues email and never enrolls anyone, whatever the email mode.
 *
 * The operator import paths (legacy contacts, Typeform) run inside `runAsImport`. The two write paths that could reach a person, the outgoing
 * email queue and sequence enrollments, refuse every create while this run is on the stack (see `refuseWhenImporting`, called from the
 * collections' beforeChange hooks). AsyncLocalStorage is per async call chain: a real RFQ arriving in another request while an import runs has
 * its own (empty) store, so it queues its alert and acknowledgement exactly as always.
 */
const store = new AsyncLocalStorage<{ import: true }>()

export const runAsImport = <T>(fn: () => Promise<T>): Promise<T> => store.run({ import: true }, fn)
export const inImportRun = (): boolean => store.getStore() !== undefined

/** For the outbox and enrollment hooks: throws when the create comes from inside an import run. */
export function refuseWhenImporting(operation: string, make: (code: string, message: string) => Error): void {
  if (operation === 'create' && inImportRun()) throw make('IMPORT_MAY_NOT_QUEUE', 'A contact import cannot queue email or enroll anyone.')
}
