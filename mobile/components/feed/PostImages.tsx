import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';

import { useFlushCards } from '@/components/feed/feedCards';
import { useTheme } from '@/hooks/useTheme';
import { type PostImage, postImageUrl } from '@/lib/posts';
import { useImageViewerStore } from '@/stores/imageViewerStore';

// Two photos side by side: each keeps its ratio within these bounds.
const MIN_RATIO = 0.6;
const MAX_RATIO = 2;
// One photo fills the card width; its frame is between 4:5 (tall) and 16:9 (wide).
const SINGLE_MIN_RATIO = 4 / 5;
const SINGLE_MAX_RATIO = 16 / 9;
// Three photos: one large on the left, two stacked on the right.
const TRIPLE_RATIO = 4 / 3;

const clamp = (r: number, min: number, max: number) => Math.min(max, Math.max(min, r));

type TileProps = { image: PostImage; index: number; total: number; onOpen: (index: number) => void; style: object };

function Tile({ image, index, total, onOpen, style }: TileProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => onOpen(index)}
      style={style}
      accessibilityRole="imagebutton"
      accessibilityLabel={total > 1 ? `Photo ${index + 1} of ${total}. Open full screen` : 'Photo. Open full screen'}
    >
      <Image
        source={{ uri: postImageUrl(image.path) }}
        placeholder={image.blurhash ? { blurhash: image.blurhash } : undefined}
        // Neutral fill while loading when there is no blurhash.
        style={{ width: '100%', height: '100%', backgroundColor: colors.surface2 }}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={image.path}
        transition={150}
        accessibilityIgnoresInvertColors
      />
    </Pressable>
  );
}

/**
 * 1 photo full width, cropped to a 4:5..16:9 frame; 2 side by side at equal height (width shared
 * by aspect ratio); 3 as one large plus two small. Stored sizes keep the layout
 * stable before load. Tapping opens the full-screen viewer.
 */
export function PostImages({ images }: { images: readonly PostImage[] }) {
  const open = useImageViewerStore((s) => s.open);
  // In a flush feed card the photos span the full card width (past its 16 px padding) with square
  // corners; elsewhere they keep the rounded frame inside the card.
  const frame = useFlushCards() ? '-mx-4' : 'rounded-xl';
  if (images.length === 0) return null;

  const onOpen = (index: number) =>
    open(
      images.map((img) => ({ uri: postImageUrl(img.path), blurhash: img.blurhash ?? null })),
      index,
    );
  const total = images.length;
  const [first, second, third] = images;

  if (total >= 3 && first && second && third) {
    return (
      <View style={{ aspectRatio: TRIPLE_RATIO }} className={`flex-row gap-1 overflow-hidden ${frame}`}>
        <Tile image={first} index={0} total={total} onOpen={onOpen} style={{ flex: 2 }} />
        <View className="flex-1 gap-1">
          <Tile image={second} index={1} total={total} onOpen={onOpen} style={{ flex: 1 }} />
          <Tile image={third} index={2} total={total} onOpen={onOpen} style={{ flex: 1 }} />
        </View>
      </View>
    );
  }

  if (total === 1 && first) {
    return (
      <View
        style={{ width: '100%', aspectRatio: clamp(first.width / first.height, SINGLE_MIN_RATIO, SINGLE_MAX_RATIO) }}
        className={`overflow-hidden ${frame}`}
      >
        <Tile image={first} index={0} total={1} onOpen={onOpen} style={{ flex: 1 }} />
      </View>
    );
  }

  const ratios = images.map((img) => clamp(img.width / img.height, MIN_RATIO, MAX_RATIO));
  return (
    <View
      style={{ aspectRatio: ratios.reduce((a, b) => a + b, 0) }}
      className={`flex-row gap-1 overflow-hidden ${frame}`}
    >
      {images.map((img, i) => (
        <Tile key={img.path} image={img} index={i} total={total} onOpen={onOpen} style={{ flex: ratios[i] ?? 1 }} />
      ))}
    </View>
  );
}
