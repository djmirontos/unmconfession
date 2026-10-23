import { memo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PostCounts } from '@/components/feed/PostActions';
import { AuthorLine } from '@/components/feed/AuthorLine';
import { CardTag } from '@/components/feed/CardTag';
import { PostBody } from '@/components/feed/PostBody';
import { PostImages } from '@/components/feed/PostImages';
import { CONDITIONS } from '@/lib/createSchemas';
import { CONDITION_LABELS, formatEventLine, formatPrice, type ListingCardData } from '@/lib/listings';

function typeLabel(listing: ListingCardData): string {
  if (listing.kind === 'sell') return 'SELL';
  return listing.lostFoundType === 'found' ? 'FOUND' : listing.lostFoundType === 'lost' ? 'LOST' : 'LOST & FOUND';
}

type Props = {
  listing: ListingCardData;
  /** Omit when there is nowhere to go (no listing detail screen yet). */
  onOpen?: (id: string) => void;
  /** Show the comment count read-only (published listings). */
  showCommentCount?: boolean;
  /** After the type label in the header (My Posts: status badge and "⋯"). */
  headerAccessory?: ReactNode;
  /** Below the card content (My Posts: review or rejection note). */
  footer?: ReactNode;
};

function ListingCardImpl({ listing, onOpen, showCommentCount = false, headerAccessory, footer }: Props) {
  const condition = CONDITIONS.find((c) => c === listing.condition);
  const eventLine = listing.kind === 'lost_found' ? formatEventLine(listing.lostFoundType, listing.eventDate, listing.location) : null;

  const content = (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <AuthorLine nickname={listing.nickname} avatarKey={listing.avatarKey} time={listing.time} editedAt={listing.editedAt} />
        <CardTag label={typeLabel(listing)} />
        {headerAccessory}
      </View>
      <Text className="text-lg font-bold text-text">{listing.title}</Text>
      {listing.kind === 'sell' ? (
        <View className="flex-row items-center gap-2">
          {listing.price !== null ? <Text className="text-lg font-bold text-accent">{formatPrice(listing.price)}</Text> : null}
          {condition ? (
            <Text className="rounded-full border border-hairline px-2.5 py-0.5 text-xs font-bold text-text-dim">
              {CONDITION_LABELS[condition]}
            </Text>
          ) : null}
        </View>
      ) : eventLine ? (
        <Text numberOfLines={1} ellipsizeMode="tail" className="text-sm text-text-dim">
          {eventLine}
        </Text>
      ) : null}
      {listing.description ? <PostBody postId={listing.id} body={listing.description} targetName={null} /> : null}
      <PostImages images={listing.images} />
    </View>
  );

  return (
    <View className="gap-3 rounded-2xl border border-hairline bg-surface1 p-4">
      {onOpen ? (
        <Pressable onPress={() => onOpen(listing.id)} accessibilityRole="button" className="active:opacity-80">
          {content}
        </Pressable>
      ) : (
        content
      )}
      {showCommentCount ? <PostCounts commentCount={listing.commentCount} /> : null}
      {footer}
    </View>
  );
}

/** Buy & Sell / Lost & Found card, same frame and parts as the post card. Reused by the Buy & Sell tab later. */
export const ListingCard = memo(ListingCardImpl);
