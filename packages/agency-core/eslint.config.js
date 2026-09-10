import { reactApp } from '@factory/eslint-config'
// ADR-028 §2: the contracts package is a leaf; the CMS core never depends on it (the app and tools do).
export default [
  ...reactApp,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@factory/seo-contracts*'],
              message: 'agency-core must not import seo-contracts (ADR-028 §2).',
            },
          ],
        },
      ],
    },
  },
]
