import { skipToken, useMutation, useQuery } from '@tanstack/react-query';

import { rpcOrThrow, useDealRefresh } from '@/hooks/useDealRefresh';
import { toCandidates } from '@/lib/itemReturns';
import { type Sale, type SaleCandidate, toSale } from '@/lib/itemSales';
import { logError } from '@/lib/log';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// Under 'item-sale' / 'item-sale-candidates': not persisted, cleared on sign-out (clearMemberCaches).
export const listingSaleKey = (viewerId: string, listingId: string) => ['item-sale', viewerId, listingId] as const;
export const saleCandidatesKey = (viewerId: string, listingId: string) => ['item-sale-candidates', viewerId, listingId] as const;

const SALE_KEYS = ['item-sale', 'item-sale-candidates'] as const;

/** The viewer's part in the listing's sale (get_listing_sale); null when there is none. `enabled` false skips it. */
export function useListingSale(listingId: string, enabled: boolean) {
  const viewerId = useAuthStore((s) => s.session?.user.id ?? null);
  return useQuery({
    queryKey: listingSaleKey(viewerId ?? '', listingId),
    queryFn:
      enabled && viewerId
        ? async (): Promise<Sale | null> => {
            const { data, error } = await supabase.rpc('get_listing_sale', { p_listing: listingId });
            if (error) {
              logError('rpc.get_listing_sale', error);
              throw error;
            }
            return toSale(data);
          }
        : skipToken,
  });
}

/** Members who commented and can be picked as the buyer (seller only). Loaded when the picker opens. */
export function useSaleCandidates(listingId: string, enabled: boolean) {
  const viewerId = useAuthStore((s) => s.session?.user.id ?? null);
  return useQuery({
    queryKey: saleCandidatesKey(viewerId ?? '', listingId),
    queryFn:
      enabled && viewerId
        ? async (): Promise<SaleCandidate[]> => {
            const { data, error } = await supabase.rpc('get_sale_candidates', { p_listing: listingId });
            if (error) {
              logError('rpc.get_sale_candidates', error);
              throw error;
            }
            return toCandidates(data);
          }
        : skipToken,
    staleTime: 0,
  });
}

/** The seller picks the buyer; the buyer must confirm. */
export function useStartSale(listingId: string) {
  const refresh = useDealRefresh(listingId, SALE_KEYS);
  return useMutation({
    mutationFn: (buyerId: string) =>
      rpcOrThrow('rpc.start_item_sale', supabase.rpc('start_item_sale', { p_listing: listingId, p_buyer: buyerId })),
    onSettled: refresh,
  });
}

/** The buyer answers a pending request. */
export function useRespondSale(listingId: string) {
  const refresh = useDealRefresh(listingId, SALE_KEYS);
  return useMutation({
    mutationFn: ({ saleId, accept }: { saleId: string; accept: boolean }) =>
      rpcOrThrow('rpc.respond_item_sale', supabase.rpc('respond_item_sale', { p_sale: saleId, p_accept: accept })),
    onSettled: refresh,
  });
}

/** The seller withdraws a pending request. */
export function useCancelSale(listingId: string) {
  const refresh = useDealRefresh(listingId, SALE_KEYS);
  return useMutation({
    mutationFn: (saleId: string) => rpcOrThrow('rpc.cancel_item_sale', supabase.rpc('cancel_item_sale', { p_sale: saleId })),
    onSettled: refresh,
  });
}
