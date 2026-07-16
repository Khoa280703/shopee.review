'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

/**
 * Wraps next-themes: toggles a `dark` class on <html> and persists the choice.
 * `defaultTheme="system"` + `enableSystem` so first-time visitors follow their OS
 * preference; the app renders correctly before hydration (no flash) because
 * next-themes injects a blocking script.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
