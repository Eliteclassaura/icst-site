import { base } from '@factory/eslint-config'
// ADR-028 §2: this package depends on zod only and never on the CMS or the app; the reverse rule lives in agency-core.
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
              message: 'seo-contracts is dependency-free (ADR-028 §2).',
            },
          ],
        },
      ],
    },
  },
]
