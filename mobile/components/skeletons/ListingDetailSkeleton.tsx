import { View } from 'react-native';

import { Skeleton } from '@/components/ui/Skeleton';

/** Shape of the listing screen: seller row, gallery, tags, price, title, description. */
export function ListingDetailSkeleton() {
  return (
    <View className="gap-4" accessibilityLabel="Loading" accessibilityRole="progressbar">
      <View className="gap-3">
        <View className="flex-row items-center gap-3">
          <Skeleton width={36} height={36} className="rounded-full" />
          <View className="flex-1 gap-2">
            <Skeleton width="40%" height={12} />
            <Skeleton width="25%" height={10} />
          </View>
        </View>
        <Skeleton height={240} className="rounded-xl" />
      </View>
      <View className="gap-2">
        <Skeleton width={64} height={24} className="rounded-full" />
        <Skeleton width="35%" height={28} />
        <Skeleton width="70%" height={18} />
        <Skeleton height={12} />
        <Skeleton width="80%" height={12} />
      </View>
    </View>
  );
}
