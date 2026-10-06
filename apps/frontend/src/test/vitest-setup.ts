// Registers the jest-dom matchers (toBeInTheDocument, toBeDisabled, ...) on
// vitest's `expect`. Imported once here via vitest.config.ts `setupFiles`
// rather than per test file.
import '@testing-library/jest-dom/vitest';

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Testing Library's own auto-cleanup only self-registers when it detects a
// global `afterEach` (i.e. `test.globals: true`); this project imports test
// APIs explicitly instead, so without this the DOM from one test leaks into
// the next within the same file (e.g. two renders both matching
// `getByRole('button')`).
afterEach(() => {
  cleanup();
});
