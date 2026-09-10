import { reactApp } from '@factory/eslint-config'
export default [
  ...reactApp,
  { ignores: ['e2e/**', 'playwright.config.ts', 'vitest.config.ts', 'next.config.ts', 'next-env.d.ts'] },
]
