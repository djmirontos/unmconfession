import { Text } from 'react-native';

import { AppLogo } from '@/components/brand/AppLogo';
import { ComingSoon } from '@/components/layout/ComingSoon';
import { TabScreen } from '@/components/layout/TabScreen';
import { PostCardSkeleton } from '@/components/skeletons/PostCardSkeleton';
import { SkeletonList } from '@/components/skeletons/SkeletonList';
import { useAppSettings } from '@/hooks/useAppSettings';

export default function FeedScreen() {
  const { tagline } = useAppSettings();
  return (
    <TabScreen header={<AppLogo showName />}>
      <Text className="text-sm text-text-dim">{tagline}</Text>
      <ComingSoon label="The feed arrives in the next module." />
      <SkeletonList item={PostCardSkeleton} count={3} />
    </TabScreen>
  );
}
