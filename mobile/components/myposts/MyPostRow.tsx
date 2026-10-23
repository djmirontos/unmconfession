import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { StatusBadge, statusLabel } from '@/components/myposts/StatusBadge';
import { formatEventDate } from '@/lib/manilaDate';
import { describeReason } from '@/lib/moderationReasons';
import type { MyItem } from '@/lib/myPosts';
import { formatRelative } from '@/lib/time';

const KIND_LABEL: Record<MyItem['kind'], string> = {
  confession: 'Confession',
  shoutout: 'Shoutout',
  poll: 'Poll',
  sell: 'Sell',
  lost_found: 'Lost & Found',
};

/** "Lost" / "Found" for Lost & Found items (shown uppercase), otherwise the kind. */
function kindLabel(item: MyItem): string {
  if (item.kind === 'lost_found' && item.lostFoundType) return item.lostFoundType === 'lost' ? 'Lost' : 'Found';
  return KIND_LABEL[item.kind];
}

function detail(item: MyItem): string | null {
  if (item.status === 'pending') return 'Waiting for a moderator.';
  if (item.status === 'removed') return describeReason(item.rejectReason);
  return null;
}

/** One line under the badge for rejected items: the moderator's reason as stored. */
function rejectedLine(item: MyItem): string | null {
  if (item.status !== 'rejected') return null;
  const reason = item.rejectReason?.trim();
  return reason ? `Rejected: ${reason}` : 'Rejected';
}

/** "Lost on Oct 9 · Library 2F" / "Found on …" for Lost & Found. */
function eventLine(item: MyItem): string | null {
  if (item.kind !== 'lost_found' || !item.eventDate) return null;
  const verb = item.lostFoundType === 'lost' ? 'Lost on' : item.lostFoundType === 'found' ? 'Found on' : 'On';
  const date = `${verb} ${formatEventDate(item.eventDate)}`;
  return item.location ? `${date} · ${item.location}` : date;
}

/** Where a tap goes: published posts to their page, rejected/removed items to the status page. */
export type MyPostTarget = 'post' | 'status' | null;

export function rowTarget(item: MyItem): MyPostTarget {
  if (item.status === 'rejected' || item.status === 'removed') return 'status';
  if (item.source === 'post' && item.status === 'published') return 'post';
  return null;
}

type Props = { item: MyItem; onOpen: (item: MyItem) => void };

function MyPostRowImpl({ item, onOpen }: Props) {
  const note = detail(item);
  const rejected = rejectedLine(item);
  const event = eventLine(item);
  const openable = rowTarget(item) !== null;
  const kind = `${kindLabel(item)}${item.number !== null ? ` #${item.number}` : ''}`;
  const extras = [event, note, rejected].filter(Boolean).join('. ');

  return (
    <Pressable
      onPress={openable ? () => onOpen(item) : undefined}
      disabled={!openable}
      accessibilityRole={openable ? 'button' : undefined}
      accessibilityLabel={`${kind}, ${statusLabel(item.status)}. ${item.text}${extras ? `. ${extras}` : ''}`}
      className="gap-2 rounded-2xl border border-hairline bg-surface1 p-4 active:opacity-80"
    >
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-xs font-bold uppercase tracking-widest text-text-dim">{kind}</Text>
        <Text className="text-xs text-text-dim">{formatRelative(item.createdAt)}</Text>
      </View>
      <Text numberOfLines={2} className="text-base text-text">
        {item.text}
      </Text>
      {event ? (
        <Text numberOfLines={1} ellipsizeMode="tail" className="text-sm text-text-dim">
          {event}
        </Text>
      ) : null}
      <View className="flex-row items-center gap-2">
        <StatusBadge status={item.status} />
        {note ? (
          <Text className="flex-1 text-sm text-text-dim" numberOfLines={2}>
            {note}
          </Text>
        ) : null}
      </View>
      {rejected ? (
        <Text numberOfLines={1} ellipsizeMode="tail" className="text-sm text-danger">
          {rejected}
        </Text>
      ) : null}
    </Pressable>
  );
}

export const MyPostRow = memo(MyPostRowImpl);
