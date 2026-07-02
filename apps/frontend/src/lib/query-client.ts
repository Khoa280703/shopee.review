import { QueryClient, isServer } from '@tanstack/react-query';

// staleTime MUST be set — default 0 refetches on every mount and defeats caching.
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000, // feed-friendly default; detail overrides to 5m
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (isServer) {
    // Always a fresh client on the server (per request).
    return makeQueryClient();
  }
  // Stable singleton in the browser across renders.
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
