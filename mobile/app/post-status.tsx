import { useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, ErrorState } from '@/components/feed/ListStates';
import { PostBody } from '@/components/feed/PostBody';
import { PostImages } from '@/components/feed/PostImages';
import { BackHeader } from '@/components/layout/BackHeader';
import { StatusBadge } from '@/components/myposts/StatusBadge';
import { PostCardSkeleton } from '@/components/skeletons/PostCardSkeleton';
import { Button } from '@/components/ui/Button';
import { useMyItem } from '@/hooks/useMyItem';
import { useMembership } from '@/hooks/useProfile';
import { useRequireAuth } from '@/hooks/useRequireAuth';
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
        {item.kind === 'lost_found' && item.location ? <Detail label="Where" value={item.location} /> : null}
        {item.kind === 'lost_found' && item.eventDate ? (
          <Detail label="When" value={formatEventDate(item.eventDate)} />
        ) : null}
      </View>
    </View>
  );
}

function StatusContent({ item }: { item: MyItem }) {
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
      {/* Edit and Delete actions go here in a later module. */}
    </View>
  );
}

function GuestPrompt() {
  const requireAuth = useRequireAuth();
  return (
    <View className="gap-3 rounded-2xl border border-hairline bg-surface1 p-4">
      <Text className="text-base text-text">Sign in to see the status of your posts.</Text>
      <Button label="Sign in" onPress={() => requireAuth('default')} />
    </View>
  );
}

/** Read-only status of one of the user's own posts or listings (used for rejected and removed items). */
export default function PostStatusScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ source?: string; id?: string }>();
  const source = params.source === 'post' || params.source === 'listing' ? params.source : null;
  const id = params.id ?? '';
  const { status } = useMembership();
  const query = useMyItem(source, id);

  let body;
  if (status === 'guest') {
    body = <GuestPrompt />;
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
    body = <StatusContent item={query.data} />;
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
