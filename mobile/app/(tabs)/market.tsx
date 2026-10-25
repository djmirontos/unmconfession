import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabHeader } from '@/components/layout/TabHeader';
import { ListingsSection } from '@/components/listings/ListingsSection';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { ChipGroup } from '@/components/ui/ChipGroup';
import type { ListingKind } from '@/lib/listings';

const SEGMENTS = [
  { value: 'sell', label: 'Buy & Sell' },
  { value: 'lost_found', label: 'Lost & Found' },
] as const;

// The last segment, for this app session only.
let lastSegment: ListingKind = 'sell';

export default function MarketScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<ListingKind>(lastSegment);

  const choose = (value: ListingKind) => {
    lastSegment = value;
    setSegment(value);
  };

  const openListing = useCallback((id: string) => router.push({ pathname: '/listing/[id]', params: { id } }), [router]);

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <TabHeader>
        <Text accessibilityRole="header" className="flex-1 text-xl font-bold tracking-wide text-text">
          Buy & Sell
        </Text>
        <NotificationBell />
      </TabHeader>
      <View className="px-4 pt-3">
        <ChipGroup options={SEGMENTS} value={segment} onChange={choose} accessibilityLabel="Show" />
      </View>
      {/* Both stay mounted so switching keeps each section's search, filters and scroll. */}
      <View className="flex-1" style={segment === 'sell' ? undefined : { display: 'none' }}>
        <ListingsSection kind="sell" active={segment === 'sell'} onOpen={openListing} />
      </View>
      <View className="flex-1" style={segment === 'lost_found' ? undefined : { display: 'none' }}>
        <ListingsSection kind="lost_found" active={segment === 'lost_found'} onOpen={openListing} />
      </View>
    </View>
  );
}
