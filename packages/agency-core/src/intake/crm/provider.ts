/**
 * CrmProvider — the seam for HubSpot/Pipedrive sync (docs/crm-sync.md, ADR planned for Release 7).
 * C6 ships the interface and the mock. Field allow-list is the whole contract: nothing outside it
 * (honeypot, IP hash, spam internals, notes) can ever reach a third party (R45).
 */
export type CrmContactPayload = {
  email: string
  name?: string
  company?: string
  website?: string
  source: 'form' | 'chat' | 'roadmap' | 'newsletter' | 'referral' | 'manual' | 'outbound'
  landingPage?: string
  utm?: Record<string, string>
  consentMarketing: boolean
}

export type CrmSyncResult =
  | { ok: true; externalId: string; provider: string; created: boolean }
  | { ok: false; provider: string; error: string; retryable: boolean }

export interface CrmProvider {
  readonly name: string
  /** Upsert by email. Must be idempotent: the same payload twice returns the same externalId. */
  upsertContact(payload: CrmContactPayload, opts: { idempotencyKey: string }): Promise<CrmSyncResult>
}

/** Allow-list projection from a lead + contact to the CRM payload. Anything not listed here is never sent. */
export function toCrmPayload(input: {
  email: string
  name?: string | null
  company?: string | null
  website?: string | null
  source: CrmContactPayload['source']
  landingPage?: string | null
  utm?: unknown
  marketing?: boolean | null
}): CrmContactPayload {
  const utm =
    input.utm && typeof input.utm === 'object'
      ? Object.fromEntries(
          Object.entries(input.utm as Record<string, unknown>)
            .filter(([k, v]) => /^utm_[a-z]+$/.test(k) && typeof v === 'string')
            .map(([k, v]) => [k, String(v).slice(0, 200)]),
        )
      : undefined
  return {
    email: input.email,
    name: input.name ?? undefined,
    company: input.company ?? undefined,
    website: input.website ?? undefined,
    source: input.source,
    landingPage: input.landingPage ?? undefined,
    utm,
    consentMarketing: Boolean(input.marketing),
  }
}

/** Mock provider: deterministic ids, in-memory store, no network. Used in dev, tests and CI. */
export class MockCrmProvider implements CrmProvider {
  readonly name = 'mock'
  private store = new Map<string, { id: string; payload: CrmContactPayload }>()
  private seen = new Map<string, string>()
  async upsertContact(payload: CrmContactPayload, opts: { idempotencyKey: string }): Promise<CrmSyncResult> {
    const prior = this.seen.get(opts.idempotencyKey)
    if (prior) return { ok: true, externalId: prior, provider: this.name, created: false }
    const existing = this.store.get(payload.email)
    const id = existing?.id ?? `mock-${hash(payload.email)}`
    this.store.set(payload.email, { id, payload })
    this.seen.set(opts.idempotencyKey, id)
    return { ok: true, externalId: id, provider: this.name, created: !existing }
  }
}

function hash(s: string) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h.toString(16).padStart(8, '0')
}

export function crmProviderFor(name: string | null | undefined): CrmProvider | null {
  if (!name || name === 'none') return null
  if (name === 'mock') return new MockCrmProvider()
  return null // hubspot / pipedrive arrive in Release 7 behind this switch
}
