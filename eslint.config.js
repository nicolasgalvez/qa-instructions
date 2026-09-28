import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    // The core is runner-independent (ADR 0001, ADR 0002): no test runner,
    // even for types, no drawing library (Highlights are drawn behind a
    // port), and nothing from the runner adapters or the CLI beside it.
    files: [
      'packages/qa-instructions/src/core/**/*.ts',
      'packages/qa-instructions/test/core/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@playwright/*',
            'playwright',
            'playwright/*',
            '@jest/*',
            'sharp',
            '**/src/playwright/**',
            '**/src/cli/**',
            '../playwright/**',
            '../cli/**',
            '../../playwright/**',
            '../../cli/**',
          ],
        },
      ],
    },
  },
  {
    // The reporter must never load Playwright at runtime; types only.
    files: ['packages/qa-instructions/src/playwright/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@playwright/*', 'playwright', 'playwright/*'],
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      '**/dist/**',
      '**/dist-test/**',
      '**/node_modules/**',
      '**/.astro/**',
      'examples/**/scripts/**',
    ],
  },
);
