import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { sha256Hex, encodeKeyPath, signV4 } from './sigv4'

/**
 * CRM-ATTACH-1: where the bytes live. Two adapters behind one interface:
 *
 *   - `r2`: Cloudflare R2 through the S3 API (private bucket `h2o-crm-files`, bucket-scoped token, SigV4 by `./sigv4`);
 *   - `volume`: a directory on this server's disk (the fallback, and what local tests use). The VPS has about 14 GB free,
 *     so this is for a small pilot only; R2 is the target.
 *
 * Nothing here is served to a browser: the app streams the bytes through an authenticated route. Keys are made by the
 * server only (`crm/<kind>/<record>/<random>`), never from a file name. Credentials come from the environment and are never
 * logged; errors carry a code only.
 */

export class StorageError extends Error {
  constructor(readonly code: 'STORAGE_NOT_CONFIGURED' | 'STORAGE_PUT_FAILED' | 'STORAGE_GET_FAILED' | 'STORAGE_DELETE_FAILED' | 'STORAGE_KEY_INVALID', detail?: string) {
    super(code)
    this.name = 'StorageError'
    if (detail) (this as { detail?: string }).detail = detail
  }
}

export interface AttachmentStore {
  readonly kind: 'r2' | 'volume'
  put(key: string, bytes: Uint8Array): Promise<void>
  /** The stored bytes, or null when there is nothing under that key. */
  get(key: string): Promise<Uint8Array | null>
  remove(key: string): Promise<void>
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const KEY = new RegExp(`^crm/(contact|account|opportunity|rfq)/${UUID}/${UUID}$`)

/** Only keys this code could have made. Anything else is refused before it reaches a disk or a bucket. */
export const isStorageKey = (key: string): boolean => KEY.test(key)

function requireKey(key: string): void {
  if (!isStorageKey(key)) throw new StorageError('STORAGE_KEY_INVALID')
}

export function volumeStore(root: string): AttachmentStore {
  if (!path.isAbsolute(root)) throw new StorageError('STORAGE_NOT_CONFIGURED', 'H2O_ATTACH_DIR must be an absolute path')
  const file = (key: string) => path.join(root, ...key.split('/'))
  return {
    kind: 'volume',
    async put(key, bytes) {
      requireKey(key)
      const target = file(key)
      try {
        await mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
        // 'wx': never overwrite an existing object; a key is random and used once.
        await writeFile(target, bytes, { flag: 'wx', mode: 0o600 })
      } catch {
        throw new StorageError('STORAGE_PUT_FAILED')
      }
    },
    async get(key) {
      requireKey(key)
      try {
        return new Uint8Array(await readFile(file(key)))
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw new StorageError('STORAGE_GET_FAILED')
      }
    },
    async remove(key) {
      requireKey(key)
      try {
        await rm(file(key), { force: true })
      } catch {
        throw new StorageError('STORAGE_DELETE_FAILED')
      }
    },
  }
}

export type R2Config = { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string }

export function r2Store(cfg: R2Config, fetcher: typeof fetch = fetch): AttachmentStore {
  const base = new URL(cfg.endpoint)
  if (base.protocol !== 'https:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') throw new StorageError('STORAGE_NOT_CONFIGURED', 'R2 endpoint must be https')
  const host = base.host
  const pathFor = (key: string) => `/${cfg.bucket}/${encodeKeyPath(key)}`
  const send = async (method: string, key: string, body?: Uint8Array) => {
    const payloadHash = body ? sha256Hex(body) : sha256Hex('')
    const headers = signV4({
      method,
      host,
      path: pathFor(key),
      headers: body ? { 'content-type': 'application/octet-stream' } : undefined,
      payloadHash,
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      region: 'auto',
      service: 's3',
    })
    return fetcher(`${base.origin}${pathFor(key)}`, { method, headers, body: body as never, signal: AbortSignal.timeout(20000), redirect: 'error' })
  }
  return {
    kind: 'r2',
    async put(key, bytes) {
      requireKey(key)
      const res = await send('PUT', key, bytes)
      if (!res.ok) throw new StorageError('STORAGE_PUT_FAILED', String(res.status))
    },
    async get(key) {
      requireKey(key)
      const res = await send('GET', key)
      if (res.status === 404) return null
      if (!res.ok) throw new StorageError('STORAGE_GET_FAILED', String(res.status))
      return new Uint8Array(await res.arrayBuffer())
    },
    async remove(key) {
      requireKey(key)
      const res = await send('DELETE', key)
      if (!res.ok && res.status !== 404) throw new StorageError('STORAGE_DELETE_FAILED', String(res.status))
    },
  }
}

/** The adapter the environment selects, or null: with no selection the upload is refused (fail closed). */
export function attachmentStoreFromEnv(env: Record<string, string | undefined>, fetcher?: typeof fetch): AttachmentStore | null {
  const kind = (env.H2O_ATTACH_STORE ?? '').trim()
  if (!kind) return null
  if (kind === 'volume') {
    const dir = env.H2O_ATTACH_DIR ?? ''
    if (!dir) throw new StorageError('STORAGE_NOT_CONFIGURED', 'H2O_ATTACH_DIR is required for the volume store')
    return volumeStore(dir)
  }
  if (kind === 'r2') {
    const endpoint = env.H2O_ATTACH_R2_ENDPOINT ?? ''
    const accessKeyId = env.H2O_ATTACH_R2_ACCESS_KEY_ID ?? ''
    const secretAccessKey = env.H2O_ATTACH_R2_SECRET_ACCESS_KEY ?? ''
    if (!endpoint || !accessKeyId || !secretAccessKey) throw new StorageError('STORAGE_NOT_CONFIGURED', 'R2 endpoint and token are required')
    return r2Store({ endpoint, bucket: env.H2O_ATTACH_R2_BUCKET || 'h2o-crm-files', accessKeyId, secretAccessKey }, fetcher)
  }
  throw new StorageError('STORAGE_NOT_CONFIGURED', 'H2O_ATTACH_STORE must be r2 or volume')
}

/**
 * 1.3a-C3: whether an upload could succeed at all. With no store selected, or one whose settings are incomplete or invalid, the Files
 * panel is not shown (it advertised "Up to 25 MB each" for a store that is off). The check builds the adapter and sends nothing.
 */
export function attachStoreConfigured(env: Record<string, string | undefined>): boolean {
  try {
    return attachmentStoreFromEnv(env) !== null
  } catch {
    return false
  }
}
