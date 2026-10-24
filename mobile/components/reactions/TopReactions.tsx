import { Image } from 'expo-image';
import { memo } from 'react';
import { Text, View } from 'react-native';

import { REACTIONS, type ReactionType } from '@/lib/reactions';

const SIZE = { default: 20, compact: 14 } as const;
// Each next emoji overlaps the previous one by ~35%.
const OVERLAP = 0.35;
const RING = 1.5;

type Props = {
  types: readonly ReactionType[];
  total: number;
  compact?: boolean;
  /** The surface behind the stack, so the ring separates the emoji cleanly. */
  ring?: 'surface1' | 'bg';
};

/** Width the stack and count need, for callers that hide it when the row is tight. */
export function topReactionsWidth(count: number, total: number, compact = false): number {
  if (count === 0 || total <= 0) return 0;
  const size = SIZE[compact ? 'compact' : 'default'] + RING * 2;
  const icons = size + (count - 1) * size * (1 - OVERLAP);
  const digits = String(total).length * (compact ? 7 : 8);
  return icons + 4 + digits;
}

/** Facebook-style stack of the most used reactions (first on top), then the total. Nothing at 0. */
function TopReactionsImpl({ types, total, compact = false, ring = 'surface1' }: Props) {
  if (types.length === 0 || total <= 0) return null;
  const size = SIZE[compact ? 'compact' : 'default'];
  const outer = size + RING * 2;
  const names = types.map((t) => REACTIONS[t].label).join(', ');

  return (
    <View
      className="flex-row items-center gap-1"
      accessible
      accessibilityLabel={`${total} ${total === 1 ? 'reaction' : 'reactions'}: ${names}`}
    >
      <View className="flex-row items-center">
        {types.map((t, i) => (
          <View
            key={t}
            style={{
              width: outer,
              height: outer,
              borderRadius: outer / 2,
              borderWidth: RING,
              marginLeft: i === 0 ? 0 : -outer * OVERLAP,
              zIndex: types.length - i,
            }}
            className={`items-center justify-center ${ring === 'bg' ? 'border-bg bg-bg' : 'border-surface1 bg-surface1'}`}
          >
            <Image source={REACTIONS[t].image} style={{ width: size, height: size }} contentFit="contain" />
          </View>
        ))}
      </View>
      <Text className={`${compact ? 'text-xs' : 'text-sm'} font-bold text-text-dim`}>{total}</Text>
    </View>
  );
}

export const TopReactions = memo(TopReactionsImpl);
