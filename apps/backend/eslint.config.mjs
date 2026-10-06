// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Type-aware linting only for files covered by tsconfig.spec.json (src +
    // test, the same project the editor/IDE already uses for test files) —
    // cheap because it reuses that tsconfig instead of a full
    // strict-type-checked preset, which would need a much bigger pass to
    // clear on a 100+ file NestJS codebase.
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.spec.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      // NestJS decorators commonly take an empty constructor/parameter object;
      // interfaces-only DI tokens also trip no-empty-object-type.
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      // Test doubles intentionally cast loosely-typed mocks `as never` and
      // build partial Prisma payloads — real `any` escapes, not laziness.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  },
);
