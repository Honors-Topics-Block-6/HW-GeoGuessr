import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
  // Test files: add vitest/jest globals and relax react-refresh rules
  {
    files: ['**/*.test.{js,jsx}', '**/*.spec.{js,jsx}', 'src/test/**/*.{js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  // Config files: add Node.js globals
  {
    files: ['vite.config.{js,ts}', 'vitest.config.{js,ts}', 'eslint.config.{js,ts}'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
