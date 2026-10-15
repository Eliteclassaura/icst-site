import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { attachmentStoreFromEnv, isStorageKey, r2Store, StorageError, volumeStore } from '../attachments/store'
import { sha256Hex } from '../attachments/sigv4'

/**
 * CRM-ATTACH-1: the two storage adapters. The R2 adapter is exercised against a local mock of the S3 object API that
 * checks each request's SigV4 headers are present and that the body hash matches the bytes. Real R2 is not called.
 */
const KEY = 'crm/rfq/0b6a2d7e-9f1c-4a3b-8d2e-7c5f4e3d2c1b/3f8e9d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c'
const BODY = new TextEncoder().encode('%PDF-1.4 synthetic attachment bytes')

describe('storage keys', () => {
  it('accepts only keys the server makes, so no path can climb out of the store', () => {
    expect(isStorageKey(KEY)).toBe(true)
    expect(isStorageKey('crm/rfq/../../etc/passwd')).toBe(false)
    expect(isStorageKey('crm/rfq/0b6a2d7e-9f1c-4a3b-8d2e-7c5f4e3d2c1b/../x')).toBe(false)
    expect(isStorageKey('crm/other/0b6a2d7e-9f1c-4a3b-8d2e-7c5f4e3d2c1b/3f8e9d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c')).toBe(false)
  })
})

describe('volume store', () => {
  it('round-trips bytes, never overwrites, and removes', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'attach-vol-'))
    const store = volumeStore(root)
    expect(store.kind).toBe('volume')
    expect(await store.get(KEY)).toBeNull()
    await store.put(KEY, BODY)
    expect(readFileSync(path.join(root, ...KEY.split('/')))).toEqual(Buffer.from(BODY))
    expect(await store.get(KEY)).toEqual(BODY)
    await expect(store.put(KEY, BODY)).rejects.toMatchObject({ code: 'STORAGE_PUT_FAILED' })
    await store.remove(KEY)
    expect(existsSync(path.join(root, ...KEY.split('/')))).toBe(false)
    await expect(store.remove(KEY)).resolves.toBeUndefined()
  })

  it('refuses a relative root and a bad key before touching the disk', async () => {
    expect(() => volumeStore('relative/dir')).toThrow(StorageError)
    const store = volumeStore(mkdtempSync(path.join(tmpdir(), 'attach-vol-')))
    await expect(store.put('crm/rfq/../escape', BODY)).rejects.toMatchObject({ code: 'STORAGE_KEY_INVALID' })
  })
})

describe('R2 store (S3 API) against a local mock', () => {
  let server: Server
  let base: string
  const objects = new Map<string, Buffer>()
  const seen: Array<{ method: string; url: string; headers: IncomingMessage['headers'] }> = []

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        const body = Buffer.concat(chunks)
        seen.push({ method: req.method!, url: req.url!, headers: req.headers })
        const auth = String(req.headers.authorization ?? '')
        if (!/^AWS4-HMAC-SHA256 Credential=TOKEN-ID\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=.*Signature=[0-9a-f]{64}$/.test(auth)) {
          res.writeHead(403).end()
          return
        }
        const objectPath = decodeURIComponent(req.url!.split('?')[0]!)
        if (req.method === 'PUT') {
          if (req.headers['x-amz-content-sha256'] !== sha256Hex(body)) return void res.writeHead(400).end()
          objects.set(objectPath, body)
          res.writeHead(200).end()
        } else if (req.method === 'GET') {
          const hit = objects.get(objectPath)
          if (!hit) return void res.writeHead(404).end()
          res.writeHead(200, { 'content-length': String(hit.length) }).end(hit)
        } else if (req.method === 'DELETE') {
          objects.delete(objectPath)
          res.writeHead(204).end()
        } else res.writeHead(405).end()
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const addr = server.address() as { port: number }
    base = `http://127.0.0.1:${addr.port}`
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))

  it('puts, gets and deletes through signed requests to the bucket path', async () => {
    const store = r2Store({ endpoint: base, bucket: 'h2o-crm-files', accessKeyId: 'TOKEN-ID', secretAccessKey: 'SECRET-VALUE' })
    expect(store.kind).toBe('r2')
    expect(await store.get(KEY)).toBeNull()
    await store.put(KEY, BODY)
    expect(await store.get(KEY)).toEqual(new Uint8Array(BODY))
    await store.remove(KEY)
    expect(await store.get(KEY)).toBeNull()
    const put = seen.find((r) => r.method === 'PUT')!
    expect(put.url).toBe(`/h2o-crm-files/${KEY}`)
    expect(put.headers['x-amz-content-sha256']).toBe(sha256Hex(BODY))
  })

  it('reports a failed write with a code only, never the credentials', async () => {
    const store = r2Store({ endpoint: base, bucket: 'h2o-crm-files', accessKeyId: 'WRONG', secretAccessKey: 'SECRET-VALUE' })
    const err = await store.put(KEY, BODY).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StorageError)
    expect((err as StorageError).code).toBe('STORAGE_PUT_FAILED')
    expect(String((err as Error).message)).not.toContain('SECRET-VALUE')
  })

  it('refuses a plain-http endpoint that is not local', () => {
    expect(() => r2Store({ endpoint: 'http://storage.example.test', bucket: 'b', accessKeyId: 'a', secretAccessKey: 'b' })).toThrow(StorageError)
  })
})

describe('choosing the store from the environment', () => {
  it('is off unless chosen (fail closed), and needs its settings when chosen', () => {
    expect(attachmentStoreFromEnv({})).toBeNull()
    expect(() => attachmentStoreFromEnv({ H2O_ATTACH_STORE: 'volume' })).toThrow(StorageError)
    expect(() => attachmentStoreFromEnv({ H2O_ATTACH_STORE: 'r2', H2O_ATTACH_R2_ENDPOINT: 'https://x.example.test' })).toThrow(StorageError)
    expect(() => attachmentStoreFromEnv({ H2O_ATTACH_STORE: 'ftp' })).toThrow(StorageError)
    expect(attachmentStoreFromEnv({ H2O_ATTACH_STORE: 'volume', H2O_ATTACH_DIR: '/tmp/attach-x' })?.kind).toBe('volume')
    expect(
      attachmentStoreFromEnv({
        H2O_ATTACH_STORE: 'r2',
        H2O_ATTACH_R2_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
        H2O_ATTACH_R2_ACCESS_KEY_ID: 'id',
        H2O_ATTACH_R2_BUCKET: 'synthetic-bucket',
        H2O_ATTACH_R2_SECRET_ACCESS_KEY: 'secret',
      })?.kind,
    ).toBe('r2')
  })
})
