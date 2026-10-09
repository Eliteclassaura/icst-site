#!/usr/bin/env node
/**
 * PROJECTS-MENU-1 (CT/owner 2026-10-09): the header Projects dropdown (desktop and mobile) lists the live site's items: United States,
 * Japan, Singapore, Thailand, Malaysia, then All Projects. The items are not typed into the navigation: each live menu entry below is
 * resolved against the release route ledger (a redirected live URL follows its redirect to the page this site serves; the target must be
 * a public, exported route), and the result is written to content/design/projects-menu.json. `--check` writes nothing and exits 1 when
 * the file is out of date (the unit test runs the same derivation, so a retired or renamed route fails the suite).
 *
 *   node ops/catalog/build-projects-menu.mjs [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const OUT = path.join(APP, 'content/design/projects-menu.json')

/** The live site's Projects menu as read from h2ocooling.com on 2026-10-09 (label, the path the live item links to). */
export const LIVE_PROJECTS_MENU = [
  ['United States', '/cooling-tower-construction-repair-in-united-states/'],
  ['Japan', '/cooling-towers-construction-repair-in-japan/'],
  ['Singapore', '/cooling-tower-construction-repair-in-singapore/'],
  ['Thailand', '/thailand-cooling-tower/'],
  ['Malaysia', '/cooling-tower-malaysia/'],
]
export const ALL_PROJECTS = ['All Projects', '/all-projects/']

export function buildProjectsMenu(app = APP) {
  const ledger = JSON.parse(readFileSync(path.join(app, 'content/release/route-ledger.json'), 'utf8')).routes
  const byPath = new Map(ledger.map((r) => [r.path, r]))
  const resolve = (live) => {
    let row = byPath.get(live)
    if (!row) throw new Error(`the live Projects menu item ${live} has no route on this site`)
    if (row.state === 'REDIRECT' && row.redirect) row = byPath.get(row.redirect) // one hop, so the menu never links to a redirect
    if (!row || row.state !== 'PUBLIC' || !row.export) throw new Error(`the live Projects menu item ${live} does not resolve to a public page`)
    return row.path
  }
  const items = [...LIVE_PROJECTS_MENU, ALL_PROJECTS].map(([label, live]) => ({ label, live, href: resolve(live) }))
  return { authority: 'PROJECTS-MENU-1 (CT/owner 2026-10-09): the live Projects menu resolved against the route ledger by ops/catalog/build-projects-menu.mjs; do not edit by hand', items }
}

if (process.argv[1] && new URL(import.meta.url).pathname === path.resolve(process.argv[1])) {
  const next = JSON.stringify(buildProjectsMenu(), null, 1) + '\n'
  if (process.argv.includes('--check')) {
    const cur = (() => { try { return readFileSync(OUT, 'utf8') } catch { return '' } })()
    if (cur !== next) { console.error('content/design/projects-menu.json is out of date: run node ops/catalog/build-projects-menu.mjs'); process.exit(1) }
    console.log('projects menu up to date')
  } else { writeFileSync(OUT, next); console.log(next) }
}
