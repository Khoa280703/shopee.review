import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  // next/typescript already wires up @typescript-eslint; core-web-vitals adds
  // the react-hooks/jsx-a11y/next rule set Next's own template ships with.
  // Scoped to `src/**` — the type-aware parser needs every linted file inside
  // tsconfig.json's own `include` (src only), which is also what the
  // `next lint`-era setup always limited itself to; root tooling config
  // (next.config.ts, tailwind.config.ts, vitest.config.ts, ...) was never
  // covered by that and isn't part of this pass either.
  ...compat.extends('next/core-web-vitals', 'next/typescript').map((config) => ({
    ...config,
    files: ['src/**/*.{js,jsx,ts,tsx}'],
  })),
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];
