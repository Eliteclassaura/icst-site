#!/usr/bin/env node
/**
 * CATALOG-FANS-1: the Fans menu (header Parts > Fans, desktop and mobile) and the brand tiles on /fans/ and /product-category/fans/ are
 * derived from the catalog data, not typed: every public fan product with a brand row ("Additional information > brand") contributes its
 * brand (linked to the brand's product-tag listing) and its family (TUF-LITE II / III / IV: the family's tag listing, else the family
 * product page). Writes content/design/fan-menu.json; `--check` writes nothing and exits 1 when the file is out of date (the unit test
 * runs the same derivation, so a new fan product without a regenerated menu fails the suite).
 *
 *   node ops/catalog/build-fan-menu.mjs [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const OUT = path.join(APP, 'content/design/fan-menu.json')
const entity = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&')
const text = (n) => (typeof n === 'string' ? n : (n.children ?? []).map(text).join(''))
const walk = (n, f) => { if (n && typeof n === 'object') { f(n); for (const k of n.children ?? []) walk(k, f) } }
const ROMAN = { II: 2, III: 3, IV: 4, V: 5 }
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function buildFanMenu(app = APP) {
  const ledger = JSON.parse(readFileSync(path.join(app, 'content/release/route-ledger.json'), 'utf8')).routes
  const publicPaths = new Set(ledger.filter((r) => r.state === 'PUBLIC' && r.export).map((r) => r.path))
  const products = ledger.filter((r) => /^SALMON-product-\d+$/.test(r.routeId) && r.state === 'PUBLIC' && r.export)
  const fans = []
  for (const row of products) {
    const doc = JSON.parse(readFileSync(path.join(app, 'content/salmon', row.sourceFile), 'utf8'))
    const title = entity(doc.title)
    if (/fan[- ]?stack/i.test(title)) continue // fan stacks have their own Parts item
    if (/drive|gear/i.test(title)) continue // fan drives and gearboxes are drives, not fans
    if (!/\bfans?\b/i.test(title) && !/^TUF-LITE/i.test(title)) continue
    let brand = ''
    for (const c of doc.children) walk(c, (n) => {
      if (n.tag !== 'tr') return
      const cells = (n.children ?? []).filter((k) => typeof k !== 'string').map((k) => text(k).trim())
      if (cells[0] === 'brand' && !brand) brand = cells[1] ?? ''
    })
    if (!brand) continue
    fans.push({ path: row.path, title, brand })
  }
  const items = []
  const brands = [...new Set(fans.map((f) => f.brand))].sort((a, b) => fans.filter((f) => f.brand === b).length - fans.filter((f) => f.brand === a).length || a.localeCompare(b))
  for (const brand of brands) {
    const tag = `/product-tag/${slugify(brand)}/`
    if (!publicPaths.has(tag)) throw new Error(`no listing page for the fan brand ${brand}: ${tag}`)
    items.push({ label: `${brand} fans`, href: tag })
    const families = [...new Set(fans.filter((f) => f.brand === brand).map((f) => /^(TUF-LITE [IV]+)\b/.exec(f.title)?.[1]).filter(Boolean))].sort((a, b) => ROMAN[a.split(' ').pop()] - ROMAN[b.split(' ').pop()])
    for (const family of families) {
      const famTag = `/product-tag/${slugify(family)}/`
      const famProduct = fans.filter((f) => f.title.startsWith(family)).sort((a, b) => a.title.length - b.title.length)[0]
      items.push({ label: family, href: publicPaths.has(famTag) ? famTag : famProduct.path })
    }
  }
  return { authority: 'CATALOG-FANS-1 (CT/owner 2026-10-08): derived from the public fan products by ops/catalog/build-fan-menu.mjs; do not edit by hand', fans: fans.length, items }
}

if (process.argv[1] && new URL(import.meta.url).pathname === path.resolve(process.argv[1])) {
  const next = JSON.stringify(buildFanMenu(), null, 1) + '\n'
  if (process.argv.includes('--check')) {
    const cur = (() => { try { return readFileSync(OUT, 'utf8') } catch { return '' } })()
    if (cur !== next) { console.error('content/design/fan-menu.json is out of date: run node ops/catalog/build-fan-menu.mjs'); process.exit(1) }
    console.log('fan menu up to date')
  } else { writeFileSync(OUT, next); console.log(next) }
}
