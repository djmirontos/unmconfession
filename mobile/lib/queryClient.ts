import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import type { PersistedClient, PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import type { ComponentProps } from 'react';

import { logError } from '@/lib/log';

const MAX_AGE = 30 * 60 * 1000;

export const queryClient = new QueryClient({
  // Dev console: every failed query or mutation, scoped by its key. Users see lib/errors.ts text.
  queryCache: new QueryCache({
    onError: (error, query) => logError(`query ${JSON.stringify(query.queryKey)}`, error),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) =>
      logError(`mutation ${JSON.stringify(mutation.options.mutationKey ?? '(no key)')}`, error),
  }),
  defaultOptions: {
    queries: {
      // Must be >= maxAge or restored cache entries are garbage-collected immediately.
      gcTime: MAX_AGE,
      staleTime: 60 * 1000,
      retry: 2,
    },
  },
});

// Allowlist: a query is persisted only if its first key segment is listed here.
const PERSISTED_KEYS: readonly string[] = ['app-settings', 'profile', 'feed', 'announcement'];

function isInfiniteData(data: unknown): data is { pages: unknown[]; pageParams: unknown[] } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'pages' in data &&
    Array.isArray(data.pages) &&
    'pageParams' in data &&
    Array.isArray(data.pageParams)
  );
}

/** Stores only the first page of infinite queries: enough to paint the feed instantly on open. */
function serialize(client: PersistedClient): string {
  const queries = client.clientState.queries.map((query) => {
    const data = query.state.data;
    if (!isInfiniteData(data) || data.pages.length <= 1) return query;
    return {
      ...query,
      state: { ...query.state, data: { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } },
    };
  });
  return JSON.stringify({ ...client, clientState: { ...client.clientState, queries } });
}

export const persistOptions: ComponentProps<typeof PersistQueryClientProvider>['persistOptions'] = {
  persister: createAsyncStoragePersister({
    storage: AsyncStorage,
    key: 'unm-query-cache',
    throttleTime: 1000,
    serialize,
  }),
  maxAge: MAX_AGE,
  buster: '4', // bump when a persisted query's shape changes (4: announcements gained created_at, lost title)
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      query.state.status === 'success' &&
      typeof query.queryKey[0] === 'string' &&
      PERSISTED_KEYS.includes(query.queryKey[0]),
  },
};
