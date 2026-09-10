import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionAfterLoginHook,
  GlobalAfterChangeHook,
} from 'payload'

/** Collections whose field VALUES must never enter the audit log (PII). Only keys are recorded. */
const REDACT_VALUES = new Set(['submissions', 'subscribers', 'contacts', 'leads', 'activities', 'users'])

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'publish'
  | 'unpublish'
  | 'login'
  | 'role-change'
  | 'redirect'
  | 'export'
  | 'config'

function changedKeys(doc: Record<string, unknown>, previous?: Record<string, unknown>): string[] {
  if (!previous)
    return Object.keys(doc).filter((k) => !k.startsWith('_') && !['updatedAt', 'createdAt'].includes(k))
  return Object.keys(doc).filter(
    (k) =>
      !k.startsWith('_') &&
      !['updatedAt', 'createdAt'].includes(k) &&
      JSON.stringify(doc[k]) !== JSON.stringify(previous[k]),
  )
}

type AuditEntry = {
  action: AuditAction
  collection: string
  docId?: string
  changedKeys?: string[]
  summary?: string
}

async function write(req: Parameters<CollectionAfterChangeHook>[0]['req'], entry: AuditEntry) {
  try {
    await req.payload.create({
      collection: 'audit-log',
      data: {
        action: entry.action,
        collection: entry.collection,
        docId: entry.docId ?? null,
        changedKeys: entry.changedKeys ?? null,
        summary: entry.summary ?? null,
        actor: req.user ? String(req.user.id) : null,
        actorEmail: (req.user as { email?: string } | null)?.email ?? null,
        ip:
          req.headers?.get?.('cf-connecting-ip') ??
          req.headers?.get?.('x-forwarded-for')?.split(',')[0]?.trim() ??
          null,
      },
      overrideAccess: true,
      req,
    })
  } catch (e) {
    req.payload.logger.error({ err: e }, 'audit log write failed')
  }
}

/** Attach to important collections. Records action, actor, doc id, changed keys (values redacted for PII collections). */
export const auditAfterChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  collection,
  req,
}) => {
  const slug = collection.slug
  const prevStatus = (previousDoc as { _status?: string } | undefined)?._status
  const status = (doc as { _status?: string })._status
  let action: AuditAction = operation === 'create' ? 'create' : 'update'
  if (status === 'published' && prevStatus !== 'published') action = 'publish'
  if (status === 'draft' && prevStatus === 'published') action = 'unpublish'
  if (slug === 'redirects') action = 'redirect'
  const keys = changedKeys(doc as Record<string, unknown>, previousDoc as Record<string, unknown> | undefined)
  if (slug === 'users' && keys.includes('roles')) action = 'role-change'
  await write(req, {
    action,
    collection: slug,
    docId: String((doc as { id: string | number }).id),
    changedKeys: keys,
    summary: REDACT_VALUES.has(slug) ? undefined : summarize(doc as Record<string, unknown>),
  })
  return doc
}

export const auditAfterDelete: CollectionAfterDeleteHook = async ({ id, collection, req }) => {
  await write(req, { action: 'delete', collection: collection.slug, docId: String(id) })
}

export const auditAfterLogin: CollectionAfterLoginHook = async ({ user, req }) => {
  await write(req, { action: 'login', collection: 'users', docId: String(user.id) })
  return user
}

export const auditGlobalAfterChange: GlobalAfterChangeHook = async ({ doc, previousDoc, global, req }) => {
  await write(req, {
    action: 'config',
    collection: `global:${global.slug}`,
    docId: global.slug,
    changedKeys: changedKeys(doc, previousDoc),
  })
  return doc
}

function summarize(doc: Record<string, unknown>): string | undefined {
  const t = doc.title ?? doc.name ?? doc.slug ?? doc.email
  return typeof t === 'string' ? t.slice(0, 120) : undefined
}
