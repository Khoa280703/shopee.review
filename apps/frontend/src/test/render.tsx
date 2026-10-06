import type { ReactElement, ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import messages from '@/messages/vi.json';

/** Fresh QueryClient per render — no retries/caching across tests. */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function Providers({ children, queryClient }: { children: ReactNode; queryClient: QueryClient }) {
  return (
    // `now` pins next-intl's relative-time formatting (TimeAgo) so it never
    // falls back to a live Date.now() — avoids a noisy ENVIRONMENT_FALLBACK
    // warning on every render in tests.
    <NextIntlClientProvider locale="vi" messages={messages} now={new Date()}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

/** Render with the same providers every real page gets (i18n + react-query),
 * so components calling useTranslations/useQuery work without per-test mocks. */
export function renderWithProviders(
  ui: ReactElement,
  options?: RenderOptions & { queryClient?: QueryClient },
) {
  const queryClient = options?.queryClient ?? createTestQueryClient();
  return {
    queryClient,
    ...render(ui, {
      wrapper: ({ children }) => <Providers queryClient={queryClient}>{children}</Providers>,
      ...options,
    }),
  };
}
