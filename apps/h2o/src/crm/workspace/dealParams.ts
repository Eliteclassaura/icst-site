import { OFFICES, type Office } from '../offices'
import { OPPORTUNITY_STAGE } from './../vocabulary'
import type { DealFilter } from './deals'

type Sp = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type DealParams = { filter: DealFilter; view: 'list' | 'board'; page: number }

/** Only validated keys survive: a deals URL can't carry anything but a filter, a view and a page. */
export function parseDealParams(sp: Sp): DealParams {
  const ownerRaw = one(sp.owner)
  const stage = one(sp.stage)
  const office = one(sp.office)
  const page = Number.parseInt(one(sp.page) ?? '1', 10)
  return {
    filter: {
      owner: ownerRaw === 'me' ? 'me' : ownerRaw && UUID.test(ownerRaw) ? ownerRaw : null,
      stage: stage && (OPPORTUNITY_STAGE as readonly string[]).includes(stage) ? stage : null,
      office: office && (OFFICES as readonly string[]).includes(office) ? (office as Office) : null,
      closed: one(sp.closed) === '1',
    },
    view: one(sp.view) === 'board' ? 'board' : 'list',
    page: Number.isFinite(page) && page > 0 && page < 10_000 ? page : 1,
  }
}

/** The canonical query string for a deals view; empty values are left out. */
export function dealQuery(p: Partial<DealParams> & { filter?: Partial<DealFilter> }, over: Record<string, string | null> = {}): string {
  const u = new URLSearchParams()
  const f: Partial<DealFilter> = p.filter ?? {}
  const v: Record<string, string | null> = {
    view: p.view === 'board' ? 'board' : null,
    owner: f.owner ?? null,
    stage: f.stage ?? null,
    office: f.office ?? null,
    closed: f.closed ? '1' : null,
    page: p.page && p.page > 1 ? String(p.page) : null,
    ...over,
  }
  for (const [k, x] of Object.entries(v)) if (x) u.set(k, x)
  return u.toString()
}
