// Regression cover for the manifest merge in tools/scripts/install-skills.mjs.
//
// The installer once rewrote .claude/skills/MANIFEST.json from the generated skill list alone, dropping
// the committed `firstParty` hashes; `pnpm skills:verify` then reported eight unpinned files and CI
// failed. These tests pin the three properties that regression violated.

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildManifest, GENERATED_BY } from '../lib/manifest.mjs'

const firstParty = {
  'design-change/SKILL.md': 'a'.repeat(64),
  'design-pack/policy.json': 'b'.repeat(64),
}

const skills = [{ name: 'ui-ux-pro-max', package: 'ui-ux-pro-max-cli@1.2.3', sha256: 'c'.repeat(64) }]

test('an existing firstParty block survives regeneration unchanged', () => {
  const previous = { generatedBy: GENERATED_BY, skills: [], firstParty }
  const next = buildManifest(previous, skills)
  assert.deepEqual(next.firstParty, firstParty)
})

test('the generated skills portion is replaced by the newly generated data', () => {
  const previous = {
    generatedBy: GENERATED_BY,
    skills: [{ name: 'ui-ux-pro-max', package: 'ui-ux-pro-max-cli@1.0.0', sha256: 'd'.repeat(64) }],
    firstParty,
  }
  const next = buildManifest(previous, skills)
  assert.deepEqual(next.skills, skills)
  assert.equal(next.generatedBy, GENERATED_BY)
  // the stale generated entry is gone, not merged alongside the new one
  assert.equal(next.skills.length, 1)
  assert.equal(next.skills[0].package, 'ui-ux-pro-max-cli@1.2.3')
})

test('a manifest without firstParty does not acquire a fabricated one', () => {
  for (const previous of [{}, { generatedBy: GENERATED_BY, skills: [] }, { firstParty: null }]) {
    const next = buildManifest(previous, skills)
    assert.equal('firstParty' in next, false)
  }
})

test('the previous manifest is not mutated', () => {
  const previous = { generatedBy: GENERATED_BY, skills: [{ name: 'stale' }], firstParty }
  const before = structuredClone(previous)
  buildManifest(previous, skills)
  assert.deepEqual(previous, before)
})
