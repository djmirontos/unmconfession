import { View } from 'react-native';

import { Skeleton } from '@/components/ui/Skeleton';

/** Shape of a feed card: avatar + nickname row, three body lines, action bar. */
export function PostCardSkeleton() {
  return (
    <View className="gap-3 rounded-2xl border border-hairline bg-surface1 p-4">
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
      <View className="flex-row gap-4 pt-1">
        <Skeleton width={56} height={24} className="rounded-full" />
        <Skeleton width={56} height={24} className="rounded-full" />
      </View>
    </View>
  );
}
