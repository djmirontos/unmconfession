import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import type { ComponentProps } from 'react';

const MAX_AGE = 30 * 60 * 1000;

export const queryClient = new QueryClient({
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
const PERSISTED_KEYS: readonly string[] = ['app-settings', 'profile'];

export const persistOptions: ComponentProps<typeof PersistQueryClientProvider>['persistOptions'] = {
  persister: createAsyncStoragePersister({
    storage: AsyncStorage,
    key: 'unm-query-cache',
    throttleTime: 1000,
  }),
  maxAge: MAX_AGE,
  buster: '1', // bump when a persisted query's shape changes
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      query.state.status === 'success' &&
      typeof query.queryKey[0] === 'string' &&
      PERSISTED_KEYS.includes(query.queryKey[0]),
  },
};
