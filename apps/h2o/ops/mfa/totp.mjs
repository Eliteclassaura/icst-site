#!/usr/bin/env node
// Patch L2 helper for scripted sign-ins (rehearsal smoke tests): the current 6-digit TOTP code for a secret.
//
//   import { totpCode } from './totp.mjs'           → totpCode(secretBase32)
//   node ops/mfa/totp.mjs <credentials file>       → prints the CURRENT CODE only (never the secret); the file is the
//                                                     0600 rehearsal credentials file holding `totp_secret=…`
// A code is valid for about a minute and only once per user; the secret never leaves the file.
import { createHmac } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function decode(s) {
  let bits = 0, value = 0
  const out = []
  for (const ch of s.toUpperCase().replace(/[\s=-]/g, '')) {
    const i = B32.indexOf(ch)
    if (i < 0) throw new Error('totp: secret is not base32')
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(out)
}
export function totpCode(secret, at = new Date()) {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(Math.floor(at.getTime() / 30000)))
  const h = createHmac('sha1', decode(secret)).update(msg).digest()
  const o = h[h.length - 1] & 15
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(n % 1e6).padStart(6, '0')
}
export function secretFromFile(file) {
  if ((statSync(file).mode & 0o077) !== 0) throw new Error('totp: the credentials file must be mode 0600')
  const line = readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith('totp_secret='))
  if (!line) throw new Error('totp: no totp_secret= line in the credentials file')
  return line.slice('totp_secret='.length).trim()
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) { console.error('usage: node ops/mfa/totp.mjs <0600 credentials file>'); process.exit(2) }
  process.stdout.write(`${totpCode(secretFromFile(file))}\n`)
}
