import path from 'node:path';
import { defineConfig } from 'vitest/config';

// jsdom covers both the plain-TS unit tests (safeNext) and the component
// tests added alongside it (follow-button, bookmark-button, reaction-button,
// comments-section, home-feed-tabs, admin page) — jsdom is a strict superset
// of what a node-environment test needs, so one environment for the whole
// suite keeps this config simple.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/vitest-setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
});
