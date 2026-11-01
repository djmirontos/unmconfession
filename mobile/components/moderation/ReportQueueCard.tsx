import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Skeleton } from '@/components/ui/Skeleton';
import { useTheme } from '@/hooks/useTheme';
import { atNickname } from '@/lib/blocks';
import { queueItemLabel, type ReportQueueItem, targetTypeLabel } from '@/lib/moderation';
import { parseImages, postImageUrl } from '@/lib/posts';
import { formatRelative } from '@/lib/time';

const CARD = 'gap-2 rounded-2xl border border-hairline bg-surface1 p-4';
const THUMB = 56;

/** Small reason pill, shared with the report detail screen. */
export function ReasonChip({ label }: { label: string }) {
  return (
    <View className="rounded-full bg-surface2 px-2.5 py-1">
      <Text className="text-xs font-semibold text-text">{label}</Text>
    </View>
  );
}

/** First photo as a small square, with "+N" for the rest; nothing without photos. Shared with the held queue. */
export function Thumb({ images, count }: { images: unknown; count: number }) {
  const { colors } = useTheme();
  const first = parseImages(images)[0];
  if (!first) return null;
  return (
    <View style={{ width: THUMB, height: THUMB }}>
      <Image
        source={{ uri: postImageUrl(first.path) }}
        placeholder={first.blurhash ? { blurhash: first.blurhash } : undefined}
        style={{ width: THUMB, height: THUMB, borderRadius: 10, backgroundColor: colors.surface2 }}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={first.path}
        accessibilityIgnoresInvertColors
      />
      {count > 1 ? (
        <View className="absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5">
          <Text className="text-[11px] font-bold text-white">+{count - 1}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** One reported item in the queue: type, count, reasons, a short preview, author and first report time. */
export const ReportQueueCard = memo(function ReportQueueCard({ item, onOpen }: { item: ReportQueueItem; onOpen: (item: ReportQueueItem) => void }) {
  const preview = item.type === 'profile' ? (item.body ?? 'Profile picture or details') : (item.body ?? '');
  const who = item.type === 'profile' ? `Profile of ${atNickname(item.nickname)}` : `By ${atNickname(item.nickname)}`;

  return (
    <Pressable
      onPress={() => onOpen(item)}
      accessibilityRole="button"
      accessibilityLabel={queueItemLabel(item)}
      accessibilityHint="Opens the item and its reports"
      className={`${CARD} active:bg-surface2`}
    >
      <View className="flex-row items-center gap-2">
        <Text className="text-xs font-bold uppercase tracking-widest text-accent">{targetTypeLabel(item.type)}</Text>
        <Text className="text-xs font-bold text-text">
          {item.reportCount} {item.reportCount === 1 ? 'report' : 'reports'}
        </Text>
        <Text className="ml-auto text-xs text-text-dim">First {formatRelative(item.firstReportedAt)}</Text>
      </View>
      {item.reasons.length > 0 ? (
        <View className="flex-row flex-wrap gap-1.5">
          {item.reasons.map((r) => (
            <ReasonChip key={r} label={r} />
          ))}
        </View>
      ) : null}
      <View className="flex-row gap-3">
        <View className="min-w-0 flex-1 gap-0.5">
          {item.title ? (
            <Text numberOfLines={1} className="text-base font-bold text-text">
              {item.title}
            </Text>
          ) : null}
          {preview ? (
            <Text numberOfLines={item.title ? 2 : 3} className="text-sm text-text">
              {preview}
            </Text>
          ) : null}
          {item.imageCount > 0 && !preview && !item.title ? (
            <Text className="text-sm text-text-dim">{item.imageCount === 1 ? '1 photo' : `${item.imageCount} photos`}</Text>
          ) : null}
        </View>
        <Thumb images={item.images} count={item.imageCount} />
      </View>
      <Text numberOfLines={1} className="text-xs text-text-dim">
        {who}
      </Text>
    </Pressable>
  );
});

export function ReportQueueCardSkeleton() {
  return (
    <View className={CARD}>
      <Skeleton width="40%" height={12} />
      <View className="flex-row gap-1.5">
        <Skeleton width={72} height={22} className="rounded-full" />
        <Skeleton width={56} height={22} className="rounded-full" />
      </View>
      <Skeleton width="90%" height={14} />
      <Skeleton width="70%" height={14} />
      <Skeleton width="30%" height={12} />
    </View>
  );
}
