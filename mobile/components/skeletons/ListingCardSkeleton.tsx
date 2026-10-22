import { View } from 'react-native';

import { Skeleton } from '@/components/ui/Skeleton';

/** Shape of a Buy & Sell card: image, title, price, meta line. */
export function ListingCardSkeleton() {
  return (
    <View className="flex-1 gap-2 rounded-2xl border border-hairline bg-surface1 p-3">
      <Skeleton height={120} className="rounded-xl" />
      <Skeleton width="80%" height={12} />
      <Skeleton width="40%" height={14} />
      <Skeleton width="55%" height={10} />
    </View>
  );
}
