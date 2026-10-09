import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { diffCounts, increases, ruleCounts } from '../../ops/ci/stylelint-counts.mjs'

describe('DEPLOY-PIPE-1 stylelint counts', () => {
  it('diffCounts reports every rule whose count differs and nothing else', () => {
    expect(diffCounts({ a: 2, b: 1 }, { a: 2, b: 1 })).toEqual([])
    expect(diffCounts({ a: 2 }, { a: 3 })).toEqual([{ rule: 'a', base: 2, head: 3 }])
    expect(diffCounts({ a: 2 }, {})).toEqual([{ rule: 'a', base: 2, head: 0 }])
    expect(diffCounts({}, { z: 1, a: 1 })).toEqual([{ rule: 'a', base: 0, head: 1 }, { rule: 'z', base: 0, head: 1 }])
  })
  it('counts warnings per rule using the repository config (a hex colour is a warning, a token is not)', async () => {
    const { default: stylelint } = await import('stylelint')
    const file = path.join(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(), 'apps/h2o/src/site/example.module.css')
    const clean = await ruleCounts(stylelint, '.a {\n  color: var(--df-blue);\n}\n', file)
    const dirty = await ruleCounts(stylelint, '.a {\n  color: #fff;\n}\n', file)
    expect(Object.values(clean as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(0)
    expect((dirty as Record<string, number>)['color-no-hex']).toBe(1)
  })
})

describe('DEPLOY-PIPE-1.3: lint-neutral OR BETTER; an absent base is {} (not an empty source)', () => {
  it('a decrease passes; an increase fails; a rule absent at the base counts as 0', () => {
    expect(increases({ a: 2 }, { a: 1 })).toEqual([]) // decrease
    expect(increases({ a: 2 }, { a: 2 })).toEqual([]) // equal
    expect(increases({ a: 2 }, {})).toEqual([]) // a rule fixed completely
    expect(increases({ a: 2 }, { a: 3 })).toEqual([{ rule: 'a', base: 2, head: 3 }]) // increase
    expect(increases({ a: 2 }, { a: 2, z: 1 })).toEqual([{ rule: 'z', base: 0, head: 1 }]) // a new rule appearing
  })
  it('a NEW file (base {}) passes when it lints clean and FAILS with any violation', async () => {
    const { default: stylelint } = await import('stylelint')
    const file = path.join(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(), 'apps/h2o/src/app/(site)/new-sheet.css')
    const clean = await ruleCounts(stylelint, '.a {\n  color: var(--df-blue);\n}\n', file)
    expect(increases({}, clean)).toEqual([])
    const dirty = await ruleCounts(stylelint, '.a {\n  color: #fff;\n}\n', file)
    expect(increases({}, dirty).length).toBeGreaterThan(0)
    expect(increases({}, dirty).map((d: { rule: string }) => d.rule)).toContain('color-no-hex')
  })
  it('the old bug: linting an EMPTY base reports no-empty-source=1, which made a clean new file "differ"', async () => {
    const { default: stylelint } = await import('stylelint')
    const file = path.join(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(), 'apps/h2o/src/app/(site)/design-articles.css')
    expect(await ruleCounts(stylelint, '', file)).toEqual({ 'no-empty-source': 1 }) // what the script used to compare against
    expect(increases({}, await ruleCounts(stylelint, '.a {\n  color: var(--df-blue);\n}\n', file))).toEqual([]) // now: {} vs clean → pass
  })
  it('the script end to end in a temp repo: new clean file passes, an improved file passes, a worse file and a dirty new file fail', () => {
    const fs = require('node:fs') as typeof import('node:fs')
    const os = require('node:os') as typeof import('node:os')
    const { spawnSync } = require('node:child_process') as typeof import('node:child_process')
    const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slc-'))
    const sh = (...a: string[]) => execFileSync('git', a, { cwd: tmp, encoding: 'utf8' })
    const CLEAN = '.a {\n  color: var(--df-blue);\n}\n'
    const ONE = '.a {\n  color: #fff;\n}\n'
    const TWO = '.a {\n  color: #fff;\n}\n\n.b {\n  color: #000;\n}\n'
    sh('init', '-q')
    sh('config', 'user.email', 'ci@example.test')
    sh('config', 'user.name', 'ci')
    fs.copyFileSync(path.join(repoRoot, '.stylelintrc.json'), path.join(tmp, '.stylelintrc.json'))
    fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(tmp, 'node_modules'))
    fs.mkdirSync(path.join(tmp, 'apps/h2o/src/site'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'apps/h2o/src/site/improve.css'), TWO)
    fs.writeFileSync(path.join(tmp, 'apps/h2o/src/site/worse.css'), ONE)
    sh('add', '-A'); sh('commit', '-q', '-m', 'base')
    const base = sh('rev-parse', 'HEAD').trim()
    const run = (headFiles: Record<string, string>) => {
      for (const [f, c] of Object.entries(headFiles)) fs.writeFileSync(path.join(tmp, f), c)
      sh('add', '-A'); sh('commit', '-q', '-m', 'head')
      const head = sh('rev-parse', 'HEAD').trim()
      return spawnSync('node', [path.resolve(process.cwd(), 'ops/ci/stylelint-counts.mjs'), base, head], { cwd: tmp, encoding: 'utf8' })
    }
    const ok = run({ 'apps/h2o/src/site/new-clean.css': CLEAN, 'apps/h2o/src/site/improve.css': ONE })
    expect(ok.status, ok.stderr).toBe(0)
    expect(ok.stdout).toContain('new file, lints clean')
    expect(ok.stdout).toContain('improved')
    const bad = run({ 'apps/h2o/src/site/worse.css': TWO, 'apps/h2o/src/site/new-dirty.css': ONE })
    expect(bad.status).toBe(1)
    expect(bad.stderr).toContain('worse.css: stylelint per-rule counts rose above base')
    expect(bad.stderr).toContain('new-dirty.css: new file must lint at zero for every rule')
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})

describe('DEPLOY-PIPE-1.3: LIGHT and FULL use the same function', () => {
  it('both the gates-light job and the static (full) job call the one stylelint-counts script, and nothing else lints CSS counts', () => {
    const wf = readFileSync(path.join(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(), '.github/workflows/h2o-release.yml'), 'utf8')
    const calls = wf.match(/node apps\/h2o\/ops\/ci\/stylelint-counts\.mjs "\$BASE_SHA" "\$HEAD_SHA"/g) ?? []
    expect(calls).toHaveLength(2)
    expect(wf.match(/stylelint-counts\.mjs/g)).toHaveLength(2)
    expect(wf).not.toMatch(/stylelint (?!-)/)
  })
})
