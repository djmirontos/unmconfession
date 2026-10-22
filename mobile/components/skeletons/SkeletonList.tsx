import type { ComponentType } from 'react';
import { View } from 'react-native';

type Props = { item: ComponentType; count?: number; columns?: 1 | 2 };

/** Renders `count` skeleton items, in one column or a two-column grid. */
export function SkeletonList({ item: Item, count = 4, columns = 1 }: Props) {
  const keys = Array.from({ length: count }, (_, i) => i);
  if (columns === 1) {
    return (
      <View className="gap-3" accessibilityLabel="Loading" accessibilityRole="progressbar">
        {keys.map((k) => (
          <Item key={k} />
        ))}
      </View>
    );
  }
  const rows = Array.from({ length: Math.ceil(count / 2) }, (_, r) => r);
  return (
    <View className="gap-3" accessibilityLabel="Loading" accessibilityRole="progressbar">
      {rows.map((r) => (
        <View key={r} className="flex-row gap-3">
          <Item />
          <Item />
        </View>
      ))}
    </View>
  );
}
