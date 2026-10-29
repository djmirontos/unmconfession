import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

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
  /** Opens the "who reacted" sheet; without it the stack is display only (My Posts). */
  onPress?: () => void;
};

// Touch target at least 44 px tall without moving anything.
const MIN_TARGET = 44;

/** Width the stack and count need, for callers that hide it when the row is tight. */
export function topReactionsWidth(count: number, total: number, compact = false): number {
  if (count === 0 || total <= 0) return 0;
  const size = SIZE[compact ? 'compact' : 'default'] + RING * 2;
  const icons = size + (count - 1) * size * (1 - OVERLAP);
  const digits = String(total).length * (compact ? 7 : 8);
  return icons + 4 + digits;
}

/** Facebook-style stack of the most used reactions (first on top), then the total. Nothing at 0. */
function TopReactionsImpl({ types, total, compact = false, ring = 'surface1', onPress }: Props) {
  if (types.length === 0 || total <= 0) return null;
  const size = SIZE[compact ? 'compact' : 'default'];
  const outer = size + RING * 2;
  const names = types.map((t) => REACTIONS[t].label).join(', ');
  const summary = `${total} ${total === 1 ? 'reaction' : 'reactions'}: ${names}`;
  const stack = (
    <>
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
    </>
  );

  if (!onPress) {
    return (
      <View className="flex-row items-center gap-1" accessible accessibilityLabel={summary}>
        {stack}
      </View>
    );
  }
  const slop = Math.max(0, Math.ceil((MIN_TARGET - outer) / 2));
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: slop, bottom: slop, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel="See who reacted"
      accessibilityHint={summary}
      className="flex-row items-center gap-1 rounded-full active:opacity-70"
    >
      {stack}
    </Pressable>
  );
}

export const TopReactions = memo(TopReactionsImpl);
