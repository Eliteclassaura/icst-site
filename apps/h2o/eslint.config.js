import { reactApp } from '@factory/eslint-config'
export default [...reactApp, { ignores: ['next.config.ts', 'next-env.d.ts', 'vitest.config.ts'] }]
