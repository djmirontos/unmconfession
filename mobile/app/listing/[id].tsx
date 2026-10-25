import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommentThread } from '@/components/comments/CommentThread';
import { EmptyState, ErrorState, RefreshErrorBanner } from '@/components/feed/ListStates';
import { BackHeader } from '@/components/layout/BackHeader';
import { ListingDetails } from '@/components/listings/ListingDetails';
import { ContentMenu, type ContentMenuTarget } from '@/components/moderation/ContentMenu';
import { MoreButton } from '@/components/myposts/MoreButton';
import { OwnItemMenu } from '@/components/myposts/OwnItemMenu';
import { ShareIconButton } from '@/components/share/ShareIconButton';
import { ListingDetailSkeleton } from '@/components/skeletons/ListingDetailSkeleton';
import { Button } from '@/components/ui/Button';
import { useListing, useToggleListingClosed } from '@/hooks/useListing';
import { useMyItem } from '@/hooks/useMyItem';
import { useShareCard } from '@/hooks/useShareCard';
import { getErrorMessage } from '@/lib/errors';
import { listingShareKey } from '@/lib/share';
import { useAuthStore } from '@/stores/authStore';
import { usePickerOpen } from '@/stores/reactionPickerStore';

/** Buy & Sell / Lost & Found item with its comments. Guests can read it; acting needs sign-in. */
export default function ListingDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const listing = useListing(id);
  const pickerOpen = usePickerOpen();
  const toggleClosed = useToggleListingClosed();
  const share = useShareCard();

  // Own listing: Edit / Delete need the row's status and created_at (not in feed_listings).
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const data = listing.data;
  const isOwn = !!userId && data?.authorId === userId;
  const own = useMyItem(isOwn ? 'listing' : null, id);
  const [ownMenuOpen, setOwnMenuOpen] = useState(false);
  // Someone else's listing: Report / Block. Blocking its author (here or from a comment) leaves the screen.
  const [otherMenu, setOtherMenu] = useState<ContentMenuTarget | null>(null);
  const authorId = data?.authorId;
  const onAuthorBlocked = useCallback(
    (blockedId: string) => {
      if (blockedId === authorId) router.back();
    },
    [authorId, router],
  );

  const refetchError = listing.isRefetchError;
  const refetch = listing.refetch;
  const header = useMemo(
    () =>
      data ? (
        <View className="gap-4">
          {refetchError ? <RefreshErrorBanner onRetry={() => void refetch()} /> : null}
          <ListingDetails listing={data} onToggleClosed={isOwn ? toggleClosed : undefined} />
        </View>
      ) : (
        <View />
      ),
    [data, refetchError, refetch, isOwn, toggleClosed],
  );

  let body;
  if (data === undefined) {
    body = (
      <View className="p-4">
        {listing.isError ? (
          <ErrorState message={getErrorMessage(listing.error)} onRetry={() => void refetch()} />
        ) : (
          <ListingDetailSkeleton />
        )}
      </View>
    );
  } else if (data === null) {
    body = (
      <View className="gap-4 p-4">
        <EmptyState icon="eye-off-outline" title="This listing is no longer available." />
        <Button label="Back" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
    );
  } else {
    body = (
      <CommentThread
        targetType="listing"
        targetId={id}
        header={header}
        scrollEnabled={!pickerOpen}
        expectedCount={data.commentCount}
        onAuthorBlocked={onAuthorBlocked}
      />
    );
  }

  const title = data?.kind === 'lost_found' ? 'Lost & Found' : 'Listing';
  const right = !data ? undefined : isOwn ? (
    own.data ? (
      <MoreButton onPress={() => setOwnMenuOpen(true)} accessibilityLabel="More options for your listing" />
    ) : undefined
  ) : (
    <MoreButton
      onPress={() => setOtherMenu({ type: 'listing', id: data.id, authorId: data.authorId, nickname: data.nickname })}
      accessibilityLabel="More options for this listing"
    />
  );

  // Share sits left of the "⋯", for any available (published) listing.
  const headerRight = data ? (
    <View className="flex-row items-center gap-1">
      <ShareIconButton shareKey={listingShareKey(data.id)} onPress={() => void share({ type: 'listing', listing: data })} />
      {right}
    </View>
  ) : undefined;

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <BackHeader title={title} right={headerRight} />
      {body}
      <OwnItemMenu item={ownMenuOpen ? (own.data ?? null) : null} onClose={() => setOwnMenuOpen(false)} onDeleted={() => router.back()} />
      <ContentMenu target={otherMenu} onClose={() => setOtherMenu(null)} onBlocked={onAuthorBlocked} />
    </View>
  );
}
