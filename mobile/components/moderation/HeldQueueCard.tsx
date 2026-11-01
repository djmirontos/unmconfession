import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ReasonChip, Thumb } from '@/components/moderation/ReportQueueCard';
import { atNickname } from '@/lib/blocks';
import { type HeldItem, heldItemLabel, holdLabel, targetTypeLabel } from '@/lib/moderation';
import { formatRelative } from '@/lib/time';

/** One held item in the review queue: type, why it is held (when known), a short preview, author and time. */
export const HeldQueueCard = memo(function HeldQueueCard({ item, onOpen }: { item: HeldItem; onOpen: (item: HeldItem) => void }) {
  const hold = holdLabel(item.hold);
  return (
    <Pressable
      onPress={() => onOpen(item)}
      accessibilityRole="button"
      accessibilityLabel={heldItemLabel(item)}
      accessibilityHint="Opens the item to approve or reject it"
      className="gap-2 rounded-2xl border border-hairline bg-surface1 p-4 active:bg-surface2"
    >
      <View className="flex-row items-center gap-2">
        <Text className="text-xs font-bold uppercase tracking-widest text-accent">{targetTypeLabel(item.type)}</Text>
        <Text className="ml-auto text-xs text-text-dim">Held {formatRelative(item.createdAt)}</Text>
      </View>
      {hold ? (
        <View className="flex-row">
          <ReasonChip label={hold} />
        </View>
      ) : null}
      <View className="flex-row gap-3">
        <View className="min-w-0 flex-1 gap-0.5">
          {item.title ? (
            <Text numberOfLines={1} className="text-base font-bold text-text">
              {item.title}
            </Text>
          ) : null}
          {item.body ? (
            <Text numberOfLines={item.title ? 2 : 3} className="text-sm text-text">
              {item.body}
            </Text>
          ) : null}
          {item.imageCount > 0 && !item.body && !item.title ? (
            <Text className="text-sm text-text-dim">{item.imageCount === 1 ? '1 photo' : `${item.imageCount} photos`}</Text>
          ) : null}
        </View>
        <Thumb images={item.images} count={item.imageCount} />
      </View>
      <Text numberOfLines={1} className="text-xs text-text-dim">
        By {atNickname(item.nickname)}
      </Text>
    </Pressable>
  );
});
