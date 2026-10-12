import { describe, expect, it } from 'vitest'
import { encodeKeyPath, sha256Hex, signV4 } from '../attachments/sigv4'

/**
 * CRM-ATTACH-1: the in-house SigV4 signer. The first case is AWS's published "get-vanilla" example from the Signature
 * Version 4 test suite (fixed credentials and date), so the algorithm is checked against an independent answer.
 */
describe('SigV4 signer', () => {
  it('reproduces the AWS get-vanilla example signature', () => {
    const out = signV4({
      method: 'GET',
      host: 'example.amazonaws.com',
      path: '/',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      service: 'service',
      now: new Date('2015-08-30T12:36:00Z'),
    })
    expect(out['x-amz-date']).toBe('20150830T123600Z')
    expect(out.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    )
  })

  it('signs the payload hash for S3 and never the secret itself', () => {
    const body = new TextEncoder().encode('hello')
    const out = signV4({
      method: 'PUT',
      host: 'bucket.example.test',
      path: '/bucket/crm/rfq/a/b',
      headers: { 'Content-Type': 'application/octet-stream' },
      payloadHash: sha256Hex(body),
      accessKeyId: 'KEY',
      secretAccessKey: 'SECRET-VALUE',
      region: 'auto',
      service: 's3',
      now: new Date('2026-10-09T10:00:00Z'),
    })
    expect(out['x-amz-content-sha256']).toBe(sha256Hex(body))
    expect(out.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=KEY\/20261009\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/)
    expect(JSON.stringify(out)).not.toContain('SECRET-VALUE')
  })

  it('changes the signature when the body changes (the hash is bound)', () => {
    const base = { method: 'PUT', host: 'h.test', path: '/b/k', accessKeyId: 'K', secretAccessKey: 'S', region: 'auto', service: 's3', now: new Date('2026-10-09T10:00:00Z') }
    const a = signV4({ ...base, payloadHash: sha256Hex('one') })
    const b = signV4({ ...base, payloadHash: sha256Hex('two') })
    expect(a.authorization).not.toBe(b.authorization)
  })

  it('encodes each key segment once and keeps the slashes', () => {
    expect(encodeKeyPath('crm/rfq/a b/c+d')).toBe('crm/rfq/a%20b/c%2Bd')
  })
})
