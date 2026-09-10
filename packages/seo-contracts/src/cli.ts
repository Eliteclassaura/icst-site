#!/usr/bin/env node
/** `seo-contracts validate <file…>` → exit 1 with JSON-pointer errors on the first invalid document. */
import { readFileSync } from 'node:fs'
import { validate, detectContract } from './index'

const [cmd, ...files] = process.argv.slice(2)
if (cmd !== 'validate' || files.length === 0) {
  console.error('usage: seo-contracts validate <file.json> [more…]')
  process.exit(2)
}
let failed = 0
for (const f of files) {
  let doc: unknown
  try {
    doc = JSON.parse(readFileSync(f, 'utf8'))
  } catch (e) {
    console.error(`✖ ${f}: not JSON (${(e as Error).message})`)
    failed++
    continue
  }
  const name = detectContract(doc)
  if (!name) {
    console.error(`✖ ${f}: cannot detect contract (no "contract" field and not a blueprint v2)`)
    failed++
    continue
  }
  const r = validate(name, doc)
  if (r.ok) console.error(`✔ ${f}: ${name}`)
  else {
    failed++
    console.error(`✖ ${f}: ${name} — ${r.issues.length} issue(s)`)
    for (const i of r.issues) console.error(`    ${i.path}: ${i.message}`)
  }
}
process.exit(failed ? 1 : 0)
