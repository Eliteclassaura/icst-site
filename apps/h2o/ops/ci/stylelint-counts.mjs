#!/usr/bin/env node
/**
 * DEPLOY-PIPE-1 (gates): the factory rule for CSS is lint-NEUTRAL OR BETTER: for every CHANGED css file, each stylelint rule's count at the head
 * must be <= its count at the base. An increase fails; a decrease passes. A file that did not exist at the base has base {} (it is not linted
 * as an empty source): it must lint at ZERO for every rule. Each existing file is linted at base and head with the repository's own config.
 *
 *   node stylelint-counts.mjs <base-sha> <head-sha>      exit 1 when any rule count increased (or a lint run fails to start)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** The repository's stylelint config, found by walking up from the file (the same file stylelint itself would use). */
export function findConfig(file) {
  for (let d = path.dirname(file); ; d = path.dirname(d)) {
    const c = path.join(d, '.stylelintrc.json')
    if (existsSync(c)) return c
    if (path.dirname(d) === d) throw new Error('no .stylelintrc.json above ' + file)
  }
}

/** rule → count, for one css source. `file` is the ABSOLUTE path it would have (so the repository's stylelint config is found). */
export async function ruleCounts(stylelint, code, file) {
  const res = await stylelint.lint({ code, codeFilename: file, configFile: findConfig(file) })
  const counts = {}
  for (const r of res.results) for (const w of r.warnings) counts[w.rule] = (counts[w.rule] ?? 0) + 1
  return counts
}

/** → [{ rule, base, head }] for every rule whose count differs (either direction). */
export function diffCounts(base, head) {
  const rules = new Set([...Object.keys(base), ...Object.keys(head)])
  return [...rules].filter((r) => (base[r] ?? 0) !== (head[r] ?? 0)).sort().map((rule) => ({ rule, base: base[rule] ?? 0, head: head[rule] ?? 0 }))
}

/**
 * The gate itself: → [{ rule, base, head }] for every rule whose head count is HIGHER than the base count (a rule absent from the base counts 0,
 * so a new rule appearing with count > 0 is an increase). A decrease is not reported. `baseCounts` is `{}` for a file that is new at the head.
 */
export function increases(baseCounts, headCounts) {
  return diffCounts(baseCounts, headCounts).filter((d) => d.head > d.base)
}

const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [base, head] = process.argv.slice(2)
  if (!base || !head) {
    console.error('usage: stylelint-counts.mjs <base> <head>')
    process.exit(2)
  }
  const { default: stylelint } = await import('stylelint')
  const repoRoot = git(['rev-parse', '--show-toplevel']).trim()
  const files = git(['diff', '--name-only', '--no-renames', '--diff-filter=AM', base, head]).split('\n').filter((f) => f.endsWith('.css'))
  let bad = 0
  for (const f of files) {
    const abs = path.join(repoRoot, f)
    const headCode = existsSync(abs) ? readFileSync(abs, 'utf8') : git(['show', `${head}:${f}`])
    // A file absent at the base has base counts {} (nothing to compare: NOT an empty source, which would itself lint as no-empty-source=1).
    let baseCounts = {}
    let isNew = false
    try {
      baseCounts = await ruleCounts(stylelint, git(['show', `${base}:${f}`]), abs)
    } catch {
      isNew = true
    }
    const headCounts = await ruleCounts(stylelint, headCode, abs)
    const worse = increases(baseCounts, headCounts)
    if (worse.length) {
      bad++
      console.error(`${f}: ${isNew ? 'new file must lint at zero for every rule' : 'stylelint per-rule counts rose above base'}: ${worse.map((d) => `${d.rule} ${d.base}→${d.head}`).join(', ')}`)
    } else {
      const better = diffCounts(baseCounts, headCounts)
      console.log(`${f}: ${isNew ? 'new file, lints clean' : better.length ? `stylelint counts at or below base (improved: ${better.map((d) => `${d.rule} ${d.base}→${d.head}`).join(', ')})` : 'stylelint counts equal base'}`)
    }
  }
  if (files.length === 0) console.log('no changed css files')
  process.exit(bad ? 1 : 0)
}
