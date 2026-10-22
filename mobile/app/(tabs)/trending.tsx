import { ComingSoon } from '@/components/layout/ComingSoon';
import { TabScreen } from '@/components/layout/TabScreen';
import { PostCardSkeleton } from '@/components/skeletons/PostCardSkeleton';
import { SkeletonList } from '@/components/skeletons/SkeletonList';

export default function TrendingScreen() {
  return (
    <TabScreen title="Trending">
      <ComingSoon label="Most reacted this week and active polls arrive in a later module." />
      <SkeletonList item={PostCardSkeleton} count={3} />
    </TabScreen>
  );
}
