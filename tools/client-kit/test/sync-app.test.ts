import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { appCopy, SYNCED } from '../src/sync-app.ts'
import { repo } from './helpers.ts'

test('the app carries an exact generated copy of the manifest validator (run sync-app after changing tools/client-kit/src)', () => {
  for (const f of SYNCED) {
    const src = readFileSync(path.join(repo, 'tools/client-kit/src', f), 'utf8')
    assert.equal(readFileSync(path.join(repo, 'apps/h2o/src/client', f), 'utf8'), appCopy(src, f), f)
  }
})

test('the app copy has no .ts-suffixed imports (the app uses extensionless imports)', () => {
  for (const f of SYNCED) assert.ok(!/from '\.\/[a-z-]+\.ts'/.test(readFileSync(path.join(repo, 'apps/h2o/src/client', f), 'utf8')), f)
})
