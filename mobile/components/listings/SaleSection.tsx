import { useState } from 'react';
import { Alert, View } from 'react-native';

import { CandidatesSheet } from '@/components/listings/CandidatesSheet';
import { DealBanner } from '@/components/listings/DealBanner';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { useCancelSale, useListingSale, useRespondSale, useSaleCandidates, useStartSale } from '@/hooks/useListingSale';
import { useMembership } from '@/hooks/useProfile';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { getSaleErrorMessage } from '@/lib/errors';
import {
  SALE_PICKER_EMPTY,
  SALE_PICKER_TITLE,
  SALE_START_LABEL,
  SALE_TOASTS,
  saleBannerText,
  type SaleCandidate,
  saleConfirmText,
  saleStartSuccess,
  saleView,
} from '@/lib/itemSales';
import type { ListingCardData } from '@/lib/listings';
import { useAuthStore } from '@/stores/authStore';

/**
 * Buyer-confirmed sales on a Buy & Sell listing (Trusted Seller): the seller's button and picker,
 * and the banners for seller and buyer. Separate from the manual "mark as sold" control.
 * Guests and everyone else see nothing here.
 */
export function SaleSection({ listing }: { listing: ListingCardData }) {
  const { status } = useMembership();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const member = status === 'member' && listing.kind === 'sell';
  const sale = useListingSale(listing.id, member);
  const start = useStartSale(listing.id);
  const respond = useRespondSale(listing.id);
  const cancel = useCancelSale(listing.id);
  const [picking, setPicking] = useState(false);
  const candidates = useSaleCandidates(listing.id, picking);
  const { run, error } = useSingleFlight(getSaleErrorMessage);

  const view = saleView({
    member,
    isSeller: !!userId && listing.authorId === userId,
    listingKind: listing.kind,
    price: listing.price,
    sale: sale.data,
  });
  const busy = start.isPending || respond.isPending || cancel.isPending;

  if (view.kind === 'none') return null;

  if (view.kind === 'can_start') {
    const pick = (candidate: SaleCandidate) => {
      const text = saleConfirmText(candidate.nickname);
      Alert.alert(text.title, text.message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: text.action,
          onPress: () =>
            run(async () => {
              await start.mutateAsync(candidate.userId);
              setPicking(false);
            }, saleStartSuccess(candidate.nickname)),
        },
      ]);
    };
    return (
      <View className="gap-2">
        <Button label={SALE_START_LABEL} variant="secondary" icon="bag-check-outline" onPress={() => setPicking(true)} disabled={busy} />
        {/* While the sheet is open its own error line shows the failure (the modal covers this one). */}
        <FormMessage tone="error" message={picking ? null : error} />
        <CandidatesSheet
          open={picking}
          title={SALE_PICKER_TITLE}
          emptyText={SALE_PICKER_EMPTY}
          candidates={candidates}
          errorText={getSaleErrorMessage}
          busy={busy}
          error={error}
          onPick={pick}
          onClose={() => {
            if (!busy) setPicking(false);
          }}
        />
      </View>
    );
  }

  return (
    <DealBanner text={saleBannerText(view) ?? ''} confirmed={view.kind === 'confirmed_seller' || view.kind === 'confirmed_buyer'} error={error}>
      {view.kind === 'seller_pending' ? (
        <Button
          label="Cancel request"
          variant="ghost"
          loading={cancel.isPending}
          disabled={busy}
          onPress={() => run(() => cancel.mutateAsync(view.sale.id), SALE_TOASTS.cancelled)}
        />
      ) : null}
      {view.kind === 'buyer_pending' ? (
        <View className="gap-2">
          <Button
            label="Yes, I bought it"
            icon="checkmark"
            loading={respond.isPending && respond.variables?.accept === true}
            disabled={busy}
            onPress={() => run(() => respond.mutateAsync({ saleId: view.sale.id, accept: true }), SALE_TOASTS.accepted)}
          />
          <Button
            label="No, that is not me"
            variant="secondary"
            loading={respond.isPending && respond.variables?.accept === false}
            disabled={busy}
            onPress={() => run(() => respond.mutateAsync({ saleId: view.sale.id, accept: false }), SALE_TOASTS.declined)}
          />
        </View>
      ) : null}
    </DealBanner>
  );
}
