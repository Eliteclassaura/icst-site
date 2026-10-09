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
 *   DEPLOY-PIPE-1.6 (CT ruling 2026-10-09): a count-pinned allow file, `scan-allow.json` next to this script (repo-owned: no
 *   environment variable, no repository variable). A `staging.` hit moves to `allowedByRule` ONLY when it is exactly an entry's
 *   literal (`https://staging.<name>.<tld>`, delimited on both sides) and the literal's total count over the whole scan is <= the
 *   entry's `max`. A look-alike (`…org.evil.test`, `http://…`, a path, another case) or a count over `max` stays forbidden.
 *   `sslip` and every --forbid host are NEVER allowable, and the allow file cannot name them. A malformed file fails closed.
 *
 *   node compiled-url-scan.mjs <dir> --origin https://h2ocooling.com [--forbid host1,host2] [--allow file.json] [--out evidence.json]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Compiled output only: file traces (*.nft.json, which list SOURCE paths such as src/site/staging.ts) and source maps are not part of what ships to a browser or runs. */
const TEXT = /\.(js|mjs|cjs|html|json|rsc|txt|css|xml|webmanifest)$/
const SKIP = /\.(nft\.json|map)$/
/** A `localhost` that is a configured origin, not a library default. */
const EFFECTIVE = /(NEXT_PUBLIC_SERVER_URL|PAYLOAD_PUBLIC_SERVER_URL|SERVER_URL|siteUrl|site_url|metadataBase|canonical|baseUrl|origin)["'\]]?\s*[:=,]\s*(new URL\()?["'`]https?:\/\/localhost/i
/** A localhost that is a known generic fallback shape. */
const FALLBACK = /(new URL\([^)]{0,80},\s*["'`]https?:\/\/localhost|\|\|\s*["'`]https?:\/\/localhost|\?\?\s*["'`]https?:\/\/localhost|NODE_ENV|isDev|development|process\.env\.[A-Z_]+\s*\|\|)/i

/** @typedef {{ literal: string, max: number, reason: string, removeBy: string }} AllowEntry */
/** @typedef {{ origin?: string, forbid: string[], allow?: AllowEntry[] }} ScanOptions */

/** The only shape an allow entry may take: the https origin of a staging host, exactly as `scanText` flags it. */
const ALLOW_LITERAL = /^https:\/\/staging\.[a-z0-9-]+\.[a-z]{2,}$/
const ALLOW_KEYS = ['literal', 'max', 'reason', 'removeBy']
const MAX_ALLOW_ENTRIES = 10
const MAX_ALLOW_COUNT = 50
/** The characters that would make a literal part of a longer host, path or scheme. */
const AFTER_LITERAL = /[A-Za-z0-9_.:/?#@%~-]/
const BEFORE_LITERAL = /[A-Za-z0-9+.-]/

/**
 * Parse and validate the allow file's text (pure). Throws on anything unexpected, so a bad file FAILS CLOSED (the scan refuses
 * to run) rather than quietly allowing more or less than was meant. `[]` is valid and means no allowances.
 * @param {string} text
 * @param {string[]} forbid the forbidden hosts; no entry may contain one of them (other than the `staging.` pattern itself)
 * @returns {AllowEntry[]}
 */
export function parseAllow(text, forbid = []) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('scan-allow: not valid JSON')
  }
  if (!Array.isArray(data)) throw new Error('scan-allow: must be a JSON array')
  if (data.length > MAX_ALLOW_ENTRIES) throw new Error(`scan-allow: at most ${MAX_ALLOW_ENTRIES} entries`)
  const seen = new Set()
  return data.map((e, i) => {
    const at = `scan-allow: entry ${i}`
    if (!e || typeof e !== 'object' || Array.isArray(e)) throw new Error(`${at}: must be an object`)
    for (const k of Object.keys(e)) if (!ALLOW_KEYS.includes(k)) throw new Error(`${at}: unknown key "${k}"`)
    const { literal, max, reason, removeBy } = e
    if (typeof literal !== 'string' || !ALLOW_LITERAL.test(literal)) throw new Error(`${at}: literal must be an https://staging.<name>.<tld> origin`)
    for (const host of forbid) if (host !== 'staging.' && literal.includes(host)) throw new Error(`${at}: literal names a host that is never allowable`)
    if (seen.has(literal)) throw new Error(`${at}: duplicate literal`)
    seen.add(literal)
    if (!Number.isInteger(max) || max < 1 || max > MAX_ALLOW_COUNT) throw new Error(`${at}: max must be an integer from 1 to ${MAX_ALLOW_COUNT}`)
    if (typeof reason !== 'string' || reason.trim().length < 10 || reason.length > 300) throw new Error(`${at}: reason is required (10 to 300 characters)`)
    const day = typeof removeBy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(removeBy) ? new Date(`${removeBy}T00:00:00Z`) : null
    if (!day || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== removeBy) throw new Error(`${at}: removeBy is required (a real YYYY-MM-DD date)`)
    return { literal, max, reason, removeBy }
  })
}

