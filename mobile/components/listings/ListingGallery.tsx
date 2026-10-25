import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { type PostImage, postImageUrl } from '@/lib/posts';
import { useImageViewerStore } from '@/stores/imageViewerStore';

// The frame follows the first photo between 4:5 (tall) and 16:9 (wide); every photo is
// shown whole inside it (contain), so portrait photos are never cropped.
const MIN_RATIO = 4 / 5;
const MAX_RATIO = 16 / 9;

type Props = { images: readonly PostImage[]; kind: 'sell' | 'lost_found' };

/** Swipeable photos with page dots; a tap opens the full-screen viewer (pinch to zoom, swipe). */
function ListingGalleryImpl({ images, kind }: Props) {
  const { colors } = useTheme();
  const open = useImageViewerStore((s) => s.open);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);

  const first = images[0];
  if (!first) {
    return (
      <View
        className="h-40 items-center justify-center rounded-xl border border-hairline bg-surface2"
        accessible
        accessibilityLabel="No photos"
      >
        <Ionicons name={kind === 'sell' ? 'pricetag-outline' : 'search-outline'} size={36} color={colors.textDim} />
      </View>
    );
  }

  const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, first.width / first.height));
  const total = images.length;
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };
  const openAt = (index: number) =>
    open(
      images.map((img) => ({ uri: postImageUrl(img.path), blurhash: img.blurhash ?? null })),
      index,
    );

  return (
    <View className="gap-2">
      <View
        style={{ aspectRatio: ratio }}
        className="overflow-hidden rounded-xl bg-surface2"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {width > 0 ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScrollEnd}>
            {images.map((img, i) => (
              <Pressable
                key={img.path}
                onPress={() => openAt(i)}
                style={{ width, height: '100%' }}
                accessibilityRole="imagebutton"
                accessibilityLabel={total > 1 ? `Photo ${i + 1} of ${total}. Open full screen` : 'Photo. Open full screen'}
              >
                <Image
                  source={{ uri: postImageUrl(img.path) }}
                  placeholder={img.blurhash ? { blurhash: img.blurhash } : undefined}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  recyclingKey={img.path}
                  transition={150}
                  accessibilityIgnoresInvertColors
                />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>
      {total > 1 ? (
        <View className="flex-row justify-center gap-1.5" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {images.map((img, i) => (
            <View key={img.path} className={`h-1.5 rounded-full ${i === page ? 'w-4 bg-accent' : 'w-1.5 bg-hairline'}`} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export const ListingGallery = memo(ListingGalleryImpl);
