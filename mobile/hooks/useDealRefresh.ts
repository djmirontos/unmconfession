import { useQueryClient } from '@tanstack/react-query';

import { logError, logInfo } from '@/lib/log';

/**
 * After a return or sale action: that deal (`dealKeys`, e.g. ['item-return']), the listing
 * (closed state), every listing list, My Posts and the notifications.
 */
export function useDealRefresh(listingId: string, dealKeys: readonly string[]) {
  const queryClient = useQueryClient();
  return () => {
    for (const key of dealKeys) void queryClient.invalidateQueries({ queryKey: [key] });
    void queryClient.invalidateQueries({ queryKey: ['listing', listingId] });
    void queryClient.invalidateQueries({ queryKey: ['listings'] });
    void queryClient.invalidateQueries({ queryKey: ['my-item'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
  };
}

/** Awaits an rpc and throws its error (logged by label only, no ids). */
export async function rpcOrThrow(label: string, call: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await call;
  if (error) {
    logError(label, error);
    throw error;
  }
  logInfo(label, 'ok');
}
