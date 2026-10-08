/**
 * SHEET-SYNC-1: configuration for appending every new website RFQ to a Google Sheet.
 *
 *   H2O_SHEETS_SA_KEY_B64       the service account's JSON key, base64 (a secret: never logged, never returned, never stored)
 *   H2O_SHEETS_SPREADSHEET_ID   the sheet's id (the part of its URL between /d/ and /edit)
 *   H2O_SHEETS_TAB              the tab the rows go to (default "Website RFQs")
 *
 * Either of the first two unset (or unusable) = the feature is OFF: nothing is queued, nothing is sent. Problems are
 * reported as codes only (`errors`); the key's content is never part of a message.
 */
export type ServiceAccount = { client_email: string; private_key: string }
export type SheetsConfig = { enabled: boolean; sa?: ServiceAccount; spreadsheetId?: string; tab: string; errors: string[] }

export const DEFAULT_TAB = 'Website RFQs'
const SHEET_ID = /^[A-Za-z0-9_-]{20,100}$/
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export function readSheetsConfig(env: NodeJS.ProcessEnv = process.env): SheetsConfig {
  const raw = env.H2O_SHEETS_SA_KEY_B64?.trim()
  const id = env.H2O_SHEETS_SPREADSHEET_ID?.trim()
  const tab = (env.H2O_SHEETS_TAB?.trim() || DEFAULT_TAB).slice(0, 100)
  if (!raw || !id) return { enabled: false, tab, errors: [] }
  const errors: string[] = []
  let sa: ServiceAccount | undefined
  try {
    const j = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as Record<string, unknown>
    if (typeof j.client_email === 'string' && EMAIL.test(j.client_email) && typeof j.private_key === 'string' && /BEGIN (RSA )?PRIVATE KEY/.test(j.private_key)) sa = { client_email: j.client_email, private_key: j.private_key }
    else errors.push('SHEETS_KEY_INVALID')
  } catch {
    errors.push('SHEETS_KEY_INVALID')
  }
  if (!SHEET_ID.test(id)) errors.push('SHEETS_SPREADSHEET_ID_INVALID')
  if ([...tab].some((c) => c.charCodeAt(0) < 32)) errors.push('SHEETS_TAB_INVALID')
  return errors.length ? { enabled: false, tab, errors } : { enabled: true, sa, spreadsheetId: id, tab, errors }
}
