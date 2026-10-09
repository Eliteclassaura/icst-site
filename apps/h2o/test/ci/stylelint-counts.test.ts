import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { diffCounts, ruleCounts } from '../../ops/ci/stylelint-counts.mjs'

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
