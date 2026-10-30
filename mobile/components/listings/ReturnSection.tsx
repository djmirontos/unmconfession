import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { ReturnCandidatesSheet } from '@/components/listings/ReturnCandidatesSheet';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { useCancelReturn, useListingReturn, useRespondReturn, useStartReturn } from '@/hooks/useListingReturn';
import { useMembership } from '@/hooks/useProfile';
import { useTheme } from '@/hooks/useTheme';
import { getReturnErrorMessage } from '@/lib/errors';
import { bannerText, confirmText, type ReturnCandidate, returnView, startLabel, startSuccess } from '@/lib/itemReturns';
import type { ListingCardData } from '@/lib/listings';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

/**
 * Confirmed returns on a Lost & Found listing (Campus Hero): the author's button and picker,
 * and the banners for the two participants. Guests and everyone else see nothing here.
 */
export function ReturnSection({ listing }: { listing: ListingCardData }) {
  const { colors } = useTheme();
  const showToast = useToastStore((s) => s.show);
  const { status } = useMembership();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const member = status === 'member' && listing.kind === 'lost_found';
  const ret = useListingReturn(listing.id, member);
  const start = useStartReturn(listing.id);
  const respond = useRespondReturn(listing.id);
  const cancel = useCancelReturn(listing.id);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One request at a time, also across a fast double tap before the state re-renders.
  const inFlight = useRef(false);

  const view = returnView({
    member,
    isAuthor: !!userId && listing.authorId === userId,
    listingKind: listing.kind,
    lostFoundType: listing.lostFoundType,
    ret: ret.data,
  });

  const run = (call: () => Promise<unknown>, success?: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    call()
      .then(() => {
        if (success) showToast(success);
      })
      .catch((e: unknown) => setError(getReturnErrorMessage(e)))
      .finally(() => {
        inFlight.current = false;
      });
  };

  const pick = (candidate: ReturnCandidate) => {
    if (view.kind !== 'can_start') return;
    const type = view.type;
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

  const busy = start.isPending || respond.isPending || cancel.isPending;

  if (view.kind === 'none') return null;

  if (view.kind === 'can_start') {
    return (
      <View className="gap-2">
        <Button label={startLabel(view.type)} variant="secondary" icon="hand-left-outline" onPress={() => setPicking(true)} disabled={busy} />
        <FormMessage tone="error" message={picking ? null : error} />
        {/* While the sheet is open its own error line shows the failure (the modal covers this one). */}
        <ReturnCandidatesSheet
          listingId={listing.id}
          type={view.type}
          open={picking}
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

  const confirmed = view.kind === 'confirmed_finder' || view.kind === 'confirmed_owner';
  return (
    <View
      className={`gap-3 rounded-2xl border p-4 ${confirmed ? 'border-hairline bg-surface1' : 'border-accent bg-accent-dim'}`}
      accessibilityRole="summary"
    >
      <View className="flex-row items-center gap-2">
        <Ionicons
          name={confirmed ? 'checkmark-circle' : 'hourglass-outline'}
          size={20}
          color={confirmed ? colors.success : colors.accent}
        />
        <Text className="flex-1 text-base text-text">{bannerText(view)}</Text>
      </View>
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
      <FormMessage tone="error" message={error} />
    </View>
  );
}
