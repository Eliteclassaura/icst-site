import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { LayoutBlockData } from '@factory/agency-core/blocks'
import { clientsRoot } from './content'

/**
 * Cookie notice driven by an inventory file: `clients/<slug>/cookies/inventory.json`. The notice page contains a `cookieInventory` block;
 * at render time it becomes a table of exactly what the inventory lists, so the notice cannot drift from the real cookie list.
 *
 * `status` is `PENDING_REAL_LIST` until the people who know the real cookies fill the file and set `APPROVED`. Under the production policy a
 * pending inventory fails the render (COPY_PENDING_APPROVAL), like the quote-form notice: an empty or guessed list must not be published.
 */
export const CATEGORIES = ['essential', 'functional', 'analytics', 'marketing'] as const
export type CookieEntry = { name: string; provider: string; purpose: string; category: (typeof CATEGORIES)[number]; duration: string; firstParty: boolean }
export const PENDING_STATUSES = ['PENDING_REAL_LIST', 'PENDING_OWNER_COUNSEL_REVIEW'] as const
export type CookieInventory = { status: (typeof PENDING_STATUSES)[number] | 'APPROVED'; reviewedOn: string | null; cookies: CookieEntry[] }

export function validateInventory(raw: unknown): { ok: true; inventory: CookieInventory } | { ok: false; issues: string[] } {
  const issues: string[] = []
  const o = raw as Record<string, unknown> | null
  if (!o || typeof o !== 'object') return { ok: false, issues: ['must be an object'] }
  if (!([...PENDING_STATUSES, 'APPROVED'] as unknown[]).includes(o.status)) issues.push(`status must be one of ${[...PENDING_STATUSES, 'APPROVED'].join(', ')}`)
  if (o.reviewedOn !== null && !(typeof o.reviewedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.reviewedOn))) issues.push('reviewedOn must be null or YYYY-MM-DD')
  if (!Array.isArray(o.cookies)) issues.push('cookies must be a list')
  const names = new Set<string>()
  for (const [i, c] of (Array.isArray(o.cookies) ? o.cookies : []).entries()) {
    const e = c as Record<string, unknown>
    for (const k of ['name', 'provider', 'purpose', 'duration'] as const) if (typeof e[k] !== 'string' || !(e[k] as string).trim()) issues.push(`cookies[${i}].${k} is required`)
    if (!CATEGORIES.includes(e.category as never)) issues.push(`cookies[${i}].category must be one of ${CATEGORIES.join(', ')}`)
    if (typeof e.firstParty !== 'boolean') issues.push(`cookies[${i}].firstParty must be true or false`)
    if (typeof e.name === 'string') {
      if (names.has(e.name)) issues.push(`cookies[${i}].name "${e.name}" is listed twice`)
      names.add(e.name)
    }
  }
  if (o.status === 'APPROVED' && (o.reviewedOn === null || o.reviewedOn === undefined)) issues.push('an APPROVED inventory needs reviewedOn')
  return issues.length ? { ok: false, issues } : { ok: true, inventory: o as unknown as CookieInventory }
}

export function loadInventory(slug: string, root: string = clientsRoot()): CookieInventory | null {
  const file = path.join(root, slug, 'cookies', 'inventory.json')
  if (!existsSync(file)) return null
  const r = validateInventory(JSON.parse(readFileSync(file, 'utf8')))
  if (!r.ok) throw new Error(`${file}: ${r.issues.join('; ')}`)
  return r.inventory
}

const row = (c: CookieEntry) => ({ label: c.name, cells: [{ text: `${c.category}${c.firstParty ? '' : ' (third party)'}` }, { text: c.purpose }, { text: c.provider }, { text: c.duration }] })

/** Replace each `cookieInventory` block by a table of the inventory (or a plain statement when it lists none). */
export function expandCookieBlocks(layout: LayoutBlockData[], inventory: CookieInventory | null, env: NodeJS.ProcessEnv = process.env): LayoutBlockData[] {
  if (!layout.some((b) => b.blockType === 'cookieInventory')) return layout
  if (!inventory) throw new Error('this page has a cookieInventory block but the client has no cookies/inventory.json')
  if (env.H2O_INDEXING_POLICY === 'production' && inventory.status !== 'APPROVED') throw new Error('COPY_PENDING_APPROVAL: the cookie inventory is not approved yet')
  return layout.flatMap((b): LayoutBlockData[] => {
    if (b.blockType !== 'cookieInventory') return [b]
    const pending = inventory.status !== 'APPROVED'
    if (inventory.cookies.length === 0) {
      const paragraphs = pending
        ? ['The cookie list is being confirmed.', 'PENDING: the real cookie list has not been confirmed yet (owner/counsel).']
        : ['This site sets no cookies that need your consent. See the privacy policy for how request details are handled.']
      return [{ blockType: 'articleBody', sections: [{ heading: 'Cookies this site sets', paragraphs }] } as LayoutBlockData]
    }
    return [{ blockType: 'dataTable', title: 'Cookies this site sets', columns: [{ label: 'Category' }, { label: 'Purpose' }, { label: 'Provider' }, { label: 'Duration' }], rows: inventory.cookies.map(row) } as LayoutBlockData]
  })
}
