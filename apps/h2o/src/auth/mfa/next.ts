/** Where to go after two-factor: only an admin or CRM path, never another origin or a traversal. */
const SAFE = /^\/(admin|crm)(\/[A-Za-z0-9_\-./]*)?$/
export function safeNext(raw: unknown, fallback = '/crm/'): string {
  if (typeof raw !== 'string' || !SAFE.test(raw) || raw.includes('//') || raw.includes('..') || raw.startsWith('/crm/mfa')) return fallback
  return raw
}
