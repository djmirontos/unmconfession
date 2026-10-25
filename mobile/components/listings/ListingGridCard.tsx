import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { closedLabel, formatPrice, type ListingCardData } from '@/lib/listings';
import { postImageUrl } from '@/lib/posts';

type Props = { listing: ListingCardData; onOpen: (id: string) => void };

/** Buy & Sell grid tile: square first photo (or a placeholder), price and a two-line title. */
function ListingGridCardImpl({ listing, onOpen }: Props) {
  const { colors } = useTheme();
  const first = listing.images[0];
  const price = listing.price !== null ? formatPrice(listing.price) : null;
  const label = [listing.title, price, listing.isClosed ? closedLabel(listing) : null].filter(Boolean).join(', ');

  return (
    <Pressable
      onPress={() => onOpen(listing.id)}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="overflow-hidden rounded-2xl border border-hairline bg-surface1 active:opacity-80"
    >
      <View className="aspect-square bg-surface2">
        {first ? (
          <Image
            source={{ uri: postImageUrl(first.path) }}
            placeholder={first.blurhash ? { blurhash: first.blurhash } : undefined}
            style={{ width: '100%', height: '100%', opacity: listing.isClosed ? 0.6 : 1 }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={first.path}
            transition={150}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Ionicons name="pricetag-outline" size={32} color={colors.textDim} />
          </View>
        )}
        {listing.isClosed ? (
          <Text className="absolute left-2 top-2 rounded-full bg-accent px-2.5 py-1 text-xs font-bold uppercase text-on-accent">
            {closedLabel(listing)}
          </Text>
        ) : null}
      </View>
      {/* Fixed line heights (price line + two title lines), so every tile in a row is the same height. */}
      <View className="px-2.5 pb-2.5 pt-2">
        <Text numberOfLines={1} className="h-6 text-base font-bold leading-6 text-accent">
          {price ?? ' '}
        </Text>
        <Text numberOfLines={2} ellipsizeMode="tail" className="h-10 text-sm leading-5 text-text">
          {listing.title}
        </Text>
      </View>
    </Pressable>
  );
}

export const ListingGridCard = memo(ListingGridCardImpl);
