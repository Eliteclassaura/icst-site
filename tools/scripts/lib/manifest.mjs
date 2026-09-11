// Pure manifest assembly for tools/scripts/install-skills.mjs (ADR-023).
//
// `skills` is generated: the installer rebuilds it from the pinned packages on every run. `firstParty`
// is not generated — it is committed, owner-reviewed hash data for the Factory's own skills, and
// `pnpm skills:verify` refuses anything it does not cover. Rewriting the manifest must therefore carry
// `firstParty` across untouched, and must never invent one that was not already there.
//
// Side-effect free and dependency-free on purpose: tools/scripts is not a workspace package, so this is
// testable with node:test alone.

export const GENERATED_BY = 'tools/scripts/install-skills.mjs'

// Returns the manifest to write. `previousManifest` is the parsed committed manifest ({} when none
// exists) and is never modified.
export function buildManifest(previousManifest, skills, generatedBy = GENERATED_BY) {
  const next = { generatedBy, skills }
  const firstParty = previousManifest?.firstParty
  if (firstParty && typeof firstParty === 'object') next.firstParty = firstParty
  return next
}
