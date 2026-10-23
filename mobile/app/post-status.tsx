import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GuestPrompt } from '@/components/auth/GuestPrompt';
import { EmptyState, ErrorState } from '@/components/feed/ListStates';
import { PostBody } from '@/components/feed/PostBody';
import { PostImages } from '@/components/feed/PostImages';
import { BackHeader } from '@/components/layout/BackHeader';
import { StatusBadge } from '@/components/myposts/StatusBadge';
import { PostCardSkeleton } from '@/components/skeletons/PostCardSkeleton';
import { Button } from '@/components/ui/Button';
import { useDeleteOwnItem } from '@/hooks/useDeleteOwnItem';
import { useMyItem } from '@/hooks/useMyItem';
import { useMembership } from '@/hooks/useProfile';
import { getErrorMessage } from '@/lib/errors';
import { CONDITIONS } from '@/lib/createSchemas';
import { CONDITION_LABELS, formatPrice } from '@/lib/listings';
import { formatEventDate } from '@/lib/manilaDate';
import type { MyItem } from '@/lib/myPosts';

const KIND_LABEL: Record<MyItem['kind'], string> = {
  confession: 'Confession',
  shoutout: 'Shoutout',
  poll: 'Poll',
  sell: 'Sell',
  lost_found: 'Lost & Found',
};

function ReasonBlock({ item }: { item: MyItem }) {
  // Pending: never say why it is held (no keyword, no hold reason).
  if (item.status === 'pending') {
    return (
      <View className="gap-1.5 rounded-xl border border-accent bg-accent-dim p-4" accessibilityRole="summary">
        <Text accessibilityRole="header" className="text-base font-bold text-text">
          Waiting for review
        </Text>
        <Text className="text-base leading-6 text-text">A moderator will check it before it is published.</Text>
      </View>
    );
  }
  if (item.status !== 'rejected' && item.status !== 'removed') return null;
  const reason = item.rejectReason?.trim();
  return (
    <View className="gap-1.5 rounded-xl border border-danger bg-danger/10 p-4" accessibilityRole="summary">
      <Text accessibilityRole="header" className="text-base font-bold text-danger">
        {item.status === 'removed' ? 'Why it was removed' : 'Why it was not published'}
      </Text>
      <Text className="text-base leading-6 text-text" selectable>
        {reason || 'No reason was given.'}
      </Text>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row gap-2">
      <Text className="w-24 text-sm font-bold text-text-dim">{label}</Text>
      <Text className="flex-1 text-sm text-text">{value}</Text>
    </View>
  );
}

function ListingDetails({ item }: { item: MyItem }) {
  const condition = CONDITIONS.find((c) => c === item.condition);
  return (
    <View className="gap-3">
      <Text className="text-lg font-bold text-text">{item.text}</Text>
      {item.description ? <Text className="text-base leading-6 text-text">{item.description}</Text> : null}
      <View className="gap-1.5">
        {item.kind === 'sell' && item.price !== null ? <Detail label="Price" value={formatPrice(item.price)} /> : null}
        {item.kind === 'sell' && condition ? <Detail label="Condition" value={CONDITION_LABELS[condition]} /> : null}
        {item.kind === 'lost_found' && item.location ? (
          <Detail label={item.lostFoundType === 'found' ? 'Found at' : item.lostFoundType === 'lost' ? 'Lost at' : 'Where'} value={item.location} />
        ) : null}
        {item.kind === 'lost_found' && item.eventDate ? (
          <Detail
            label={item.lostFoundType === 'found' ? 'Found on' : item.lostFoundType === 'lost' ? 'Lost on' : 'When'}
            value={formatEventDate(item.eventDate)}
          />
        ) : null}
      </View>
    </View>
  );
}

function StatusContent({ item, onDelete }: { item: MyItem; onDelete: () => void }) {
  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <StatusBadge status={item.status} />
        <Text className="text-xs font-bold uppercase tracking-widest text-text-dim">
          {KIND_LABEL[item.kind]}
          {item.number !== null ? ` #${item.number}` : ''}
        </Text>
      </View>
      <ReasonBlock item={item} />
      <View className="gap-3 rounded-2xl border border-hairline bg-surface1 p-4">
        {item.source === 'post' ? (
          <PostBody postId={item.id} body={item.text} targetName={item.targetName} full />
        ) : (
          <ListingDetails item={item} />
        )}
        <PostImages images={item.images} />
      </View>
      {/* Rejected and removed items can only be deleted (edit_own_* refuses them). */}
      <Button label={item.source === 'post' ? 'Delete post' : 'Delete listing'} variant="danger" icon="trash-outline" onPress={onDelete} />
    </View>
  );
}

/** Read-only status of one of the user's own posts or listings (pending, rejected and removed items). */
export default function PostStatusScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ source?: string; id?: string }>();
  const source = params.source === 'post' || params.source === 'listing' ? params.source : null;
  const id = params.id ?? '';
  const { status } = useMembership();
  const query = useMyItem(source, id);
  const confirmDelete = useDeleteOwnItem();
  const router = useRouter();

  let body;
  if (status === 'guest') {
    body = <GuestPrompt message="Sign in to see the status of your posts." />;
  } else if (!source || !id) {
    body = <EmptyState icon="alert-circle-outline" title="This item isn't available" />;
  } else if (query.data === undefined) {
    body = query.isError ? (
      <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
    ) : (
      <PostCardSkeleton />
    );
  } else if (query.data === null) {
    body = (
      <EmptyState icon="eye-off-outline" title="This item isn't available" message="It may have been deleted." />
    );
  } else {
    const item = query.data;
    body = <StatusContent item={item} onDelete={() => confirmDelete(item, () => router.back())} />;
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <BackHeader title="Post status" />
      <ScrollView contentContainerClassName="gap-4 p-4" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {body}
      </ScrollView>
    </View>
  );
}
