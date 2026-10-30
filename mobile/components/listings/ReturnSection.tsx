import { useState } from 'react';
import { Alert, View } from 'react-native';

import { CandidatesSheet } from '@/components/listings/CandidatesSheet';
import { DealBanner } from '@/components/listings/DealBanner';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { useCancelReturn, useListingReturn, useRespondReturn, useReturnCandidates, useStartReturn } from '@/hooks/useListingReturn';
import { useMembership } from '@/hooks/useProfile';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { getReturnErrorMessage } from '@/lib/errors';
import { bannerText, confirmText, PICKER_EMPTY, pickerTitle, type ReturnCandidate, returnView, startLabel, startSuccess } from '@/lib/itemReturns';
import type { ListingCardData } from '@/lib/listings';
import { useAuthStore } from '@/stores/authStore';

/**
 * Confirmed returns on a Lost & Found listing (Campus Hero): the author's button and picker,
 * and the banners for the two participants. Guests and everyone else see nothing here.
 */
export function ReturnSection({ listing }: { listing: ListingCardData }) {
  const { status } = useMembership();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const member = status === 'member' && listing.kind === 'lost_found';
  const ret = useListingReturn(listing.id, member);
  const start = useStartReturn(listing.id);
  const respond = useRespondReturn(listing.id);
  const cancel = useCancelReturn(listing.id);
  const [picking, setPicking] = useState(false);
  const candidates = useReturnCandidates(listing.id, picking);
  const { run, error } = useSingleFlight(getReturnErrorMessage);

  const view = returnView({
    member,
    isAuthor: !!userId && listing.authorId === userId,
    listingKind: listing.kind,
    lostFoundType: listing.lostFoundType,
    ret: ret.data,
  });
  const busy = start.isPending || respond.isPending || cancel.isPending;

  if (view.kind === 'none') return null;

  if (view.kind === 'can_start') {
    const type = view.type;
    const pick = (candidate: ReturnCandidate) => {
      const text = confirmText(type, candidate.nickname);
      Alert.alert(text.title, text.message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: text.action,
          onPress: () =>
            run(async () => {
              await start.mutateAsync(candidate.userId);
              setPicking(false);
            }, startSuccess(type, candidate.nickname)),
        },
      ]);
    };
    return (
      <View className="gap-2">
        <Button label={startLabel(type)} variant="secondary" icon="hand-left-outline" onPress={() => setPicking(true)} disabled={busy} />
        {/* While the sheet is open its own error line shows the failure (the modal covers this one). */}
        <FormMessage tone="error" message={picking ? null : error} />
        <CandidatesSheet
          open={picking}
          title={pickerTitle(type)}
          emptyText={PICKER_EMPTY}
          candidates={candidates}
          errorText={getReturnErrorMessage}
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
    <DealBanner text={bannerText(view) ?? ''} confirmed={view.kind === 'confirmed_finder' || view.kind === 'confirmed_owner'} error={error}>
      {view.kind === 'finder_pending' ? (
        <Button
          label="Cancel request"
          variant="ghost"
          loading={cancel.isPending}
          disabled={busy}
          onPress={() => run(() => cancel.mutateAsync(view.ret.id), 'Request cancelled')}
        />
      ) : null}
      {view.kind === 'owner_pending' ? (
        <View className="gap-2">
          <Button
            label="Yes, I got it back"
            icon="checkmark"
            loading={respond.isPending && respond.variables?.accept === true}
            disabled={busy}
            onPress={() => run(() => respond.mutateAsync({ returnId: view.ret.id, accept: true }), 'Thanks! The return is confirmed.')}
          />
          <Button
            label="No, that is not me"
            variant="secondary"
            loading={respond.isPending && respond.variables?.accept === false}
            disabled={busy}
            onPress={() => run(() => respond.mutateAsync({ returnId: view.ret.id, accept: false }), 'Request declined')}
          />
        </View>
      ) : null}
    </DealBanner>
  );
}
