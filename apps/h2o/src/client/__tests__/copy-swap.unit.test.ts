import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/** The ICST copy swap tooling (tools/client-kit/bin/copy_guard.py, copy_swap.py) is tested by its own Python suite; this runs it from the fork's tests. */
describe('ICST copy swap tooling (python suite)', () => {
  it('the guard, the operations, the field forms and the stale-recipe stop pass', () => {
    const repo = path.resolve(__dirname, '..', '..', '..', '..', '..')
    const r = spawnSync('python3', ['-m', 'unittest', 'tools/client-kit/test/copy_swap_test.py'], { cwd: repo, encoding: 'utf8' })
    expect(r.stderr + r.stdout).toMatch(/OK|Ran \d+ tests/)
    expect(r.status).toBe(0)
  })
})
