import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { type Return, type ReturnCandidate, toCandidates, toReturn } from '@/lib/itemReturns';
import { logError, logInfo } from '@/lib/log';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// Under 'item-return' / 'item-return-candidates': not persisted, cleared on sign-out (clearMemberCaches).
export const listingReturnKey = (viewerId: string, listingId: string) => ['item-return', viewerId, listingId] as const;
export const returnCandidatesKey = (viewerId: string, listingId: string) => ['item-return-candidates', viewerId, listingId] as const;

/** The viewer's part in the listing's return (get_listing_return); null when there is none. `enabled` false skips it. */
export function useListingReturn(listingId: string, enabled: boolean) {
  const viewerId = useAuthStore((s) => s.session?.user.id ?? null);
  return useQuery({
    queryKey: listingReturnKey(viewerId ?? '', listingId),
    queryFn:
      enabled && viewerId
        ? async (): Promise<Return | null> => {
            const { data, error } = await supabase.rpc('get_listing_return', { p_listing: listingId });
            if (error) {
              logError('rpc.get_listing_return', error);
              throw error;
            }
            return toReturn(data);
          }
        : skipToken,
  });
}

/** Members who commented and can be picked (author only). Loaded when the picker opens. */
export function useReturnCandidates(listingId: string, enabled: boolean) {
  const viewerId = useAuthStore((s) => s.session?.user.id ?? null);
  return useQuery({
    queryKey: returnCandidatesKey(viewerId ?? '', listingId),
    queryFn:
      enabled && viewerId
        ? async (): Promise<ReturnCandidate[]> => {
            const { data, error } = await supabase.rpc('get_return_candidates', { p_listing: listingId });
            if (error) {
              logError('rpc.get_return_candidates', error);
              throw error;
            }
            return toCandidates(data);
          }
        : skipToken,
    staleTime: 0,
  });
}

/** After any return action: the return, the listing (closed state), every listing list and the notifications. */
function useRefreshAfterReturn(listingId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['item-return'] });
    void queryClient.invalidateQueries({ queryKey: ['item-return-candidates'] });
    void queryClient.invalidateQueries({ queryKey: ['listing', listingId] });
    void queryClient.invalidateQueries({ queryKey: ['listings'] });
    void queryClient.invalidateQueries({ queryKey: ['my-item'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
  };
}

async function rpcOrThrow(label: string, call: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await call;
  if (error) {
    logError(label, error);
    throw error;
  }
  logInfo(label, 'ok');
}

/** The author picks the other member: confirmed at once on a lost post, a request on a found post. */
export function useStartReturn(listingId: string) {
  const refresh = useRefreshAfterReturn(listingId);
  return useMutation({
    mutationFn: (userId: string) =>
      rpcOrThrow('rpc.start_item_return', supabase.rpc('start_item_return', { p_listing: listingId, p_user: userId })),
    onSettled: refresh,
  });
}

/** The owner answers a pending request. */
export function useRespondReturn(listingId: string) {
  const refresh = useRefreshAfterReturn(listingId);
  return useMutation({
    mutationFn: ({ returnId, accept }: { returnId: string; accept: boolean }) =>
      rpcOrThrow('rpc.respond_item_return', supabase.rpc('respond_item_return', { p_return: returnId, p_accept: accept })),
    onSettled: refresh,
  });
}

/** The author withdraws a pending request. */
export function useCancelReturn(listingId: string) {
  const refresh = useRefreshAfterReturn(listingId);
  return useMutation({
    mutationFn: (returnId: string) => rpcOrThrow('rpc.cancel_item_return', supabase.rpc('cancel_item_return', { p_return: returnId })),
    onSettled: refresh,
  });
}
