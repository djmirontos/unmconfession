import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import type { ListingUpdateBanner } from '@/hooks/useListingUpdates';
import { useTheme } from '@/hooks/useTheme';
import { bannerText, type ListingSection, newListingsLabel, SECTION_TITLE } from '@/lib/listingUpdates';
import { useMarketSegmentStore } from '@/stores/marketSegmentStore';

const ICON: Record<ListingSection, 'pricetag-outline' | 'search-outline'> = {
  sell: 'pricetag-outline',
  lost_found: 'search-outline',
};

type Props = { banners: readonly ListingUpdateBanner[]; onDismiss: (banner: ListingUpdateBanner) => void };

/**
 * The Feed header's "New in Buy & Sell / Lost & Found" cards: the body opens that Market segment
 * (it clears nothing); the × beside it (a sibling, never inside the body) only dismisses.
 */
export function ListingUpdateBanners({ banners, onDismiss }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const requestSegment = useMarketSegmentStore((s) => s.request);
  if (banners.length === 0) return null;

  return (
    <View className="gap-2">
      {banners.map((banner) => {
        const title = SECTION_TITLE[banner.section];
        return (
          <View key={banner.section} className="rounded-2xl border border-hairline bg-surface1">
            <Pressable
              onPress={() => {
                requestSegment(banner.section);
                router.navigate('/(tabs)/market');
              }}
              accessibilityRole="button"
              accessibilityLabel={`New in ${title}, ${newListingsLabel(banner.count)}`}
              accessibilityHint={`Opens ${title}`}
              className="min-h-11 flex-row items-center gap-2.5 rounded-2xl py-2.5 pl-4 pr-12 active:opacity-70"
            >
              <Ionicons name={ICON[banner.section]} size={18} color={colors.accent} />
              <Text numberOfLines={2} className="flex-1 text-sm font-bold text-text">
                {bannerText(banner.section, banner.count)}
              </Text>
            </Pressable>
            {/* 44 x 44 tap area in the corner, beside the body (not inside it), so it never navigates. */}
            <Pressable
              onPress={() => onDismiss(banner)}
              accessibilityRole="button"
              accessibilityLabel={`Dismiss ${title} updates`}
              className="absolute right-0 top-0 h-11 w-11 items-center justify-center rounded-full active:opacity-60"
            >
              <Ionicons name="close" size={18} color={colors.textDim} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
