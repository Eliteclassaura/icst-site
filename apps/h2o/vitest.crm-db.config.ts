/**
 * CRM-1 DB-backed test gate (Local API + REST handlers against an isolated synthetic Postgres).
 *
 * Kept out of the default `vitest run` because it needs a database; it is a separate, explicit gate:
 *
 *   H2O_CRM_TEST_DATABASE_URI=postgres://…@127.0.0.1:…/h2o_crm_synthetic pnpm --filter @factory/h2o test:crm-db
 *
 * `src/crm/__dbtests__/setup.ts` refuses any non-loopback host or any database whose name does not say
 * `synthetic`/`test`. Files run sequentially: they share one database and reset CRM tables between files.
 */
import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vitest.config'

const config = mergeConfig(
  base,
  defineConfig({
    test: {
      setupFiles: ['src/crm/__dbtests__/setup.ts'],
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 60_000,
    },
  }),
)

// mergeConfig concatenates arrays; the DB gate must run only its own files, so `include` is replaced.
config.test = { ...config.test, include: ['src/crm/__dbtests__/**/*.dbtest.ts'] }
export default config
