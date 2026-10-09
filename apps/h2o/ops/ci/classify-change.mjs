#!/usr/bin/env node
/**
 * DEPLOY-PIPE-1: classify a release by the paths it changes. Fail closed: anything not on the light list is FULL.
 *
 *   light = only CSS (outside src/crm), copy (content/**.md|tsv outside the sensitive set), tests and docs
 *   full  = everything else: src/crm, migrations, collections, seed/catalog/content/site-chrome scripts, package/lockfile,
 *           Dockerfile, workflows, config, any unknown path, an empty change, or a large change (> MAX_LIGHT_FILES source files)
 *
 * CLI:  node classify-change.mjs <base-sha> <head-sha>   → prints JSON, and writes `class=` / `reasons=` to $GITHUB_OUTPUT.
 */
import { appendFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const MAX_LIGHT_FILES = 25
const H = 'apps/h2o/'
/** Words in a path that make a content file "not plain copy" (catalog, seeds, authorities, batches, chrome, redirects…). */
const SENSITIVE = /(catalog|seed|authorit|batch|release|redirect|sitemap|site-chrome|chrome|salmon|ledger|crm|migration|import|manifest|\.json$)/i

const isTest = (p) => p.startsWith(H) && (/(^|\/)__tests__\//.test(p) || /\.test\.tsx?$/.test(p) || p.startsWith(`${H}test/`))
const isDoc = (p) => /\.md$/.test(p) && (p.startsWith(`${H}docs/`) || !p.includes('/') || p.startsWith('docs/'))
const isCss = (p) => p.startsWith(`${H}src/`) && p.endsWith('.css') && !p.startsWith(`${H}src/crm/`)
const isCopy = (p) => p.startsWith(`${H}content/`) && /\.(md|tsv)$/.test(p) && !SENSITIVE.test(p.slice(`${H}content/`.length))

/** → { class: 'light'|'full', reasons: string[], files: number } */
export function classify(paths) {
  const list = [...new Set(paths.filter(Boolean))]
  if (list.length === 0) return { class: 'full', reasons: ['no changed paths (fail closed)'], files: 0 }
  const full = []
  let source = 0
  for (const p of list) {
    if (isTest(p) || isDoc(p)) continue
    source++
    if (isCss(p) || isCopy(p)) continue
    full.push(p)
  }
  const reasons = full.slice(0, 20).map((p) => `full path: ${p}`)
  if (full.length > 20) reasons.push(`… and ${full.length - 20} more full paths`)
  if (source > MAX_LIGHT_FILES) reasons.push(`large change: ${source} source files (> ${MAX_LIGHT_FILES})`)
  return { class: reasons.length ? 'full' : 'light', reasons: reasons.length ? reasons : ['only CSS, plain copy, tests and docs'], files: list.length }
}

const sh = (args) => execFileSync('git', args, { encoding: 'utf8' })
export function changedPaths(base, head) {
  // renames count as delete + add (both paths are looked at)
  return sh(['diff', '--name-status', '--no-renames', base, head]).split('\n').filter(Boolean).map((l) => l.split('\t').slice(1).join('\t'))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [base, head] = process.argv.slice(2)
  let out
  if (!base || !head || !/^[0-9a-f]{7,40}$/.test(base) || !/^[0-9a-f]{7,40}$/.test(head)) out = { class: 'full', reasons: ['base or head missing or not a sha (fail closed)'], files: 0 }
  else
    try {
      out = classify(changedPaths(base, head))
    } catch {
      out = { class: 'full', reasons: ['could not diff base..head (fail closed)'], files: 0 }
    }
  console.log(JSON.stringify(out))
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `class=${out.class}\nreasons=${out.reasons.join(' | ').replace(/\n/g, ' ')}\n`)
}
