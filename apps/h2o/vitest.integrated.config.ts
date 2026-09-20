/**
 * H2O Phase 2D — the integrated test gate.
 *
 * The accepted Phase 2C-min R1.1 adapter ships a static assertion that nothing outside
 * `src/conversion/` imports it. That was correct for 2C-min, where the adapter was additive and
 * mounted nowhere. Phase 2D is authorized to mount it on named surfaces, so the assertion is
 * superseded by this increment — not failing because the code is wrong.
 *
 * Two things a Factory must not do here: edit an accepted artifact to make a test pass, and declare
 * an exit-0 gate that quietly stopped checking something. So:
 *
 *   - the accepted adapter's 21 files stay byte-identical, the assertion included, and it is still
 *     executed by `vitest.config.ts` and recorded as historical evidence;
 *   - this config excludes that **one assertion by name** — not the file, whose other 27 checks all
 *     still run — and nothing else;
 *   - `src/site/__tests__/integration-boundary.test.ts` replaces it with a stricter rule: exactly
 *     three named files may import the adapter, each only from the modules it is authorized to use.
 *
 * The exclusion is a regular expression over the full test name, so an assertion whose name is not
 * listed cannot be excluded by accident, and a test added later is included by default.
 */
import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vitest.config'

/**
 * Assertions superseded by an accepted Phase 2D authorization. Each entry is the exact test name,
 * the accepted file it lives in, and what replaces it.
 */
export const SUPERSEDED_ASSERTIONS = [
  {
    file: 'src/conversion/__tests__/boundaries.static.test.ts',
    name: 'leaves every accepted collection and hook untouched by this increment',
    replacedBy: 'src/site/__tests__/integration-boundary.test.ts',
    supersededBy: 'H2O Phase 2D authorization to mount the accepted adapter on named surfaces',
  },
] as const

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Everything except the superseded assertions, by exact name. */
export const integratedTestNamePattern = new RegExp(
  `^(?!.*(?:${SUPERSEDED_ASSERTIONS.map((entry) => escape(entry.name)).join('|')}).*$).*$`,
)

export default mergeConfig(base, defineConfig({ test: { testNamePattern: integratedTestNamePattern } }))
