import { base } from '@factory/eslint-config'
// C7: providers is a leaf like seo-contracts — no CMS, no framework. The gateway is pure and testable.
export default [
  ...base,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@factory/agency-core*', 'payload', 'react', 'next', 'next/*'],
              message: 'providers is framework-free; the app wires it (ADR-030).',
            },
          ],
        },
      ],
    },
  },
]
