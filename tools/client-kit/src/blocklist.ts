import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { Checker, type Issue } from './check.ts'

/**
 * KIT-0 no-client-strings lint: the blocklist and its matcher.
 *
 * `clients/<slug>/blocklist.json` lists strings that BELONG TO that client and must not appear in any OTHER client's output.
 * The effective list for a target client is the union of every other client's blocklist, minus what the target's manifest
 * lists in `review.allowedOverlap` (matched by value or by group), so a pair that legitimately shares a string (same office,
 * same group name) is a per-pair, owner-decided exception and never hard-coded in code.
 */
export const SCOPES = ['source', 'output', 'seed', 'render'] as const
export type Scope = (typeof SCOPES)[number]
export const KINDS = ['text', 'word', 'phone', 'email', 'domain'] as const
export type Kind = (typeof KINDS)[number]

export type Entry = { value: string; kind: Kind; scopes: Scope[]; group?: string }
export type Blocklist = { schemaVersion: 1; client: string; entries: Entry[] }
export type Hit = { value: string; kind: Kind; client: string; group?: string; index: number; line: number; text: string }

export function validateBlocklist(raw: unknown): { ok: true; list: Blocklist } | { ok: false; issues: Issue[] } {
  const c = new Checker()
  const top = c.obj(raw, '$', ['schemaVersion', 'client', 'entries'])
  if (!top) return { ok: false, issues: c.issues }
  if (top.schemaVersion !== 1) c.fail('$.schemaVersion', 'must be 1')
  c.str(top.client, '$.client', { pattern: /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/, what: 'a client slug' })
  for (const [i, e] of c.arr(top.entries, '$.entries', { min: 1, max: 2000 }).entries()) {
    const p = `$.entries[${i}]`
    const en = c.obj(e, p, ['value', 'kind', 'scopes', 'group'], ['value', 'kind', 'scopes'])
    if (!en) continue
    const v = c.str(en.value, `${p}.value`, { max: 200 })
    const k = c.oneOf(en.kind, `${p}.kind`, KINDS)
    if (v && k === 'phone' && v.replace(/\D/g, '').length < 7) c.fail(`${p}.value`, 'a phone entry needs at least 7 digits (shorter numbers match everything)')
    if (v && k !== 'phone' && v.trim().length < 3) c.fail(`${p}.value`, 'must be at least 3 characters (shorter strings match everything)')
    const sc = c.arr(en.scopes, `${p}.scopes`, { min: 1, max: 4 })
    sc.forEach((s, j) => c.oneOf(s, `${p}.scopes[${j}]`, SCOPES))
    if ('group' in en) c.str(en.group, `${p}.group`, { max: 60 })
  }
  return c.issues.length ? { ok: false, issues: c.issues } : { ok: true, list: top as unknown as Blocklist }
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const LB = '(?<![\\p{L}\\p{N}_])'
const LA = '(?![\\p{L}\\p{N}_])'

function regexFor(e: Entry): RegExp {
  const v = e.value.trim()
  switch (e.kind) {
    case 'word':
      return new RegExp(`${LB}${esc(v)}${LA}`, 'giu')
    case 'text':
      return new RegExp(esc(v).replace(/\s+/g, '\\s+'), 'giu')
    case 'email':
      return new RegExp(`${LB}${esc(v)}${LA}`, 'giu')
    case 'domain':
      // the host itself or any subdomain; not "notexample.com"
      return new RegExp(`(?<![\\p{L}\\p{N}-])${esc(v)}(?![\\p{L}\\p{N}-])`, 'giu')
    case 'phone': {
      const digits = v.replace(/\D/g, '')
      // digits separated by anything a person types between them; a leading + is optional
      return new RegExp(`(?<![0-9])\\+?${digits.split('').join('[\\s().\\-]*')}(?![0-9])`, 'gu')
    }
  }
}

export type Matcher = { entries: Array<Entry & { client: string; re: RegExp }>; dropped: string[] }

/** Build the matcher for a scope from every other client's blocklist; `allowed` removes value/group exceptions. */
export function buildMatcher(lists: Blocklist[], scope: Scope, allowed: readonly string[] = []): Matcher {
  const allow = new Set(allowed.map((a) => a.toLowerCase()))
  const entries: Matcher['entries'] = []
  const dropped: string[] = []
  for (const l of lists)
    for (const e of l.entries) {
      if (!e.scopes.includes(scope)) continue
      if (allow.has(e.value.toLowerCase()) || (e.group && allow.has(e.group.toLowerCase()))) {
        dropped.push(`${l.client}:${e.value}`)
        continue
      }
      entries.push({ ...e, client: l.client, re: regexFor(e) })
    }
  return { entries, dropped }
}

export function scanText(text: string, m: Matcher): Hit[] {
  const hits: Hit[] = []
  // two entries (e.g. the same Bangkok office on two clients' lists) matching the same span are one hit
  const seen = new Set<string>()
  let lineStarts: number[] | null = null
  const lineOf = (index: number) => {
    if (!lineStarts) {
      lineStarts = [0]
      for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lineStarts.push(i + 1)
    }
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid] <= index) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
  for (const e of m.entries) {
    e.re.lastIndex = 0
    for (const match of text.matchAll(e.re)) {
      const index = match.index ?? 0
      const key = `${index}:${match[0].length}`
      if (seen.has(key)) continue
      seen.add(key)
      hits.push({ value: e.value, kind: e.kind, client: e.client, group: e.group, index, line: lineOf(index), text: match[0].slice(0, 80) })
    }
  }
  return hits.sort((a, b) => a.index - b.index)
}

/** Every `clients/<slug>/blocklist.json` under `clientsRoot` (folders starting with `_` are templates and skipped). */
export function loadBlocklists(clientsRoot: string): Blocklist[] {
  const out: Blocklist[] = []
  for (const d of readdirSync(clientsRoot, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith('_')) continue
    const f = path.join(clientsRoot, d.name, 'blocklist.json')
    if (!existsSync(f)) continue
    const r = validateBlocklist(JSON.parse(readFileSync(f, 'utf8')))
    if (!r.ok) throw new Error(`Invalid blocklist ${f}:\n${r.issues.map((i) => `  ${i.path}: ${i.message}`).join('\n')}`)
    if (r.list.client !== d.name) throw new Error(`Blocklist ${f} names client "${r.list.client}", expected "${d.name}"`)
    out.push(r.list)
  }
  return out
}
