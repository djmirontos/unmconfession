import { ComingSoon } from '@/components/layout/ComingSoon';
import { TabScreen } from '@/components/layout/TabScreen';
import { ListingCardSkeleton } from '@/components/skeletons/ListingCardSkeleton';
import { SkeletonList } from '@/components/skeletons/SkeletonList';

export default function MarketScreen() {
  return (
    <TabScreen title="Buy & Sell">
      <ComingSoon label="Listings with the Lost & Found toggle arrive in a later module." />
      <SkeletonList item={ListingCardSkeleton} count={4} columns={2} />
    </TabScreen>
  );
}
