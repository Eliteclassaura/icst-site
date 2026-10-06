#!/usr/bin/env node
/**
 * R2.2 claims read-back (Control Tower 2026-10-05): after the R2.2 apply, every ruled string must be absent from its page and
 * every owner-restored string present (ops/seo-pass/data/claims-conformance.json; the vitest mock asserts the same list).
 * Read-only: one GET per page, at most one request per second. Exit 0 when every check holds, 1 otherwise.
 *
 *   node ops/seo-pass/check-claims.mjs --base=https://<host> [--out=<report.json>] [--interval-ms=1000]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pageText } from './claims-text.mjs'

const flag = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const base = flag('base')?.replace(/\/$/, '')
if (!base || !/^https?:\/\//.test(base)) { console.error('usage: check-claims.mjs --base=https://<host> [--out=report.json]'); process.exit(2) }
const interval = Number(flag('interval-ms') ?? 1000)
const list = JSON.parse(readFileSync(path.join(process.cwd(), 'ops/seo-pass/data/claims-conformance.json'), 'utf8'))
const paths = [...new Set([...list.absent, ...list.present].map((c) => c.path))]
const texts = new Map(), errors = []
for (const p of paths) {
  const url = base + p.split('/').map(encodeURIComponent).join('/')
  try {
    const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'h2o-r22-claims-readback' } })
    if (res.status !== 200) errors.push({ path: p, status: res.status })
    else texts.set(p, pageText(await res.text()))
  } catch (e) { errors.push({ path: p, error: String(e) }) }
  await new Promise((r) => setTimeout(r, interval))
}
const kept = list.absent.filter((c) => texts.get(c.path)?.includes(c.text))
const missing = list.present.filter((c) => texts.has(c.path) && !texts.get(c.path).includes(c.text))
const report = { base, pages: paths.length, fetched: texts.size, errors, absentChecked: list.absent.length, kept, presentChecked: list.present.length, missing, pass: !errors.length && !kept.length && !missing.length }
const out = flag('out')
if (out) writeFileSync(out, JSON.stringify(report, null, 1) + '\n')
process.stdout.write(JSON.stringify({ ...report, kept: kept.length, missing: missing.length, errors: errors.length }, null, 1) + '\n')
process.exit(report.pass ? 0 : 1)
