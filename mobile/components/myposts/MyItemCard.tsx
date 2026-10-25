import { memo } from 'react';
import { Text, View } from 'react-native';

import { PostCard } from '@/components/feed/PostCard';
import { ListingCard } from '@/components/listings/ListingCard';
import { MoreButton } from '@/components/myposts/MoreButton';
import { StatusBadge } from '@/components/myposts/StatusBadge';
import { describeReason } from '@/lib/moderationReasons';
import type { MyItem } from '@/lib/myPosts';

/** Where a tap goes: published items to their page; pending, rejected and removed items to the status page. */
export type MyPostTarget = 'post' | 'listing' | 'status';

export function rowTarget(item: MyItem): MyPostTarget {
  if (item.status !== 'published') return 'status';
  return item.source;
}

function detail(item: MyItem): string | null {
  if (item.status === 'pending') return 'Waiting for a moderator.';
  if (item.status === 'removed') return describeReason(item.rejectReason);
  return null;
}

/** One line for rejected items: the moderator's reason as stored. */
function rejectedLine(item: MyItem): string | null {
  if (item.status !== 'rejected') return null;
  const reason = item.rejectReason?.trim();
  return reason ? `Rejected: ${reason}` : 'Rejected';
}

function Footer({ item }: { item: MyItem }) {
  const note = detail(item);
  const rejected = rejectedLine(item);
  if (!note && !rejected) return null;
  return (
    <View className="gap-1">
      {note ? <Text className="text-sm text-text-dim">{note}</Text> : null}
      {rejected ? (
        <Text numberOfLines={1} ellipsizeMode="tail" className="text-sm text-danger">
          {rejected}
        </Text>
      ) : null}
    </View>
  );
}

type Props = { item: MyItem; onOpen: (item: MyItem) => void; onMore: (item: MyItem) => void };

/** My Posts entry: the Feed's post card or the listing card, read-only, with status, "⋯" and the review note. */
function MyItemCardImpl({ item, onOpen, onMore }: Props) {
  const accessory = (
    <View className="flex-row items-center gap-1">
      <StatusBadge status={item.status} />
      <MoreButton onPress={() => onMore(item)} />
    </View>
  );
  const open = () => onOpen(item);
  const published = item.status === 'published';

  if (item.feedPost) {
    return (
      <PostCard
        post={item.feedPost}
        onOpen={open}
        showCounts={published}
        headerAccessory={accessory}
        footer={<Footer item={item} />}
      />
    );
  }
  if (item.listingCard) {
    return (
      <ListingCard
        listing={item.listingCard}
        onOpen={open}
        showCommentCount={published}
        headerAccessory={accessory}
        footer={<Footer item={item} />}
      />
    );
  }
  return null;
}

export const MyItemCard = memo(MyItemCardImpl);
