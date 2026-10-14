import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '.tools/**',
      '.pnpm-store/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['packages/core/src/**/*.ts', 'packages/protocol/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@itch/vision', '@itch/scratch', '@itch/devtools', '@itch/test-utils'] },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'HTMLVideoElement',
        'MediaStream',
        'ImageData',
      ],
    },
  },
  {
    files: ['packages/scratch/src/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['@itch/vision', '@itch/devtools'] }] },
  },
);
