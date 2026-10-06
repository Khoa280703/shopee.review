import { defineConfig } from 'vitest/config';

// Scoped to plain-TS unit tests only (e.g. safeNext, H1) — no jsdom/React
// Testing Library setup here. Component tests would need that additional
// infra; none exist yet, so it's left out rather than added speculatively.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
