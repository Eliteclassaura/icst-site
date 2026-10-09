#!/usr/bin/env node
/**
 * DEPLOY-PIPE-1: the bounded compiled-URL scan (CT ruling 2026-10-08). Purpose: no environment-specific host baked into the build.
 *
 *   MUST be 0:  the forbidden hosts (default `staging.` and `sslip`; plus any from --forbid, e.g. the VPS IP), and any `localhost`
 *               that is the EFFECTIVE configured origin (a compiled NEXT_PUBLIC_SERVER_URL / site URL / canonical / metadataBase /
 *               absolute-link base equal to localhost).
 *   ALLOWED:    generic library/runtime fallbacks (`new URL(x, "http://localhost")` parser bases, test/dev guards,
 *               `process.env.PAYLOAD_PUBLIC_SERVER_URL || "http://localhost:<port>"`). Their count and 3 examples go into the evidence.
 *   MUST be present: the expected origin (e.g. https://h2ocooling.com) compiled as the server URL.
 *
 *   node compiled-url-scan.mjs <dir> --origin https://h2ocooling.com [--forbid host1,host2] [--out evidence.json]
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Compiled output only: file traces (*.nft.json, which list SOURCE paths such as src/site/staging.ts) and source maps are not part of what ships to a browser or runs. */
const TEXT = /\.(js|mjs|cjs|html|json|rsc|txt|css|xml|webmanifest)$/
const SKIP = /\.(nft\.json|map)$/
/** A `localhost` that is a configured origin, not a library default. */
const EFFECTIVE = /(NEXT_PUBLIC_SERVER_URL|PAYLOAD_PUBLIC_SERVER_URL|SERVER_URL|siteUrl|site_url|metadataBase|canonical|baseUrl|origin)["'\]]?\s*[:=,]\s*(new URL\()?["'`]https?:\/\/localhost/i
/** A localhost that is a known generic fallback shape. */
const FALLBACK = /(new URL\([^)]{0,80},\s*["'`]https?:\/\/localhost|\|\|\s*["'`]https?:\/\/localhost|\?\?\s*["'`]https?:\/\/localhost|NODE_ENV|isDev|development|process\.env\.[A-Z_]+\s*\|\|)/i

function* files(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name)
    if (e.isDirectory()) yield* files(f)
    else if (TEXT.test(e.name) && !SKIP.test(e.name)) yield f
  }
}

/** Scan one text: → { forbidden: [{kind, context}], allowed: [context], origin: boolean } (pure). */
export function scanText(text, { origin, forbid }) {
  const forbidden = []
  const allowed = []
  for (const host of forbid) {
    // `staging.` means a staging HOST (staging.<name>.<tld>), not a source file called staging.ts; every other entry is a literal
    const re = host === 'staging.' ? /staging\.[a-z0-9-]+\.[a-z]{2,}/gi : new RegExp(host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
    for (const m of text.matchAll(re)) forbidden.push({ kind: `forbidden:${host}`, context: text.slice(Math.max(0, m.index - 40), m.index + 60) })
  }
  for (let i = text.indexOf('localhost'); i !== -1; i = text.indexOf('localhost', i + 9)) {
    const ctx = text.slice(Math.max(0, i - 120), i + 40)
    if (EFFECTIVE.test(ctx) && !FALLBACK.test(ctx.slice(-90))) forbidden.push({ kind: 'localhost-as-origin', context: ctx.slice(-100) })
    else allowed.push(ctx.slice(-80))
  }
  return { forbidden, allowed, origin: origin ? text.includes(origin) : true }
}

export function scanDir(dir, opts) {
  /** @type {{ files: number, forbidden: Array<{ kind: string, context: string, file: string }>, allowedCount: number, allowedExamples: string[], originSeen: boolean, pass: boolean }} */
  const out = { files: 0, forbidden: [], allowedCount: 0, allowedExamples: [], originSeen: false, pass: false }
  for (const f of files(dir)) {
    const r = scanText(readFileSync(f, 'utf8'), opts)
    out.files++
    for (const x of r.forbidden) out.forbidden.push({ ...x, file: path.relative(dir, f) })
    out.allowedCount += r.allowed.length
    for (const a of r.allowed) if (out.allowedExamples.length < 3) out.allowedExamples.push(a)
    if (r.origin) out.originSeen = true
  }
  out.pass = out.forbidden.length === 0 && out.originSeen
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, ...rest] = process.argv.slice(2)
  const arg = (n, d) => (rest.includes(`--${n}`) ? rest[rest.indexOf(`--${n}`) + 1] : d)
  const origin = arg('origin')
  const forbid = ['staging.', 'sslip', ...(arg('forbid', '') ? arg('forbid').split(',').filter(Boolean) : [])]
  const res = scanDir(dir, { origin, forbid })
  const evidence = { ...res, forbidden: res.forbidden.slice(0, 20), origin, forbid }
  if (arg('out')) writeFileSync(arg('out'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ pass: res.pass, files: res.files, forbidden: res.forbidden.length, allowed: res.allowedCount, originSeen: res.originSeen }))
  process.exit(res.pass ? 0 : 1)
}
