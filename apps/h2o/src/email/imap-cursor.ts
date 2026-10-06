import type { Payload } from 'payload'
import type { CursorStore } from './imap'

/** Patch C: the IMAP read position, kept in Postgres (`crm-mail-cursor`). */
export function dbCursorStore(payload: Payload): CursorStore {
  const slug = 'crm-mail-cursor' as never
  const sys = { overrideAccess: true as const, depth: 0 }
  const find = async (key: string) =>
    (await payload.find({ collection: slug, where: { key: { equals: key } } as never, limit: 1, ...sys })).docs[0] as unknown as
      | { id: string; uidvalidity: number; last_uid: number }
      | undefined
  return {
    get: async (key) => {
      const d = await find(key)
      return d ? { uidvalidity: Number(d.uidvalidity), lastUid: Number(d.last_uid) } : null
    },
    set: async (key, c) => {
      const d = await find(key)
      const data = { key, uidvalidity: c.uidvalidity, last_uid: c.lastUid } as never
      if (d) await payload.update({ collection: slug, id: d.id, data, ...sys })
      else await payload.create({ collection: slug, data, ...sys })
    },
  }
}
