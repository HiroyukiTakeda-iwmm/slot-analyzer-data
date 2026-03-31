import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: ['node_modules/', 'machines/', 'schemas/', 'coverage/', '.claude/'],
  },
];