/** Load the allow file. A missing DEFAULT file means no allowances (the strict old behaviour); a missing explicit one is an error. */
/**
 * @param {string} file
 * @param {{ explicit?: boolean, forbid?: string[] }} [options]
 * @returns {AllowEntry[]}
 */
export function loadAllow(file, { explicit = false, forbid = [] } = {}) {
  if (!existsSync(file)) {
    if (explicit) throw new Error('scan-allow: the --allow file does not exist')
    return []
  }
  return parseAllow(readFileSync(file, 'utf8'), forbid)
}

function* files(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name)
    if (e.isDirectory()) yield* files(f)
    else if (TEXT.test(e.name) && !SKIP.test(e.name)) yield f
  }
}

/**
 * Scan one text: → { forbidden: [{kind, context}], ruleHits: [{literal, context}], allowed: [context], origin: boolean } (pure).
 * @param {string} text
 * @param {ScanOptions} opts
 * `allow` (parsed entries) only ever covers `staging.` hits: a hit that is exactly an entry's literal is a RULE HIT instead of
 * forbidden, and `scanDir` decides, over the whole scan, whether its count stays within the entry's `max`.
 */
export function scanText(text, { origin, forbid, allow = [] }) {
  /** @type {Array<{ kind: string, context: string }>} */
  const forbidden = []
  /** @type {Array<{ literal: string, context: string }>} */
  const ruleHits = []
  /** @type {string[]} */
  const allowed = []
  for (const host of forbid) {
    // `staging.` means a staging HOST (staging.<name>.<tld>), not a source file called staging.ts; every other entry is a literal
    const re = host === 'staging.' ? /staging\.[a-z0-9-]+\.[a-z]{2,}/gi : new RegExp(host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
    for (const m of text.matchAll(re)) {
      const hit = { kind: `forbidden:${host}`, context: text.slice(Math.max(0, m.index - 40), m.index + 60) }
      const entry = host === 'staging.' ? allow.find((a) => coveredBy(a.literal, text, m.index, m[0])) : undefined
      if (entry) ruleHits.push({ literal: entry.literal, context: hit.context })
      else forbidden.push(hit)
    }
  }
  for (let i = text.indexOf('localhost'); i !== -1; i = text.indexOf('localhost', i + 9)) {
    const ctx = text.slice(Math.max(0, i - 120), i + 40)
    if (EFFECTIVE.test(ctx) && !FALLBACK.test(ctx.slice(-90))) forbidden.push({ kind: 'localhost-as-origin', context: ctx.slice(-100) })
    else allowed.push(ctx.slice(-80))
  }
  return { forbidden, ruleHits, allowed, origin: origin ? text.includes(origin) : true }
}

/** Is the staging hit `matched` at `index` EXACTLY the allow literal: same scheme and case, and neither glued to a longer host, path or scheme? */
function coveredBy(literal, text, index, matched) {
  const start = index - (literal.length - matched.length)
  if (start < 0 || literal.slice(literal.length - matched.length) !== matched || !text.startsWith(literal, start)) return false
  const before = start > 0 ? text[start - 1] : ''
  const after = text[start + literal.length] ?? ''
  return !(before && BEFORE_LITERAL.test(before)) && !(after && AFTER_LITERAL.test(after))
}

/**
 * @param {string} dir
 * @param {ScanOptions} opts
 */
export function scanDir(dir, opts) {
  /** @type {{ files: number, forbidden: Array<{ kind: string, context: string, file: string, overMax?: boolean }>, forbiddenRaw: number, forbiddenFinal: number, allowedByRule: Array<{ literal: string, max: number, count: number, reason: string, removeBy: string, files: Array<{ file: string, count: number }> }>, allowedCount: number, allowedExamples: string[], originSeen: boolean, pass: boolean }} */
  const out = { files: 0, forbidden: [], forbiddenRaw: 0, forbiddenFinal: 0, allowedByRule: [], allowedCount: 0, allowedExamples: [], originSeen: false, pass: false }
  /** @type {Map<string, Array<{ file: string, context: string }>>} */
  const ruleHits = new Map()
  for (const f of files(dir)) {
    const r = scanText(readFileSync(f, 'utf8'), opts)
    const file = path.relative(dir, f)
    out.files++
    for (const x of r.forbidden) out.forbidden.push({ ...x, file })
    for (const h of r.ruleHits) ruleHits.set(h.literal, [...(ruleHits.get(h.literal) ?? []), { file, context: h.context }])
    out.allowedCount += r.allowed.length
    for (const a of r.allowed) if (out.allowedExamples.length < 3) out.allowedExamples.push(a)
    if (r.origin) out.originSeen = true
  }
  // the count of each allowed literal over the WHOLE scan decides: within `max` it is allowed by rule, over `max` EVERY hit stays forbidden
  let raw = out.forbidden.length
  for (const entry of opts.allow ?? []) {
    const hits = ruleHits.get(entry.literal) ?? []
    raw += hits.length
    const perFile = new Map()
    for (const h of hits) perFile.set(h.file, (perFile.get(h.file) ?? 0) + 1)
    if (hits.length <= entry.max) out.allowedByRule.push({ ...entry, count: hits.length, files: [...perFile].map(([file, count]) => ({ file, count })) })
    else for (const h of hits) out.forbidden.push({ kind: 'forbidden:staging.', context: h.context, file: h.file, overMax: true })
  }
  out.forbiddenRaw = raw
  out.forbiddenFinal = out.forbidden.length
  out.pass = out.forbidden.length === 0 && out.originSeen
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, ...rest] = process.argv.slice(2)
  const arg = (n, d) => (rest.includes(`--${n}`) ? rest[rest.indexOf(`--${n}`) + 1] : d)
  const origin = arg('origin')
  // required: without an expected origin the check would pass for an image built with no server URL (Auditor F-5)
  if (!origin || !/^https:\/\/[A-Za-z0-9.-]+\/?$/.test(origin)) {
    console.error('compiled-url-scan: --origin is required (https://host)')
    process.exit(2)
  }
  const forbid = ['staging.', 'sslip', ...(arg('forbid', '') ? arg('forbid').split(',').filter(Boolean) : [])]
  // the allow file is repo-owned: next to this script, or --allow <file> (tests). A bad file stops the scan (exit 2): fail closed.
  const allowFile = arg('allow') ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'scan-allow.json')
  let allow
  try {
    allow = loadAllow(allowFile, { explicit: rest.includes('--allow'), forbid })
  } catch (e) {
    console.error(`compiled-url-scan: ${e.message}`)
    process.exit(2)
  }
  const res = scanDir(dir, { origin, forbid, allow })
  // the evidence keeps BOTH numbers: forbiddenRaw (before the allow file) and forbiddenFinal (after); `pass` is the final result
  const evidence = { ...res, forbidden: res.forbidden.slice(0, 20), origin, forbid, allowFile: allow.length ? path.basename(allowFile) : null }
  if (arg('out')) writeFileSync(arg('out'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ pass: res.pass, files: res.files, forbidden: res.forbiddenFinal, forbiddenRaw: res.forbiddenRaw, allowedByRule: res.allowedByRule.reduce((n, a) => n + a.count, 0), allowed: res.allowedCount, originSeen: res.originSeen }))
  process.exit(res.pass ? 0 : 1)
}
