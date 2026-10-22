import { Image } from 'expo-image';
import { View } from 'react-native';

import { type PostImage, postImageUrl } from '@/lib/posts';

// Keeps very tall or very wide images from dominating the card.
const MIN_RATIO = 0.6;
const MAX_RATIO = 2;

const clampRatio = (r: number) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));

/**
 * One image at its own aspect ratio, or two side by side at equal height (each
 * takes width in proportion to its ratio). The stored size gives a stable layout
 * before the image loads; the blurhash fills the gap.
 */
export function PostImages({ images }: { images: readonly PostImage[] }) {
  if (images.length === 0) return null;
  const ratios = images.map((img) => clampRatio(img.width / img.height));
  const rowRatio = ratios.reduce((a, b) => a + b, 0);

  return (
    <View style={{ aspectRatio: rowRatio }} className="flex-row gap-1 overflow-hidden rounded-xl">
      {images.map((img, i) => (
        <Image
          key={img.path}
          source={{ uri: postImageUrl(img.path) }}
          placeholder={img.blurhash ? { blurhash: img.blurhash } : undefined}
          style={{ flex: ratios[i] ?? 1, height: '100%' }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={img.path}
          transition={150}
          accessibilityIgnoresInvertColors
          accessibilityLabel={images.length > 1 ? `Image ${i + 1} of ${images.length}` : 'Image'}
        />
      ))}
    </View>
  );
}
