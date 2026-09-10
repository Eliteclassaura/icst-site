import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import globals from 'globals'
import noHex from './rules/no-hex-in-components.js'

const factory = { rules: { 'no-hex-in-components': noHex } }

/** Base config for every package. */
export const base = tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/payload-types.ts',
      '**/migrations/**',
      '**/importMap.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser, ...globals.es2022 } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
)

/** React + a11y for apps and block packages. */
export const reactApp = tseslint.config(
  ...base,
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs['recommended-latest'].rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react/prop-types': 'off',
      // ul[role=list] is intentional: Safari/VoiceOver drop list semantics when list-style is none.
      'jsx-a11y/no-redundant-roles': ['error', { ul: ['list'], ol: ['list'] }],
      // Scrollable regions must be keyboard-reachable (axe scrollable-region-focusable); region is the sanctioned exception.
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['tabpanel', 'region'] }],
    },
  },
  {
    // Design-token discipline: no raw colours in components/blocks (ADR-006).
    files: ['**/components/**/*.{ts,tsx}', '**/blocks/**/*.{ts,tsx}', '**/*.module.css.ts'],
    ignores: ['**/*.fixture.*', '**/*.test.*', '**/*.stories.*', '**/blocks/fixtures/**'],
    plugins: { factory },
    rules: { 'factory/no-hex-in-components': 'error' },
  },
)

export default base
