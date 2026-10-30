import { View } from 'react-native';

import { cardClass, cardGap, cardOuterGap, useFlushCards } from '@/components/feed/feedCards';
import { Skeleton } from '@/components/ui/Skeleton';

/** Shape of a feed card: avatar + nickname row, three body lines, action bar. */
export function PostCardSkeleton() {
  const flush = useFlushCards();
  // Same gaps as PostCard: 8 inside the content, then the outer gap (4 in a feed) before the action row.
  return (
    <View className={`${cardOuterGap(flush)} ${cardClass(flush)}`}>
      <View className={cardGap(flush)}>
        <View className="flex-row items-center gap-3">
          <Skeleton width={36} height={36} className="rounded-full" />
          <View className="flex-1 gap-2">
            <Skeleton width="40%" height={12} />
            <Skeleton width="25%" height={10} />
          </View>
        </View>
        <Skeleton height={12} />
        <Skeleton height={12} />
        <Skeleton width="70%" height={12} />
      </View>
      {/* Same height as the real action row (36), so nothing jumps when posts load. */}
      <View className="h-9 flex-row items-center gap-4">
        <Skeleton width={56} height={24} className="rounded-full" />
        <Skeleton width={56} height={24} className="rounded-full" />
      </View>
    </View>
  );
}
