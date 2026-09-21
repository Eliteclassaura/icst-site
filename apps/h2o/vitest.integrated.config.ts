/**
 * H2O Phase 2D — the integrated test gate.
 *
 * The accepted Phase 2C-min R1.1 adapter ships a static assertion that nothing outside
 * `src/conversion/` imports it. That was correct for 2C-min, where the adapter was additive and
 * mounted nowhere. The adapter is now mounted on named surfaces and is verified directly by the
 * integration boundary test.
 *
 * The Factory must not declare an exit-0 gate that quietly stops checking something. The original
 * static boundary has been reconciled to its current runtime contract, so every test executes.
 *
 * `src/site/__tests__/integration-boundary.test.ts` keeps the syntax-aware rule: only explicitly
 * named runtime bridges may import the adapter, and each may reach only its approved modules.
 *
 * The pattern deliberately includes all tests; a test added later is included by default.
 */
import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vitest.config'

/** No assertions are excluded from the integrated suite. */
export const SUPERSEDED_ASSERTIONS: readonly [] = []

/** Execute every assertion in the integrated suite. */
export const integratedTestNamePattern = /.*/

export default mergeConfig(base, defineConfig({ test: { testNamePattern: integratedTestNamePattern } }))
