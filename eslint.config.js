import { base } from './tools/eslint-config/index.js'
export default [
  ...base,
  {
    ignores: [
      'legacy-reference/**',
      'spike/**',
      'docs/**',
      'apps/**',
      'packages/**',
      'tools/eslint-config/**',
    ],
  },
]
