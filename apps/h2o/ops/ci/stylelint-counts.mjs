#!/usr/bin/env node
/**
 * DEPLOY-PIPE-1 (light gates): stylelint per-rule counts of every CHANGED css file must equal the base's (a CSS patch is "lint-neutral").
 * Each changed file is linted twice, its base version and its head version, with the repository's own stylelint config.
 *
 *   node stylelint-counts.mjs <base-sha> <head-sha>      exit 1 when any rule count differs (or a lint run fails to start)
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

/** → [{ rule, base, head }] for every rule whose count differs. */
export function diffCounts(base, head) {
  const rules = new Set([...Object.keys(base), ...Object.keys(head)])
  return [...rules].filter((r) => (base[r] ?? 0) !== (head[r] ?? 0)).sort().map((rule) => ({ rule, base: base[rule] ?? 0, head: head[rule] ?? 0 }))
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
    let baseCode = ''
    try {
      baseCode = git(['show', `${base}:${f}`])
    } catch {
      baseCode = '' // a new file: any warning is new
    }
    const diff = diffCounts(await ruleCounts(stylelint, baseCode, abs), await ruleCounts(stylelint, headCode, abs))
    if (diff.length) {
      bad++
      console.error(`${f}: stylelint per-rule counts differ from base: ${diff.map((d) => `${d.rule} ${d.base}→${d.head}`).join(', ')}`)
    } else console.log(`${f}: stylelint counts equal base`)
  }
  if (files.length === 0) console.log('no changed css files')
  process.exit(bad ? 1 : 0)
}
