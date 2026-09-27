import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    // The core is runner-independent (ADR 0001): no test runner, even for types.
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['@playwright/*', 'playwright', 'playwright/*', '@jest/*'],
        },
      ],
    },
  },
  {
    // The reporter must never load Playwright at runtime; types only.
    files: ['packages/playwright/src/reporter/**/*.ts'],
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
