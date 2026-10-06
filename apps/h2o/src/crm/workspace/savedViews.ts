import { fromError, type Outcome } from './mutations'
import { asUser, type CrmSession } from './session'
import { line, relationshipId } from './validate'
import { VIEW_LISTS, normalizeViewQuery, viewHref, type ViewList } from './views'

/**
 * Wave 1 W1-6 saved views, read and written **as the user** (the collection's access rules and hooks decide: owners
 * manage their own private views, admins manage shared ones; a stored query is always re-normalised server-side).
 */
type Doc = Record<string, unknown>
const D = (x: unknown): Doc => x as Doc

export type SavedView = { id: string; name: string; list: ViewList; href: string; shared: boolean; pinned: boolean; mine: boolean; updatedAt: string }

export async function loadViews(s: CrmSession, list?: ViewList): Promise<SavedView[]> {
  try {
    const res = await s.payload.find({
      collection: 'crm-saved-views',
      where: list ? { list: { equals: list } } : {},
      sort: 'name',
      depth: 0,
      limit: 100,
      ...asUser(s),
    })
    return (res.docs as unknown as Doc[]).map((v) => ({
      id: String(v.id),
      name: String(v.name ?? ''),
      list: v.list as ViewList,
      href: viewHref(v.list as ViewList, String(v.query ?? '')),
      shared: v.shared === true,
      pinned: v.pinned === true,
      mine: String(D(v.owner)?.id ?? v.owner) === s.userId,
      updatedAt: String(v.updatedAt ?? ''),
    }))
  } catch {
    return []
  }
}

export async function saveView(s: CrmSession, input: { list: unknown; name: unknown; query: unknown; shared?: unknown; pinned?: unknown }): Promise<Outcome> {
  const list = typeof input.list === 'string' && (VIEW_LISTS as readonly string[]).includes(input.list) ? (input.list as ViewList) : null
  const name = line(input.name, 80)
  if (!list) return { ok: false, code: 'VALIDATION', message: 'This list cannot be saved as a view.' }
  if (!name) return { ok: false, code: 'VALIDATION', message: 'Name the view.', fields: { name: 'Required' } }
  const shared = input.shared === 'on' || input.shared === true
  if (shared && !s.isAdmin) return { ok: false, code: 'VIEW_SHARE_PRIVILEGED', message: 'Only an admin can share a view with the team.' }
  try {
    const v = await s.payload.create({
      collection: 'crm-saved-views',
      data: { list, name, query: normalizeViewQuery(list, input.query), shared, pinned: input.pinned === 'on' || input.pinned === true } as never,
      depth: 0,
      ...asUser(s),
    })
    return { ok: true, message: `Saved “${name}”.`, id: String(v.id) }
  } catch (err) {
    return fromError(err)
  }
}

export async function updateView(s: CrmSession, input: { viewId: unknown; name?: unknown; pinned?: unknown }): Promise<Outcome> {
  const v = relationshipId(input.viewId)
  if (!v.ok || !v.id) return { ok: false, code: 'INVALID_ID', message: 'That view reference is not valid.' }
  const data: Doc = {}
  if (input.name !== undefined) {
    const name = line(input.name, 80)
    if (!name) return { ok: false, code: 'VALIDATION', message: 'Name the view.', fields: { name: 'Required' } }
    data.name = name
  }
  if (input.pinned !== undefined) data.pinned = input.pinned === 'on' || input.pinned === true || input.pinned === 'true'
  try {
    await s.payload.update({ collection: 'crm-saved-views', id: v.id, data: data as never, depth: 0, ...asUser(s) })
    return { ok: true, message: 'View updated.' }
  } catch (err) {
    return fromError(err)
  }
}

export async function deleteView(s: CrmSession, input: { viewId: unknown }): Promise<Outcome> {
  const v = relationshipId(input.viewId)
  if (!v.ok || !v.id) return { ok: false, code: 'INVALID_ID', message: 'That view reference is not valid.' }
  try {
    await s.payload.delete({ collection: 'crm-saved-views', id: v.id, depth: 0, ...asUser(s) })
    return { ok: true, message: 'View deleted.' }
  } catch (err) {
    return fromError(err)
  }
}
