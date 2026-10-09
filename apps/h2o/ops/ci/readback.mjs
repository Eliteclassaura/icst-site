#!/usr/bin/env node
/**
 * DEPLOY-PIPE-1: the standard post-deploy read-back. GET only, read-only, no cookies, no secrets, no form submissions, no customer data.
 * It prints names and PASS/FAIL only (never a response body). The expectations file says what each URL must (not) contain, so the
 * same script covers: ready, noindex / indexable, the pages that matter, and the CONTENT read-back for chrome that comes from Payload
 * globals (site-chrome overrides the code defaults: assert the live text, and that the old default text is gone).
 *
 *   node readback.mjs <base-url> <expectations.json>
 *
 * expectations.json:
 *   { "checks": [ { "name": "ready", "path": "/api/ready", "status": 200, "contains": [], "notContains": [], "headers": { "x-robots-tag": "noindex" }, "region": "footer" } ],
 *     "everywhereNotContains": ["localhost", "sslip", "staging."] }
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export async function runChecks(base, spec, fetchImpl = fetch) {
  const results = []
  for (const c of spec.checks ?? []) {
    const url = new URL(c.path, base).toString()
    const r = { name: c.name ?? c.path, path: c.path, pass: true, problems: [] }
    try {
      const res = await fetchImpl(url, { redirect: c.redirect ?? 'manual', headers: { 'user-agent': 'h2o-readback/1' } })
      let body = c.status && c.status >= 300 && c.status < 400 ? '' : await res.text()
      if (c.region) {
        // judge only one element of the page (e.g. the footer, the header navigation): the live Payload-global chrome, not the whole page
        const m = new RegExp(`<${c.region}[\\s>][\\s\\S]*?</${c.region}>`, 'i').exec(body)
        if (!m) r.problems.push(`no <${c.region}> element`)
        body = m ? m[0] : ''
      }
      if (c.status !== undefined && res.status !== c.status) r.problems.push(`status ${res.status} != ${c.status}`)
      if (c.location && !(res.headers.get('location') ?? '').includes(c.location)) r.problems.push('location mismatch')
      for (const s of c.contains ?? []) if (!body.includes(s)) r.problems.push(`missing: ${s.slice(0, 60)}`)
      for (const s of [...(c.notContains ?? []), ...(spec.everywhereNotContains ?? [])]) if (body.includes(s)) r.problems.push(`present (must be absent): ${s.slice(0, 60)}`)
      for (const [h, v] of Object.entries(c.headers ?? {})) if (!(res.headers.get(h) ?? '').toLowerCase().includes(String(v).toLowerCase())) r.problems.push(`header ${h} lacks ${v}`)
    } catch {
      r.problems.push('request failed')
    }
    r.pass = r.problems.length === 0
    results.push(r)
  }
  return results
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [base, file] = process.argv.slice(2)
  if (!base || !file) {
    console.error('usage: readback.mjs <base-url> <expectations.json>')
    process.exit(2)
  }
  const results = await runChecks(base, JSON.parse(readFileSync(file, 'utf8')))
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : `  (${r.problems.join('; ')})`}`)
  const failed = results.filter((r) => !r.pass).length
  console.log(`${results.length - failed}/${results.length} read-back checks passed`)
  process.exit(failed ? 1 : 0)
}
